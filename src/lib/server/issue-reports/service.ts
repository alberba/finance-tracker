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
import type { IssueReportRow } from '../../../db/repositories/issue-reports'
import { nowIso } from '../../../db/repositories/shared'
import {
  buildReporterCommentBody,
  classifyComment,
  parseReporterComment,
  type RawComment,
} from '../../../domain/reports/reporter-comment'
import type {
  AvailableReportEntry,
  ReportDetail,
  ReportEntry,
  ThreadAttachment,
  ThreadItem,
} from '../../../domain/reports/report-entry'
import { buildAvailableEntry, resolveFollowed, toIssueRef } from '../../../domain/reports/report-status'
import { computeHasUpdates } from '../../../domain/reports/report-updates'
import { fetchRepositoryId, githubConfig, once, type GithubConfig } from '../github-api'
import { Http } from '../http'
import { uploadIssueAttachment } from '../issue-attachments'
import type { ResolvedAttachment } from '../issue-report-schema'
import { ISSUE_ATTACHMENT_MAX_COUNT } from '../../../domain/reports/issue-attachments'
import {
  createComment as createGithubComment,
  deleteComment as deleteGithubComment,
  fetchComment as fetchGithubComment,
  fetchIssueChain,
  fetchIssueThread,
  resolveBotLogin,
  updateComment as updateGithubComment,
  type GithubComment,
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
  // El hilo es el de la principal si se sigue; si no, el de la original.
  const latestComment = latestMaintainerAt(
    (resolved.followed ?? node).recentComments,
    context,
  )
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

interface OwnedReportContext {
  row: IssueReportRow
  config: GithubConfig
  root: GraphIssueNode | null
  followed?: GraphIssueNode
  duplicateLinkUnavailable: boolean
  threadIssue?: GraphIssueNode
}

/**
 * Propiedad + cadena de duplicadas, la antesala común de detalle y escrituras.
 * `root` nulo significa que GitHub ya no devuelve la issue (no que no sea de la
 * cuenta: eso lo decide la fila).
 */
function loadOwnedReport(
  userId: string,
  issueNumber: number,
  env: RuntimeEnv,
): Effect.Effect<OwnedReportContext | null, ReportsError | DatabaseError, Database | Http> {
  return Effect.gen(function* () {
    const row = yield* issueReportsRepository.getByUserAndNumber(userId, issueNumber)
    if (!row) return null

    const config = yield* loadConfig(env)
    const nodes = yield* fetchIssueChain(config, [issueNumber], { comments: false })
    const root = nodes.get(issueNumber) ?? null
    if (!root) {
      return { row, config, root, duplicateLinkUnavailable: false }
    }

    const resolved = resolveFollowed(root, `${config.owner}/${config.repo}`)
    return {
      row,
      config,
      root,
      followed: resolved.followed,
      duplicateLinkUnavailable: resolved.duplicateLinkUnavailable,
      threadIssue: resolved.followed ?? root,
    }
  })
}

function requireReport(
  context: OwnedReportContext | null,
): Effect.Effect<OwnedReportContext, ReportNotFoundError> {
  return context
    ? Effect.succeed(context)
    : Effect.fail(new ReportNotFoundError({ message: 'Reporte no encontrado.' }))
}

function commentIssue(
  context: OwnedReportContext,
  issueNumber: number,
): GraphIssueNode | undefined {
  if (context.root?.number === issueNumber) return context.root
  if (context.followed?.number === issueNumber) return context.followed
  return undefined
}

function requireOwnComment(
  context: OwnedReportContext,
  current: GithubComment | null,
  userId: string,
  botLogin: string,
): Effect.Effect<GraphIssueNode, ReportsError> {
  if (!current) {
    return Effect.fail(new ReportNotFoundError({ message: 'Comentario no encontrado.' }))
  }
  const issue = commentIssue(context, current.issueNumber)
  if (!issue) {
    return Effect.fail(new CommentForbiddenError({ message: 'No puedes modificar este comentario.' }))
  }
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
    return Effect.fail(new CommentForbiddenError({ message: 'No puedes modificar este comentario.' }))
  }
  if (issue.state !== 'OPEN') {
    return Effect.fail(new ReportClosedError({ message: 'El reporte está cerrado.' }))
  }
  return Effect.succeed(issue)
}

export const getReportDetail = (
  userId: string,
  issueNumber: number,
  env: RuntimeEnv,
): Effect.Effect<ReportDetail, ReportsError | DatabaseError, Database | Http> =>
  Effect.gen(function* () {
    const fetchedAt = nowIso()
    const context = yield* loadOwnedReport(userId, issueNumber, env)
    if (!context) return yield* new ReportNotFoundError({ message: 'Reporte no encontrado.' })
    const { row, config, root } = context
    if (!root || !context.threadIssue) {
      return {
        report: unavailableEntry(row),
        threadIssue: null,
        thread: [],
        hiddenBefore: 0,
        canComment: false,
        fetchedAt,
      }
    }

    const threadIssue = context.threadIssue
    // En el detalle se falla cerrado [D1]: sin login del bot no hay «Tú».
    const botLogin = yield* resolveBotLogin(config, env.GITHUB_BOT_LOGIN)
    const thread = yield* fetchIssueThread(config, threadIssue.number)
    const open = threadIssue.state === 'OPEN'
    const items = mapThread(thread.comments, { userId, botLogin }, open)

    const statusChangedAt = latestIso(root.statusChangedAt, context.followed?.statusChangedAt ?? null)
    const latestComment = items
      .filter((item) => item.kind === 'maintainer')
      .reduce<string | null>((latest, item) => latestIso(latest, item.createdAt), null)
    const report = buildAvailableEntry(
      root,
      {
        ...(context.followed ? { followed: context.followed } : {}),
        duplicateLinkUnavailable: context.duplicateLinkUnavailable,
      },
      {
        submittedAt: row.submittedAt,
        lastSeenAt: row.lastSeenAt,
        statusChangedAt,
        hasUpdates: computeHasUpdates({
          lastSeenAt: row.lastSeenAt,
          statusChangedAt,
          latestMaintainerCommentAt: latestComment,
        }),
      },
    )

    return {
      report,
      threadIssue: toIssueRef(threadIssue),
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
    const context = yield* requireReport(yield* loadOwnedReport(userId, issueNumber, env))
    if (!context.threadIssue) {
      return yield* new ReportNotFoundError({ message: 'Reporte no encontrado.' })
    }
    if (context.threadIssue.state !== 'OPEN') {
      return yield* new ReportClosedError({ message: 'El reporte está cerrado.' })
    }

    const uploaded = yield* uploadAttachments(context.config, input.attachments)
    const body = buildReporterCommentBody({
      userId,
      text: input.text,
      attachments: uploaded,
    })
    const created = yield* createGithubComment(context.config, context.threadIssue.number, body)
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
    const context = yield* requireReport(yield* loadOwnedReport(userId, issueNumber, env))
    const current = yield* fetchGithubComment(context.config, commentId)
    const botLogin = yield* resolveBotLogin(context.config, env.GITHUB_BOT_LOGIN)
    yield* requireOwnComment(context, current, userId, botLogin)
    if (!current) {
      return yield* new ReportNotFoundError({ message: 'Comentario no encontrado.' })
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
    if (kept.length + input.attachments.length > ISSUE_ATTACHMENT_MAX_COUNT) {
      return yield* new ReportInputError({
        message: `Solo puedes adjuntar hasta ${ISSUE_ATTACHMENT_MAX_COUNT} imágenes.`,
        status: 400,
      })
    }

    const uploaded = yield* uploadAttachments(context.config, input.attachments)
    const body = buildReporterCommentBody({
      userId,
      text: input.text,
      attachments: [...kept, ...uploaded],
    })
    const updated = yield* updateGithubComment(context.config, commentId, body)
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
    const context = yield* requireReport(yield* loadOwnedReport(userId, issueNumber, env))
    const current = yield* fetchGithubComment(context.config, commentId)
    const botLogin = yield* resolveBotLogin(context.config, env.GITHUB_BOT_LOGIN)
    yield* requireOwnComment(context, current, userId, botLogin)
    yield* deleteGithubComment(context.config, commentId)
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
