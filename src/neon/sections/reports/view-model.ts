import type {
  ReportEntry,
  ReportIssueRef,
  ReportStatusTone,
  ThreadItem,
} from '../../../domain/reports/report-entry'
import { describeReportStatus, issueStateWord } from '../../../domain/reports/report-status'
import { formatLongDate, formatShortDate, formatStamp } from '../../../lib/format'

// «Mis reportes» in the new design (artboards «Mis reportes · 2560 px» and
// «· estados en escritorio», #448): the texts and states the list and the
// detail paint. The wording of a status comes from `describeReportStatus`,
// the same source as the old design; this file only decides what each block
// of the new one says around it.

/** The dot's color: the accent while open, green when done, grey otherwise. */
export type DotTone = 'accent' | 'gain' | 'muted'

const DOT: Record<ReportStatusTone, DotTone> = { warn: 'accent', gain: 'gain', neutral: 'muted' }

/** A status headline: «Se sigue en #887 · Abierto» when the report follows a main issue. */
function headlineOf(entry: ReportEntry): { headline: string; dot: DotTone | null } {
  const description = describeReportStatus(entry)
  const dot = description.state ? DOT[description.tone] : null
  const followed = !entry.unavailable && entry.followed
  const headline =
    description.state && followed
      ? `${description.headline} · ${issueStateWord(description.state)}`
      : description.headline
  return { headline, dot }
}

export interface ReportRow {
  number: number
  /** Null when the issue is gone from GitHub: the row says «Reporte no disponible». */
  title: string | null
  status: string
  /** Null draws a ring instead: there is no status to show. */
  dot: DotTone | null
  meta: string
  isNew: boolean
}

export function reportRow(entry: ReportEntry): ReportRow {
  const sent = formatShortDate(entry.submittedAt)
  if (entry.unavailable) {
    const { warning } = describeReportStatus(entry)
    return {
      number: entry.number,
      title: null,
      status: warning ?? '',
      dot: null,
      meta: `Enviado el ${sent}`,
      isNew: entry.hasUpdates,
    }
  }
  const { headline, dot } = headlineOf(entry)
  const meta = entry.followed
    ? `Cerrado como duplicado · enviado el ${sent}`
    : entry.duplicateLinkUnavailable
      ? `Sin enlace a la principal · enviado el ${sent}`
      : `Enviado el ${sent}`
  return {
    number: entry.number,
    title: entry.title,
    status: headline,
    dot,
    meta,
    isNew: entry.hasUpdates,
  }
}

export interface DetailStatus {
  headline: string
  dot: DotTone | null
  /** The jump from the original report to the main issue it follows. */
  follow: { from: string; to: string; title: string; secondary: string } | null
  warning: string | null
  /** The issue whose thread is shown, on GitHub. */
  link: { href: string; label: string } | null
}

/** `threadIssue` is the issue whose thread the detail shows (the main one when followed). */
export function detailStatus(entry: ReportEntry, threadIssue: ReportIssueRef | null): DetailStatus {
  const description = describeReportStatus(entry)
  const { headline, dot } = headlineOf(entry)
  if (entry.unavailable) {
    return { headline, dot, follow: null, warning: description.warning, link: null }
  }
  const followed = entry.followed
  const target = threadIssue ?? followed ?? entry
  return {
    headline,
    dot,
    follow: followed
      ? {
          from: `#${entry.number}`,
          to: `#${followed.number}`,
          title: followed.title,
          secondary: description.secondary ?? '',
        }
      : null,
    warning: description.warning,
    link: { href: target.url, label: `Ver #${target.number} en GitHub` },
  }
}

/** «Enviado el 18 de octubre de 2026». */
export function sentLine(entry: ReportEntry): string {
  return `Enviado el ${formatLongDate(entry.submittedAt)}`
}

export interface ThreadPerson {
  /** What the round avatar says: «Tú» or the first letter of the login. */
  initial: string
  author: string
  role: string
  own: boolean
  when: string
  edited: boolean
}

export function threadPerson(item: ThreadItem): ThreadPerson {
  const own = item.kind === 'reporter'
  return {
    initial: own ? 'Tú' : item.author.charAt(0).toUpperCase(),
    author: item.author,
    role: own ? 'Aclaración del reportero' : 'Mantenedor',
    own,
    when: formatStamp(item.createdAt),
    edited: item.editedAt !== null,
  }
}

function mainIssue(entry: ReportEntry): ReportIssueRef | null {
  return entry.unavailable ? null : (entry.followed ?? null)
}

/** The line under «Hilo». */
export function threadNote(entry: ReportEntry): string {
  const main = mainIssue(entry)
  return main
    ? `Hilo de #${main.number}, la principal: respuestas del mantenedor y tus aclaraciones.`
    : 'Respuestas del mantenedor y tus aclaraciones.'
}

/** The line under «Nueva aclaración»: where it will be published. */
export function composerNote(entry: ReportEntry): string {
  const main = mainIssue(entry)
  return main
    ? `Se publica en #${main.number}, donde sigue tu reporte.`
    : `Se añade al hilo de #${entry.number} en GitHub.`
}

/** «6 enviados · 2 con novedades»: `news` is null when there is none to say. */
export function countsLine(sent: number, news: number): { sent: number; news: number | null } {
  return { sent, news: news > 0 ? news : null }
}
