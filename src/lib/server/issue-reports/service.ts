/**
 * Casos de uso de «Mis reportes» (#340).
 *
 * Sin `Response`: los endpoints traducen los errores. El `userId` siempre viene
 * del principal autenticado y la propiedad se comprueba fila a fila; el número
 * de issue que llega por la URL nunca autoriza nada por sí solo.
 */

import { Effect } from 'effect'

import type { RuntimeEnv } from '../cloudflare-env'
import { Database, type DatabaseError } from '../../../db/database'
import * as issueReportsRepository from '../../../db/repositories/issue-reports'
import { nowIso } from '../../../db/repositories/shared'
import {
  buildReporterCommentBody,
  classifyComment,
  parseReporterComment,
  type RawComment,
} from '../../../domain/reports/reporter-comment'
import type {
  AvailableReportEntry,
  IssueNode,
  ReportDetail,
  ReportEntry,
  ReportIssueRef,
  ThreadAttachment,
  ThreadItem,
} from '../../../domain/reports/report-entry'
import { buildAvailableEntry, resolveFollowed } from '../../../domain/reports/report-status'
import { computeHasUpdates } from '../../../domain/reports/report-updates'
import { fetchRepositoryId, githubConfig, once, type GithubConfig } from '../github-api'
import { Http } from '../http'
import { uploadIssueAttachment } from '../issue-attachments'
import type { ResolvedAttachment } from '../issue-report-schema'
import {
  createComment as createGithubComment,
  deleteComment as deleteGithubComment,
  fetchComment as fetchGithubComment,
  fetchIssueChain,
  fetchIssueThread,
  resolveBotLogin,
  updateComment as updateGithubComment,
  type GraphIssueNode,
} from './github'
import {
  CommentForbiddenError,
  ReportClosedError,
  ReportInputError,
  ReportNotFoundError,
  ReportsGithubError,
  type ReportsError,
} from './errors'
import type { CommentUpdateInput } from './comment-schema'

const LIST_LIMIT = 100

function toGithubError(error: { message: string; status?: number }): ReportsGithubError {
  return new ReportsGithubError({
    message: error.message,
    ...(error.status === undefined ? {} : { status: error.status }),
  })
}

function loadConfig(env: RuntimeEnv) {
  return githubConfig(env).pipe(Effect.mapError(toGithubError))
}

function toRef(node: IssueNode): ReportIssueRef {
  return {
    number: node.number,
    url: node.url,
    title: node.title,
    state: node.state,
    stateReason: node.stateReason,
  }
}

function latestIso(a: string | null | undefined, b: string | null | undefined): string | null {
  const first = a ? Date.parse(a) : Number.NaN
  const second = b ? Date.parse(b) : Number.NaN
  if (!Number.isFinite(first) && !Number.isFinite(second)) return null
  if (!Number.isFinite(first)) return b ?? null
  if (!Number.isFinite(second)) return a ?? null
  return first >= second ? (a as string) : (b as string)
}

function latestMaintainerAt(
  comments: RawComment[],
  context: { userId: string; botLogin: string | null },
): string | null {
  let latest: string | null = null
  for (const comment of comments) {
    // Sin login del bot no se puede distinguir una aclaración propia de un
    // comentario del mantenedor: la lista degrada a solo cambios de estado.
    if (!context.botLogin) continue
    if (
      classifyComment(comment, { userId: context.userId, botLogin: context.botLogin }) !==
      'maintainer'
    ) {
      continue
    }
    latest = latestIso(latest, comment.createdAt)
  }
  return latest
}

function buildEntry(
  node: GraphIssueNode,
  row: { issueNumber: number; submittedAt: string; lastSeenAt: string },
  context: { userId: string; botLogin: string | null },
): AvailableReportEntry {
  const repository = node.repository?.nameWithOwner ?? ''
  const resolved = resolveFollowed(node, repository)
  const statusChangedAt = latestIso(
    node.statusChangedAt,
    resolved.followed?.statusChangedAt ?? null,
  )
  const latestComment = resolved.followed
    ? latestMaintainerAt(resolved.followed.recentComments, context)
    : null
  return buildAvailableEntry(node, resolved, {
    submittedAt: row.submittedAt,
    lastSeenAt: row.lastSeenAt,
    statusChangedAt,
    hasUpdates: computeHasUpdates({
      lastSeenAt: row.lastSeenAt,
      statusChangedAt,
      latestMaintainerCommentAt: latestComment,
    }),
  }) as AvailableReportEntry
}

function unavailableEntry(row: {
  issueNumber: number
  submittedAt: string
  lastSeenAt: string
}): ReportEntry {
  return {
    number: row.issueNumber,
    unavailable: true,
    submittedAt: row.submittedAt,
    lastSeenAt: row.lastSeenAt,
    hasUpdates: false,
  }
}

function threadItem(comment: RawComment, kind: 'mine' | 'maintainer', open: boolean): ThreadItem {
  const parsed = kind === 'mine' ? parseReporterComment(comment.body) : null
  const editedAt =
    comment.updatedAt && Date.parse(comment.updatedAt) > Date.parse(comment.createdAt)
      ? comment.updatedAt
      : null
  return {
    id: comment.databaseId,
    kind: kind === 'mine' ? 'reporter' : 'maintainer',
    author: kind === 'mine' ? 'Tú' : (comment.author?.login ?? 'Mantenedor'),
    createdAt: comment.createdAt,
    editedAt,
    text: parsed?.text ?? comment.body,
    attachments: parsed?.attachments ?? [],
    editable: kind === 'mine' && open,
  }
}

function mapThread(
  comments: RawComment[],
  context: { userId: string; botLogin: string },
  open: boolean,
): ThreadItem[] {
  const items: ThreadItem[] = []
  for (const comment of comments) {
    const kind = classifyComment(comment, context)
    if (kind === 'automation' || kind === 'hidden') continue
    items.push(threadItem(comment, kind, open))
  }
  return items
}

function uploadAttachments(
  config: GithubConfig,
  attachments: ResolvedAttachment[],
): Effect.Effect<ThreadAttachment[], ReportsGithubError, Http> {
  return Effect.gen(function* () {
    if (attachments.length === 0) return []
    const { request } = yield* Http
    return yield* Effect.tryPromise({
      try: () => uploadAll(request, config, attachments),
      catch: (error) =>
        error instanceof ReportsGithubError
          ? error
          : new ReportsGithubError({ message: 'No se pudo subir un adjunto.' }),
    })
  })
}

export const listReports = (
  userId: string,
  env: RuntimeEnv,
): Effect.Effect<
  { reports: ReportEntry[]; hasMore: boolean; fetchedAt: string },
  ReportsError | DatabaseError,
  Database | Http
> =>
  Effect.gen(function* () {
    const fetchedAt = nowIso()
    const rows = yield* issueReportsRepository.listRecentByUser(userId, LIST_LIMIT)
    if (rows.length === 0) return { reports: [], hasMore: false, fetchedAt }

    const config = yield* loadConfig(env)
    const nodes = yield* fetchIssueChain(
      config,
      rows.map((row) => row.issueNumber),
      { comments: true },
    )
    // La lista no se cae porque `/user` falle: pierde los avisos por comentario.
    const botLogin = yield* resolveBotLogin(config, env.GITHUB_BOT_LOGIN).pipe(
      Effect.catchTag('ReportsGithubError', () => Effect.succeed(null)),
    )

    const reports = rows.slice(0, LIST_LIMIT).map((row) => {
      const node = nodes.get(row.issueNumber)
      if (!node) return unavailableEntry(row)
      return buildEntry(node, row, { userId, botLogin })
    })

    return { reports, hasMore: rows.length > LIST_LIMIT, fetchedAt }
  })

export const getReportDetail = (
  userId: string,
  issueNumber: number,
  env: RuntimeEnv,
): Effect.Effect<ReportDetail, ReportsError | DatabaseError, Database | Http> =>
  Effect.gen(function* () {
    const fetchedAt = nowIso()
    const row = yield* issueReportsRepository.getByUserAndNumber(userId, issueNumber)
    if (!row) return yield* new ReportNotFoundError({ message: 'Reporte no encontrado.' })

    const config = yield* loadConfig(env)
    const nodes = yield* fetchIssueChain(config, [issueNumber], { comments: false })
    const root = nodes.get(issueNumber)
    if (!root) {
      return {
        report: unavailableEntry(row),
        threadIssue: null,
        thread: [],
        hiddenBefore: 0,
        canComment: false,
        fetchedAt,
      }
    }

    const resolved = resolveFollowed(root, `${config.owner}/${config.repo}`)
    const threadIssue = resolved.followed ?? root
    // En el detalle se falla cerrado [D1]: sin login del bot no hay «Tú».
    const botLogin = yield* resolveBotLogin(config, env.GITHUB_BOT_LOGIN)
    const thread = yield* fetchIssueThread(config, threadIssue.number)
    const open = threadIssue.state === 'OPEN'
    const items = mapThread(thread.comments, { userId, botLogin }, open)

    const statusChangedAt = latestIso(
      root.statusChangedAt,
      resolved.followed?.statusChangedAt ?? null,
    )
    const latestComment = items
      .filter((item) => item.kind === 'maintainer')
      .reduce<string | null>((latest, item) => latestIso(latest, item.createdAt), null)
    const report = buildAvailableEntry(root, resolved, {
      submittedAt: row.submittedAt,
      lastSeenAt: row.lastSeenAt,
      statusChangedAt,
      hasUpdates: computeHasUpdates({
        lastSeenAt: row.lastSeenAt,
        statusChangedAt,
        latestMaintainerCommentAt: latestComment,
      }),
    })

    return {
      report,
      threadIssue: toRef(threadIssue),
      thread: items,
      hiddenBefore: Math.max(0, thread.totalCount - thread.comments.length),
      canComment: open,
      fetchedAt,
    }
  })

export const addComment = (
  userId: string,
  issueNumber: number,
  input: { text: string; attachments: ResolvedAttachment[] },
  env: RuntimeEnv,
): Effect.Effect<ThreadItem, ReportsError | DatabaseError, Database | Http> =>
  Effect.gen(function* () {
    const row = yield* issueReportsRepository.getByUserAndNumber(userId, issueNumber)
    if (!row) return yield* new ReportNotFoundError({ message: 'Reporte no encontrado.' })

    const config = yield* loadConfig(env)
    const nodes = yield* fetchIssueChain(config, [issueNumber], { comments: false })
    const root = nodes.get(issueNumber)
    if (!root) return yield* new ReportNotFoundError({ message: 'Reporte no encontrado.' })
    const resolved = resolveFollowed(root, `${config.owner}/${config.repo}`)
    const threadIssue = resolved.followed ?? root
    if (threadIssue.state !== 'OPEN') {
      return yield* new ReportClosedError({ message: 'El reporte está cerrado.' })
    }

    const uploaded = yield* uploadAttachments(config, input.attachments)
    const body = buildReporterCommentBody({
      userId,
      text: input.text,
      attachments: uploaded,
    })
    const created = yield* createGithubComment(config, threadIssue.number, body)
    return threadItem(
      {
        databaseId: created.databaseId,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
        body,
        author: created.author,
      },
      'mine',
      true,
    )
  })

async function uploadAll(
  request: typeof fetch,
  config: GithubConfig,
  attachments: ResolvedAttachment[],
): Promise<ThreadAttachment[]> {
  const headers = {
    Authorization: `Bearer ${config.token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'finance-tracker-web-reporter',
  }
  const repositoryId = once(() => fetchRepositoryId(request, config.owner, config.repo, headers))
  const uploaded: ThreadAttachment[] = []
  for (const attachment of attachments) {
    const result = await uploadIssueAttachment(attachment, {
      fetch: request,
      headers,
      repositoryId,
    })
    if (!result.ok) {
      console.error('[reports] Adjunto no subido', result.error)
      throw new ReportsGithubError({ message: 'No se pudo subir un adjunto.' })
    }
    uploaded.push({ name: attachment.name, url: result.url })
  }
  return uploaded
}

export const editComment = (
  userId: string,
  issueNumber: number,
  commentId: number,
  input: CommentUpdateInput,
  env: RuntimeEnv,
): Effect.Effect<ThreadItem, ReportsError | DatabaseError, Database | Http> =>
  Effect.gen(function* () {
    const row = yield* issueReportsRepository.getByUserAndNumber(userId, issueNumber)
    if (!row) return yield* new ReportNotFoundError({ message: 'Reporte no encontrado.' })

    const config = yield* loadConfig(env)
    const nodes = yield* fetchIssueChain(config, [issueNumber], { comments: false })
    const root = nodes.get(issueNumber)
    if (!root) return yield* new ReportNotFoundError({ message: 'Reporte no encontrado.' })
    const resolved = resolveFollowed(root, `${config.owner}/${config.repo}`)
    const allowed = new Set(
      [root.number, resolved.followed?.number].filter((value): value is number => Boolean(value)),
    )

    const current = yield* fetchGithubComment(config, commentId)
    if (!current) return yield* new ReportNotFoundError({ message: 'Comentario no encontrado.' })
    if (!allowed.has(current.issueNumber)) {
      return yield* new CommentForbiddenError({ message: 'No puedes modificar este comentario.' })
    }

    const botLogin = yield* resolveBotLogin(config, env.GITHUB_BOT_LOGIN)
    const kind = classifyComment(
      {
        databaseId: current.databaseId,
        createdAt: current.createdAt,
        updatedAt: current.updatedAt,
        body: current.body,
        author: current.author,
      },
      { userId, botLogin },
    )
    if (kind !== 'mine') {
      return yield* new CommentForbiddenError({ message: 'No puedes modificar este comentario.' })
    }

    const commentedIssue = nodes.get(current.issueNumber)
    if (!commentedIssue || commentedIssue.state !== 'OPEN') {
      return yield* new ReportClosedError({ message: 'El reporte está cerrado.' })
    }

    const existing = parseReporterComment(current.body)?.attachments ?? []
    const existingUrls = new Set(existing.map((attachment) => attachment.url))
    if (input.keepAttachments.some((url) => !existingUrls.has(url))) {
      return yield* new ReportInputError({
        message: 'Los adjuntos que se conservan no son válidos.',
        status: 400,
      })
    }
    const kept = existing.filter((attachment) => input.keepAttachments.includes(attachment.url))
    if (kept.length + input.attachments.length > 3) {
      return yield* new ReportInputError({
        message: 'Solo puedes adjuntar hasta 3 imágenes.',
        status: 400,
      })
    }

    const uploaded = yield* uploadAttachments(config, input.attachments)
    const body = buildReporterCommentBody({
      userId,
      text: input.text,
      attachments: [...kept, ...uploaded],
    })
    const updated = yield* updateGithubComment(config, commentId, body)
    return threadItem(
      {
        databaseId: updated.databaseId,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
        body,
        author: updated.author,
      },
      'mine',
      true,
    )
  })

export const deleteComment = (
  userId: string,
  issueNumber: number,
  commentId: number,
  env: RuntimeEnv,
): Effect.Effect<void, ReportsError | DatabaseError, Database | Http> =>
  Effect.gen(function* () {
    const row = yield* issueReportsRepository.getByUserAndNumber(userId, issueNumber)
    if (!row) return yield* new ReportNotFoundError({ message: 'Reporte no encontrado.' })

    const config = yield* loadConfig(env)
    const nodes = yield* fetchIssueChain(config, [issueNumber], { comments: false })
    const root = nodes.get(issueNumber)
    if (!root) return yield* new ReportNotFoundError({ message: 'Reporte no encontrado.' })
    const resolved = resolveFollowed(root, `${config.owner}/${config.repo}`)
    const allowed = new Set(
      [root.number, resolved.followed?.number].filter((value): value is number => Boolean(value)),
    )

    const current = yield* fetchGithubComment(config, commentId)
    if (!current) return yield* new ReportNotFoundError({ message: 'Comentario no encontrado.' })
    if (!allowed.has(current.issueNumber)) {
      return yield* new CommentForbiddenError({ message: 'No puedes modificar este comentario.' })
    }

    const botLogin = yield* resolveBotLogin(config, env.GITHUB_BOT_LOGIN)
    const kind = classifyComment(
      {
        databaseId: current.databaseId,
        createdAt: current.createdAt,
        updatedAt: current.updatedAt,
        body: current.body,
        author: current.author,
      },
      { userId, botLogin },
    )
    if (kind !== 'mine') {
      return yield* new CommentForbiddenError({ message: 'No puedes modificar este comentario.' })
    }

    const commentedIssue = nodes.get(current.issueNumber)
    if (!commentedIssue || commentedIssue.state !== 'OPEN') {
      return yield* new ReportClosedError({ message: 'El reporte está cerrado.' })
    }
    yield* deleteGithubComment(config, commentId)
  })

export const markSeen = (
  userId: string,
  issueNumber: number,
  seenAt: string,
): Effect.Effect<void, ReportsError | DatabaseError, Database> =>
  Effect.gen(function* () {
    const row = yield* issueReportsRepository.getByUserAndNumber(userId, issueNumber)
    if (!row) return yield* new ReportNotFoundError({ message: 'Reporte no encontrado.' })
    const now = nowIso()
    // El cliente no puede adelantar la marca para silenciar novedades ([D4]).
    const effective = Date.parse(seenAt) < Date.parse(now) ? seenAt : now
    const updated = yield* issueReportsRepository.markSeen(userId, issueNumber, effective)
    if (!updated) return yield* new ReportNotFoundError({ message: 'Reporte no encontrado.' })
  })
