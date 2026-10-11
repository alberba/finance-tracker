import { computed, reactive, ref, watch, type Ref } from 'vue'

import {
  formatSnapshotInput,
  parseSnapshotInput,
  snapshotKey,
  type SnapshotGroupViewModel,
  type SnapshotRowViewModel,
  type SnapshotTotals,
} from '../domain/wealth/view-model'
import { round2 } from '../lib/number'
import type { SnapshotKind } from '../scripts/types'

/** One field of the snapshot as edited. */
export interface SnapshotField {
  /** The text in the field, as typed. */
  text: string
  /** A number, null for "use the calculated balance", NaN when it is not a number. */
  parsed: number | null
  invalid: boolean
  /** Differs from what the month has stored. */
  edited: boolean
  /**
   * The balance the field stands for: what saving would store, or the
   * calculated one when it is empty. An invalid field keeps the stored balance,
   * since nothing of the edit is saved until it is fixed.
   */
  effective: number
}

export interface SnapshotCommitEdit {
  kind: SnapshotKind
  id: string
  /** null removes the stored balance, back to the calculated one. */
  value: number | null
}

interface Options {
  groups: Ref<SnapshotGroupViewModel[]>
  /** The year and month being edited; changing it starts a fresh edit. */
  context: Ref<string>
  commit: (edits: SnapshotCommitEdit[]) => void
}

/**
 * The edit of a month's wealth snapshot: what each field means, the totals it
 * adds up to, the pending changes, and saving or discarding them. The ledger,
 * the band total and the calculator all read from here, so the preview is what
 * saving stores.
 */
export function useSnapshotEdit({ groups, context, commit }: Options) {
  const texts = reactive<Record<string, string>>({})
  const stored = ref<Record<string, string>>({})

  function storedTexts(): Record<string, string> {
    const next: Record<string, string> = {}
    for (const group of groups.value) {
      for (const row of group.rows) {
        next[snapshotKey(group.kind, row.id)] = formatSnapshotInput(row.snapshot)
      }
    }
    return next
  }

  function discard(): void {
    const next = storedTexts()
    stored.value = next
    for (const key of Object.keys(texts)) delete texts[key]
    Object.assign(texts, next)
  }

  // A refresh of the same month keeps what the user is typing and takes the
  // new values of the untouched fields.
  function refresh(): void {
    const previous = stored.value
    const next = storedTexts()
    for (const key of Object.keys(texts)) {
      if (!(key in next)) delete texts[key]
    }
    for (const [key, value] of Object.entries(next)) {
      const edited = key in texts && texts[key] !== previous[key]
      if (!edited) texts[key] = value
    }
    stored.value = next
  }

  watch(context, discard)
  watch(groups, refresh)
  discard()

  function fieldOf(kind: SnapshotKind, row: SnapshotRowViewModel): SnapshotField {
    const key = snapshotKey(kind, row.id)
    const text = texts[key] ?? ''
    const parsed = parseSnapshotInput(text)
    const invalid = parsed !== null && Number.isNaN(parsed)
    let effective = parsed ?? row.calculated
    if (invalid) effective = row.snapshot ?? row.calculated
    return { text, parsed, invalid, edited: text !== (stored.value[key] ?? ''), effective }
  }

  const fields = computed(() => {
    const result: Record<string, SnapshotField> = {}
    for (const group of groups.value) {
      for (const row of group.rows)
        result[snapshotKey(group.kind, row.id)] = fieldOf(group.kind, row)
    }
    return result
  })

  const totals = computed<SnapshotTotals>(() => {
    const sums: SnapshotTotals = { accounts: 0, investments: 0, liabilities: 0, net: 0 }
    for (const group of groups.value) {
      for (const row of group.rows)
        sums[group.kind] += fields.value[snapshotKey(group.kind, row.id)].effective
      sums[group.kind] = round2(sums[group.kind])
    }
    sums.net = round2(sums.accounts + sums.investments - sums.liabilities)
    return sums
  })

  const changes = computed(() => Object.values(fields.value).filter((field) => field.edited).length)
  const valid = computed(() => Object.values(fields.value).every((field) => !field.invalid))

  function field(kind: SnapshotKind, id: string): SnapshotField | undefined {
    return fields.value[snapshotKey(kind, id)]
  }

  function set(kind: SnapshotKind, id: string, text: string): void {
    texts[snapshotKey(kind, id)] = text
  }

  /** Saves the edit; refuses while a field is invalid. */
  function save(): boolean {
    if (!valid.value) return false
    const edits: SnapshotCommitEdit[] = []
    for (const group of groups.value) {
      for (const row of group.rows) {
        const { parsed } = fields.value[snapshotKey(group.kind, row.id)]
        edits.push({ kind: group.kind, id: row.id, value: parsed })
      }
    }
    commit(edits)
    return true
  }

  return { field, set, totals, changes, valid, save, discard }
}

export type SnapshotEdit = ReturnType<typeof useSnapshotEdit>
