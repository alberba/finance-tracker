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
import { describeReport } from '../../../domain/reports/report-description'
import * as issueReportsRepository from '../../../db/repositories/issue-reports'
import * as privateReports from '../../../db/repositories/private-reports'
import type { IssueReportRow } from '../../../db/repositories/issue-reports'
import { nowIso } from '../../../db/repositories/shared'
import {
  classifyComment,
  parseReporterComment,
  type RawComment,
} from '../../../domain/reports/reporter-comment'
import type {
  AvailableReportEntry,
  ReportDetail,
  ReportEntry,
  ThreadItem,
} from '../../../domain/reports/report-entry'
import {
  buildAvailableEntry,
  resolveFollowed,
  toIssueRef,
} from '../../../domain/reports/report-status'
import { computeHasUpdates, scanCommentWindow } from '../../../domain/reports/report-updates'
import { githubConfig, type GithubConfig } from '../github-api'
import { Http } from '../http'
import type { ResolvedAttachment } from '../issue-report-schema'
import {
  deleteComment as deleteGithubComment,
  fetchComment as fetchGithubComment,
  fetchIssueChain,
  fetchIssueThread,
  fetchOlderComments,
  olderCommentsKey,
  resolveBotLogin,
  type GithubComment,
  type GraphIssueNode,
} from './github'
import {
  CommentForbiddenError,
  REPORT_NOT_FOUND_MESSAGE,
  ReportClosedError,
  ReportInputError,
  ReportNotFoundError,
  ReportsGithubError,
  type ReportsError,
} from './errors'
import type { CommentUpdateInput } from './comment-schema'

/** Entradas por página de la lista; el resto se pide con `nextCursor`. */
export const LIST_PAGE_SIZE = 20

export interface ReportsListCursor {
  submittedAt: string
  issueNumber: number
}

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

export function encodeListCursor(row: { submittedAt: string; issueNumber: number }): string {
  return `${row.submittedAt}|${row.issueNumber}`
}

/** Índice de la primera fila de la página siguiente; `rows.length` si ya no queda. */
export function pageStartIndex(
  rows: readonly { submittedAt: string; issueNumber: number }[],
  cursor: ReportsListCursor | null,
): number {
  if (!cursor) return 0
  const exact = rows.findIndex(
    (row) => row.issueNumber === cursor.issueNumber && row.submittedAt === cursor.submittedAt,
  )
  if (exact >= 0) return exact + 1
  // Si la fila del cursor ya no existe, se continúa por el orden guardado.
  const next = rows.findIndex(
    (row) =>
      row.submittedAt < cursor.submittedAt ||
      (row.submittedAt === cursor.submittedAt && row.issueNumber < cursor.issueNumber),
  )
  return next === -1 ? rows.length : next
}

interface EntryContext {
  userId: string
  botLogin: string
}

interface NotificationState {
  latestMaintainerAt: string | null
  /** La ventana leída ya llega a la última lectura: no hay más que pedir. */
  covered: boolean
  commentsIssue: number
  before: string | null
}

function initialNotificationState(
  node: GraphIssueNode,
  row: IssueReportRow,
  context: EntryContext,
  ownerRepo: string,
): NotificationState {
  const resolved = resolveFollowed(node, ownerRepo)
  const threadNode = resolved.followed ?? node
  const window = scanCommentWindow(threadNode.recentComments, row.lastSeenAt, context)
  return {
    latestMaintainerAt: window.latestMaintainerAt,
    covered: window.covered || !threadNode.commentsPage.hasPreviousPage,
    commentsIssue: threadNode.number,
    before: threadNode.commentsPage.startCursor,
  }
}

/**
 * Agota la ventana de novedades de cada fila: mientras una página no llegue a un
 * comentario ya visto, se pide la anterior. Nunca se recorta a un número fijo de
 * comentarios recientes.
 */
function collectNotificationStates(
  config: GithubConfig,
  nodes: Map<number, GraphIssueNode | null>,
  rows: readonly IssueReportRow[],
  context: EntryContext,
): Effect.Effect<Map<number, NotificationState>, ReportsGithubError, Http> {
  return Effect.gen(function* () {
    const ownerRepo = `${config.owner}/${config.repo}`
    const states = new Map<number, NotificationState>()
    const byNumber = new Map(rows.map((row) => [row.issueNumber, row]))
    for (const row of rows) {
      const node = nodes.get(row.issueNumber)
      if (!node) continue
      states.set(row.issueNumber, initialNotificationState(node, row, context, ownerRepo))
    }

    for (;;) {
      const pending = [...states.entries()].filter(([, state]) => !state.covered && state.before)
      if (pending.length === 0) break
      const pages = yield* fetchOlderComments(
        config,
        pending.map(([, state]) => ({
          number: state.commentsIssue,
          before: state.before as string,
        })),
      )
      for (const [rootNumber, state] of pending) {
        const row = byNumber.get(rootNumber)
        const page = pages.get(olderCommentsKey(state.commentsIssue, state.before as string))
        if (!row || !page) {
          state.covered = true
          continue
        }
        const window = scanCommentWindow(page.comments, row.lastSeenAt, context)
        state.latestMaintainerAt = latestIso(state.latestMaintainerAt, window.latestMaintainerAt)
        state.covered =
          window.covered ||
          !page.hasPreviousPage ||
          !page.startCursor ||
          page.startCursor === state.before
        state.before = page.startCursor
      }
    }
    return states
  })
}

function buildEntry(
  node: GraphIssueNode,
  row: Pick<IssueReportRow, 'issueNumber' | 'submittedAt' | 'lastSeenAt' | 'privateTitle'>,
  latestMaintainerCommentAt: string | null,
): AvailableReportEntry {
  const repository = node.repository?.nameWithOwner ?? ''
  const resolved = resolveFollowed(node, repository)
  const statusChangedAt = latestIso(
    node.statusChangedAt,
    resolved.followed?.statusChangedAt ?? null,
  )
  return buildAvailableEntry({ ...node, title: row.privateTitle ?? node.title }, resolved, {
    submittedAt: row.submittedAt,
    lastSeenAt: row.lastSeenAt,
    statusChangedAt,
    hasUpdates: computeHasUpdates({
      lastSeenAt: row.lastSeenAt,
      statusChangedAt,
      latestMaintainerCommentAt,
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
    editable: false,
    deletable: kind === 'mine' && open,
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

export const listReports = (
  userId: string,
  env: RuntimeEnv,
  options: { cursor?: ReportsListCursor | null } = {},
): Effect.Effect<
  {
    reports: ReportEntry[]
    hasMore: boolean
    nextCursor: string | null
    /** Solo en la primera página: el contador de novedades cubre todas las filas. */
    unseenCount?: number
    fetchedAt: string
  },
  ReportsError | DatabaseError,
  Database | Http
> =>
  Effect.gen(function* () {
    const fetchedAt = nowIso()
    const rows = yield* issueReportsRepository.listByUser(userId)
    const start = pageStartIndex(rows, options.cursor ?? null)
    const pageRows = rows.slice(start, start + LIST_PAGE_SIZE)
    const hasMore = start + pageRows.length < rows.length
    const nextCursor =
      hasMore && pageRows.length > 0 ? encodeListCursor(pageRows[pageRows.length - 1]) : null

    if (rows.length === 0) {
      return { reports: [], hasMore: false, nextCursor: null, unseenCount: 0, fetchedAt }
    }
    // La primera página escanea todas las filas para que el contador de avisos
    // no ignore reportes que aún no se han cargado.
    const scanRows = options.cursor ? pageRows : rows
    if (scanRows.length === 0) {
      return { reports: [], hasMore: false, nextCursor: null, fetchedAt }
    }

    const config = yield* loadConfig(env)
    // Sin el login del bot no se distingue una aclaración propia de un comentario
    // del mantenedor: la lista falla en vez de perder avisos en silencio ([D1]).
    const botLogin = yield* resolveBotLogin(config, env.GITHUB_BOT_LOGIN)
    const context = { userId, botLogin }

    const nodes = yield* fetchIssueChain(
      config,
      scanRows.map((row) => row.issueNumber),
      { comments: true },
    )
    const states = yield* collectNotificationStates(config, nodes, scanRows, context)

    const entries = new Map<number, ReportEntry>()
    for (const row of scanRows) {
      const node = nodes.get(row.issueNumber)
      entries.set(
        row.issueNumber,
        node
          ? buildEntry(node, row, states.get(row.issueNumber)?.latestMaintainerAt ?? null)
          : unavailableEntry(row),
      )
    }

    const reports = pageRows.map((row) => entries.get(row.issueNumber) ?? unavailableEntry(row))
    const unseenCount = options.cursor
      ? undefined
      : [...entries.values()].filter((entry) => entry.hasUpdates).length

    return {
      reports,
      hasMore,
      nextCursor,
      ...(unseenCount === undefined ? {} : { unseenCount }),
      fetchedAt,
    }
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
    : Effect.fail(new ReportNotFoundError({ message: REPORT_NOT_FOUND_MESSAGE }))
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
): Effect.Effect<GithubComment, ReportsError> {
  if (!current) {
    return Effect.fail(new ReportNotFoundError({ message: 'Comentario no encontrado.' }))
  }
  const issue = commentIssue(context, current.issueNumber)
  if (!issue) {
    // Mismo 404 que un comentario inexistente: el código no debe revelar si el
    // commentId existe en otra issue o en otro reporte.
    return Effect.fail(new ReportNotFoundError({ message: 'Comentario no encontrado.' }))
  }
  const kind = classifyComment(
    {
      databaseId: current.databaseId,
      createdAt: current.createdAt,
      updatedAt: current.updatedAt,
      body: current.body,
      author: current.author,
      authorAssociation: current.authorAssociation,
    },
    { userId, botLogin },
  )
  if (kind !== 'mine') {
    return Effect.fail(
      new CommentForbiddenError({ message: 'No puedes modificar este comentario.' }),
    )
  }
  if (issue.state !== 'OPEN') {
    return Effect.fail(new ReportClosedError({ message: 'El reporte está cerrado.' }))
  }
  return Effect.succeed(current)
}

export const getReportDetail = (
  userId: string,
  issueNumber: number,
  env: RuntimeEnv,
): Effect.Effect<ReportDetail, ReportsError | DatabaseError, Database | Http> =>
  Effect.gen(function* () {
    const fetchedAt = nowIso()
    const context = yield* loadOwnedReport(userId, issueNumber, env)
    if (!context) return yield* new ReportNotFoundError({ message: REPORT_NOT_FOUND_MESSAGE })
    const { row, config, root } = context
    const diagnosticExpiresAt = yield* privateReports.diagnosticExpiry(
      userId,
      issueNumber,
      fetchedAt,
    )
    const open = context.threadIssue?.state === 'OPEN'
    const privateContent = yield* privateReports.readContent(row.id, open)
    if (!root || !context.threadIssue) {
      return {
        report: unavailableEntry(row),
        threadIssue: null,
        thread: privateContent.comments,
        canComment: false,
        original: row.originalBody,
        issueDescription: null,
        attachments: privateContent.attachments,
        diagnosticExpiresAt,
        fetchedAt,
      }
    }

    const threadIssue = context.threadIssue
    // En el detalle se falla cerrado [D1]: sin login del bot no hay «Tú».
    const botLogin = yield* resolveBotLogin(config, env.GITHUB_BOT_LOGIN)
    // El hilo se lee completo, página a página: no hay recorte de comentarios.
    const issueThread = yield* fetchIssueThread(config, threadIssue.number)
    const thread = issueThread.comments
    const githubItems = mapThread(thread, { userId, botLogin }, open)
    const items = [...githubItems, ...privateContent.comments].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    )

    const statusChangedAt = latestIso(
      root.statusChangedAt,
      context.followed?.statusChangedAt ?? null,
    )
    const latestComment = items
      .filter((item) => item.kind === 'maintainer')
      .reduce<string | null>((latest, item) => latestIso(latest, item.createdAt), null)
    const report = buildAvailableEntry(
      { ...root, title: row.privateTitle ?? root.title },
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
      canComment: open,
      ...(row.caseReference
        ? { original: row.originalBody, issueDescription: null }
        : describeReport(row.originalBody, context.followed ? null : issueThread.body)),
      attachments: privateContent.attachments,
      diagnosticExpiresAt,
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
      return yield* new ReportNotFoundError({ message: REPORT_NOT_FOUND_MESSAGE })
    }
    if (context.threadIssue.state !== 'OPEN') {
      return yield* new ReportClosedError({ message: 'El reporte está cerrado.' })
    }

    return yield* privateReports.addComment(context.row.id, input.text, input.attachments, nowIso())
  })

export const editComment = (
  userId: string,
  issueNumber: number,
  commentId: number,
  input: CommentUpdateInput,
  env: RuntimeEnv,
): Effect.Effect<ThreadItem, ReportsError | DatabaseError, Database | Http> =>
  Effect.gen(function* () {
    const context = yield* requireReport(yield* loadOwnedReport(userId, issueNumber, env))
    if (!privateReports.isPrivateCommentId(commentId)) {
      const fetched = yield* fetchGithubComment(context.config, commentId)
      const botLogin = yield* resolveBotLogin(context.config, env.GITHUB_BOT_LOGIN)
      yield* requireOwnComment(context, fetched, userId, botLogin)
      return yield* new CommentForbiddenError({
        message: 'Las aclaraciones publicadas en GitHub solo se pueden eliminar.',
      })
    }
    if (context.threadIssue?.state !== 'OPEN') {
      return yield* new ReportClosedError({ message: 'El reporte está cerrado.' })
    }
    const result = yield* privateReports.updateComment(context.row.id, commentId, input, nowIso())
    if (result.status === 'invalid') {
      return yield* new ReportInputError({
        message: 'Los adjuntos que se conservan no son válidos.',
        status: 400,
      })
    }
    if (result.status === 'missing') {
      return yield* new ReportNotFoundError({ message: 'Comentario no encontrado.' })
    }
    return result.comment
  })

export const deleteComment = (
  userId: string,
  issueNumber: number,
  commentId: number,
  env: RuntimeEnv,
): Effect.Effect<void, ReportsError | DatabaseError, Database | Http> =>
  Effect.gen(function* () {
    const context = yield* requireReport(yield* loadOwnedReport(userId, issueNumber, env))
    if (privateReports.isPrivateCommentId(commentId)) {
      if (context.threadIssue?.state !== 'OPEN') {
        return yield* new ReportClosedError({ message: 'El reporte está cerrado.' })
      }
      if (!(yield* privateReports.removeComment(context.row.id, commentId))) {
        return yield* new ReportNotFoundError({ message: 'Comentario no encontrado.' })
      }
      return
    }
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
    if (!row) return yield* new ReportNotFoundError({ message: REPORT_NOT_FOUND_MESSAGE })
    const now = nowIso()
    // `max()` compara cadenas: sin milisegundos, «…00Z» ordena después de
    // «…00.500Z» y la marca no avanzaría. Normaliza siempre a ISO con milisegundos.
    const requested = new Date(seenAt).toISOString()
    // El cliente no puede adelantar la marca para silenciar novedades ([D4]).
    const effective = Date.parse(requested) < Date.parse(now) ? requested : now
    const updated = yield* issueReportsRepository.markSeen(userId, issueNumber, effective)
    if (!updated) return yield* new ReportNotFoundError({ message: REPORT_NOT_FOUND_MESSAGE })
  })
