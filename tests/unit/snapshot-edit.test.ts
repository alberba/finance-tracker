import { describe, expect, it } from 'vitest'
import { computed, nextTick, ref } from 'vue'

import { useSnapshotEdit, type SnapshotCommitEdit } from '../../src/composables/useSnapshotEdit'
import { buildWealthViewModel } from '../../src/domain/wealth/view-model'
import type { State } from '../../src/scripts/types'

/** Banco opens at 1.000 and has 1.200 saved for February. */
function initialState(): State {
  return {
    year: 2020,
    accounts: [
      { id: 'bank', name: 'Banco', openingBalance: 1000 },
      { id: 'cash', name: 'Efectivo', openingBalance: 50 },
    ],
    investmentAssets: [{ id: 'fund', name: 'Fondo', openingBalance: 2000 }],
    liabilities: [{ id: 'car', name: 'Coche', openingBalance: 500 }],
    transactions: [],
    snapshots: {
      '1': { month: 1, accounts: { bank: 1200 }, investments: {}, liabilities: {} },
    },
  } as unknown as State
}

function setup() {
  const state = ref(initialState())
  const month = ref(1)
  const commits: SnapshotCommitEdit[][] = []
  const groups = computed(() => buildWealthViewModel(state.value, month.value).groups)
  const edit = useSnapshotEdit({
    groups,
    context: computed(() => `${state.value.year}:${month.value}`),
    commit: (edits) => commits.push(edits),
  })
  return { state, month, commits, edit }
}

describe('useSnapshotEdit', () => {
  it('starts from what the month has stored', () => {
    const { edit } = setup()

    expect(edit.field('accounts', 'bank')).toMatchObject({ text: '1200', effective: 1200 })
    expect(edit.field('accounts', 'cash')).toMatchObject({ text: '', effective: 50 })
    expect(edit.totals.value).toEqual({
      accounts: 1250,
      investments: 2000,
      liabilities: 500,
      net: 1250 + 2000 - 500,
    })
    expect(edit.changes.value).toBe(0)
  })

  it('previews an emptied field with the calculated balance, without the correction it removes', () => {
    const { edit, commits } = setup()

    edit.set('accounts', 'bank', '')

    expect(edit.field('accounts', 'bank')?.effective).toBe(1000)
    expect(edit.totals.value.accounts).toBe(1050)
    expect(edit.save()).toBe(true)
    expect(commits[0]).toContainEqual({ kind: 'accounts', id: 'bank', value: null })
  })

  it('keeps an invalid field as typed, keeps the stored balance and refuses to save', () => {
    const { edit, commits } = setup()

    edit.set('accounts', 'cash', '70')
    edit.set('accounts', 'bank', '12x')

    expect(edit.field('accounts', 'bank')).toMatchObject({
      text: '12x',
      invalid: true,
      effective: 1200,
    })
    expect(edit.valid.value).toBe(false)
    expect(edit.totals.value.accounts).toBe(1200 + 70)
    expect(edit.save()).toBe(false)
    expect(commits).toHaveLength(0)

    edit.set('accounts', 'bank', '1.300,5')
    expect(edit.save()).toBe(true)
    expect(commits[0]).toEqual([
      { kind: 'accounts', id: 'bank', value: 1300.5 },
      { kind: 'accounts', id: 'cash', value: 70 },
      { kind: 'investments', id: 'fund', value: null },
      { kind: 'liabilities', id: 'car', value: null },
    ])
  })

  it('reads zero as an explicit balance and debt as a subtraction', () => {
    const { edit } = setup()

    edit.set('accounts', 'bank', '0')
    edit.set('liabilities', 'car', '800,25')

    expect(edit.field('accounts', 'bank')).toMatchObject({ parsed: 0, effective: 0 })
    expect(edit.totals.value).toMatchObject({ accounts: 50, liabilities: 800.25 })
    expect(edit.totals.value.net).toBe(50 + 2000 - 800.25)
  })

  it('counts the changes, and a field typed back to its stored value is no change', () => {
    const { edit } = setup()

    edit.set('accounts', 'cash', '70')
    edit.set('accounts', 'bank', '1300')
    expect(edit.changes.value).toBe(2)

    edit.set('accounts', 'bank', '1200')
    expect(edit.changes.value).toBe(1)

    edit.discard()
    expect(edit.changes.value).toBe(0)
    expect(edit.field('accounts', 'cash')?.text).toBe('')
  })

  it('keeps what the user is typing through a refresh of the same month', async () => {
    const { state, edit } = setup()
    edit.set('accounts', 'bank', '1500')

    const next = initialState()
    next.snapshots['1'].accounts = { bank: 1250, cash: 60 }
    state.value = next
    await nextTick()

    expect(edit.field('accounts', 'bank')).toMatchObject({ text: '1500', edited: true })
    expect(edit.field('accounts', 'cash')).toMatchObject({ text: '60', edited: false })
    expect(edit.changes.value).toBe(1)

    edit.discard()
    expect(edit.field('accounts', 'bank')?.text).toBe('1250')
  })

  it('starts a fresh edit when the month or the year changes', async () => {
    const { state, month, edit } = setup()
    edit.set('accounts', 'bank', '1500')

    month.value = 2
    await nextTick()
    expect(edit.field('accounts', 'bank')?.text).toBe('')
    expect(edit.changes.value).toBe(0)

    month.value = 1
    await nextTick()
    edit.set('accounts', 'bank', '1500')
    state.value = { ...state.value, year: 2021 }
    await nextTick()
    expect(edit.changes.value).toBe(0)
  })

  it('applies a calculated balance as a pending change, saving nothing', () => {
    const { edit, commits } = setup()

    edit.set('investments', 'fund', '2100,5')

    expect(edit.field('investments', 'fund')).toMatchObject({ effective: 2100.5, edited: true })
    expect(commits).toHaveLength(0)
  })
})
