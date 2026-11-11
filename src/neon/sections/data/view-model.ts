import type { DataSummaryViewModel } from '../../../domain/data/view-model'
import { formatMoney, formatNumber } from '../../../lib/format'
import type { BitvavoPreview } from '../../../lib/bitvavo-types'
import type { OutboxEntry } from '../../../lib/client/outbox'
import type { SyncStatus } from '../../../stores/sync'

// Presentation of Datos in the new design (artboard «Datos · 2560 px», #446):
// what an export contains, the state of the sync with its queue, the steps of
// the import flow and what a Bitvavo preview will do. Pure: the section reads
// the stores and hands the values in.

/** One piece of the sentence under «Exportar»: the figures go in Unbounded. */
export interface ContentPart {
  text: string
  figure: boolean
}

function count(value: number, one: string, many: string): string {
  return value === 1 ? one : many
}

/**
 * «Contiene 1.214 movimientos, 38 snapshots y 24 aportes.» as parts, so the
 * figures can be painted apart from the words around them.
 */
export function exportContents(summary: DataSummaryViewModel): ContentPart[] {
  const items = [
    { value: summary.totalTransactions, one: 'movimiento', many: 'movimientos' },
    { value: summary.totalSnapshots, one: 'snapshot', many: 'snapshots' },
    { value: summary.totalContributions, one: 'aporte', many: 'aportes' },
  ]
  const parts: ContentPart[] = [{ text: 'Contiene ', figure: false }]
  items.forEach((item, index) => {
    const separator = index === 0 ? '' : index === items.length - 1 ? ' y ' : ', '
    if (separator) parts.push({ text: separator, figure: false })
    parts.push({ text: formatNumber(item.value), figure: true })
    parts.push({ text: ` ${count(item.value, item.one, item.many)}`, figure: false })
  })
  parts.push({ text: '.', figure: false })
  return parts
}

export type SyncDot = 'ok' | 'pending' | 'idle'

export interface SyncView {
  /** «Sincronizado», «Sin conexión»… */
  label: string
  /** «(2 pendientes) · hace 12 s» */
  meta: string
  dot: SyncDot
  /** The label of the «Sincronizar ahora» button. */
  button: string
  /** False while it syncs, offline or in the demo, which has nothing to sync with. */
  canSync: boolean
  /** The figure under the status and the words that follow it. */
  pending: { figure: string; word: string }
}

export interface SyncInput {
  demo: boolean
  online: boolean
  status: SyncStatus
  pendingCount: number
  lastCheckedAt: number | null
  now: number
}

/** «hace 12 s», «hace 3 min», «hace 2 h»; null before the first check. */
export function sinceLabel(at: number | null, now: number): string | null {
  if (at === null) return null
  const seconds = Math.max(0, Math.round((now - at) / 1000))
  if (seconds < 60) return `hace ${seconds} s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `hace ${minutes} min`
  return `hace ${Math.round(minutes / 60)} h`
}

export function pendingWord(pendingCount: number): string {
  if (pendingCount === 0) return 'nada pendiente'
  return pendingCount === 1 ? 'cambio pendiente' : 'cambios pendientes'
}

function pendingLabel(pendingCount: number): string {
  return pendingCount === 1 ? '1 pendiente' : `${pendingCount} pendientes`
}

export function syncView(input: SyncInput): SyncView {
  const { demo, online, status, pendingCount } = input
  const pending = { figure: formatNumber(pendingCount), word: pendingWord(pendingCount) }
  if (demo) {
    return {
      label: 'Sin sincronización',
      meta: 'Modo demo: tus datos viven en este navegador.',
      dot: 'idle',
      button: 'Sincronizar ahora',
      canSync: false,
      pending,
    }
  }
  const since = sinceLabel(input.lastCheckedAt, input.now)
  const meta = [pendingCount > 0 ? `(${pendingLabel(pendingCount)})` : null, since]
    .filter(Boolean)
    .join(' · ')
  const syncing = status === 'syncing'
  const label = !online
    ? 'Sin conexión'
    : syncing
      ? 'Sincronizando…'
      : status === 'error'
        ? 'No se pudo sincronizar'
        : pendingCount > 0
          ? 'Pendiente de enviar'
          : 'Sincronizado'
  return {
    label,
    meta,
    dot: !online || syncing ? 'idle' : pendingCount > 0 || status === 'error' ? 'pending' : 'ok',
    button: syncing ? 'Sincronizando…' : 'Sincronizar ahora',
    canSync: online && !syncing,
    pending,
  }
}

export interface QueueRow {
  key: number
  kind: string
  text: string
  act: string
}

const ENTITY_KIND: Record<string, string> = {
  account: 'Cuenta',
  category: 'Categoría',
  transaction: 'Movimiento',
  subscription: 'Suscripción',
  recurringRule: 'Regla recurrente',
  pendingMovement: 'Por confirmar',
  budgetEntry: 'Presupuesto',
  goal: 'Objetivo',
  contribution: 'Aporte',
  userInstrument: 'Activo',
  wealthSnapshot: 'Patrimonio',
  stockeventsMapping: 'Stock Events',
}

const ACTION_LABEL: Record<string, string> = {
  create: 'Crear',
  update: 'Editar',
  remove: 'Eliminar',
  settingsUpdate: 'Editar',
  noop: '—',
}

function textOf(record: Record<string, unknown> | undefined, key: string): string | null {
  const value = record?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** «Mercadona · 64,32 €» for a movement, the name for anything else that has one. */
function queueText(entry: OutboxEntry, kind: string): string {
  const { command } = entry
  if (command.action === 'settingsUpdate') return 'Preferencias'
  if (command.action === 'noop') return 'Sin cambios'
  const fields =
    command.action === 'create'
      ? command.data
      : command.action === 'update'
        ? command.patch
        : undefined
  const title = textOf(fields, 'description') ?? textOf(fields, 'name')
  const amount = fields?.['amount']
  const money = typeof amount === 'number' ? formatMoney(amount) : null
  return [title ?? (money ? null : kind), money].filter(Boolean).join(' · ') || kind
}

/** What waits in the outbox, in the order it will be sent. */
export function queueRows(entries: readonly OutboxEntry[]): QueueRow[] {
  return entries.map((entry) => {
    const { command } = entry
    const kind =
      command.action === 'settingsUpdate'
        ? 'Ajustes'
        : command.action === 'noop'
          ? 'Sistema'
          : (ENTITY_KIND[command.entityType] ?? 'Cambio')
    return {
      key: entry.seq,
      kind,
      text: queueText(entry, kind),
      act: ACTION_LABEL[command.action] ?? 'Editar',
    }
  })
}

export type ImportOrigin = 'json' | 'bitvavo'

export type ImportStep = 'origin' | 'review' | 'done'

export function importStepLabel(step: ImportStep): string {
  if (step === 'origin') return 'Paso 1 de 2 · Elige de dónde viene'
  return step === 'review' ? 'Paso 2 de 2 · Revisa antes de confirmar' : 'Listo'
}

export interface BitvavoSummary {
  /** Everything the preview found, new or not. */
  found: number
  /** Already imported: skipped. */
  duplicates: number
  /** Not imported yet; these are the ones «Importar» brings. */
  fresh: number
  /** Fresh ones that look like a movement of yours and need a choice. */
  toResolve: number
  incompatible: number
}

export function bitvavoSummary(preview: BitvavoPreview): BitvavoSummary {
  const duplicates = preview.operations.filter((operation) => operation.alreadyImported).length
  const toResolve = preview.operations.filter(
    (operation) => !operation.alreadyImported && operation.candidates.length > 0,
  ).length
  return {
    found: preview.operations.length,
    duplicates,
    fresh: preview.operations.length - duplicates,
    toResolve,
    incompatible: preview.incompatible.length,
  }
}

/** «Hemos encontrado 148 movimientos, 6 duplicados.» split in parts like the export one. */
export function bitvavoHeadline(summary: BitvavoSummary): ContentPart[] {
  return [
    { text: 'Hemos encontrado ', figure: false },
    { text: formatNumber(summary.found), figure: true },
    { text: ` ${count(summary.found, 'movimiento', 'movimientos')}, `, figure: false },
    { text: formatNumber(summary.duplicates), figure: true },
    { text: ` ${count(summary.duplicates, 'duplicado', 'duplicados')}.`, figure: false },
  ]
}

/** The line under the headline: what comes in and what is left out. */
export function bitvavoDetail(summary: BitvavoSummary): string {
  const fresh = `${formatNumber(summary.fresh)} ${count(summary.fresh, 'es nuevo', 'son nuevos')}`
  const skipped =
    summary.duplicates === 0
      ? ''
      : summary.duplicates === 1
        ? ' El duplicado ya estaba importado y se omite.'
        : ` Los ${formatNumber(summary.duplicates)} duplicados ya estaban importados y se omiten.`
  const incompatible =
    summary.incompatible === 0
      ? ''
      : ` ${formatNumber(summary.incompatible)} ${count(summary.incompatible, 'es incompatible y no se importa', 'son incompatibles y no se importan')}.`
  return `${fresh}.${skipped}${incompatible}`
}

/** Text of the confirm button: «Importar 142». */
export function bitvavoConfirmLabel(summary: BitvavoSummary): string {
  return `Importar ${formatNumber(summary.fresh)}`
}
