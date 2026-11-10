import { describe, expect, it } from 'vitest'

import { buildWealthViewModel } from '../../src/domain/wealth/view-model'
import type { SnapshotField } from '../../src/composables/useSnapshotEdit'
import type { Month } from '../../src/lib/month'
import type { State } from '../../src/scripts/types'
import {
  accountDetail,
  balanceDate,
  closeCard,
  coverMonth,
  closeAction,
  closeStatus,
  closingEdits,
  ledgerGroups,
  monthTable,
  composition,
  evolution,
  holdings,
  monthTotals,
} from '../../src/neon/sections/wealth/view-model'

/**
 * A past year, so every month is available. January is closed in full,
 * February only stores the bank, and March brings a 400 € income to the bank.
 *
 *          bank   cash   fund   car (debt)   net
 *   Jan    1000     50   2000   500          2550
 *   Feb    1200     50   2000   500          2750
 *   Mar+   1600     50   2000   500          3150
 */
function state(): State {
  return {
    year: 2020,
    accounts: [
      { id: 'bank', name: 'Banco', openingBalance: 1000 },
      { id: 'cash', name: 'Efectivo en mano', openingBalance: 50 },
    ],
    investmentAssets: [{ id: 'fund', name: 'Fondo', openingBalance: 2000 }],
    liabilities: [{ id: 'car', name: 'Coche', openingBalance: 500 }],
    transactions: [
      {
        id: 'pay',
        date: '2020-03-05',
        month: 3,
        type: 'income',
        accountId: 'bank',
        category: 'Nómina',
        description: 'Nómina',
        amount: 400,
      },
    ],
    snapshots: {
      '1': {
        month: 1,
        accounts: { bank: 1000, cash: 50 },
        investments: { fund: 2000 },
        liabilities: { car: 500 },
      },
      '2': { month: 2, accounts: { bank: 1200 }, investments: {}, liabilities: {} },
    },
  } as unknown as State
}

const vm = (month: Month = 3, from: State = state()) => buildWealthViewModel(from, month)

describe('monthTotals', () => {
  it('adds each group at the month and subtracts the debt from the net', () => {
    expect(monthTotals(vm(), 2)).toEqual({
      accounts: 1250,
      investments: 2000,
      liabilities: 500,
      net: 2750,
    })
    expect(monthTotals(vm(), 3).net).toBe(3150)
  })
})

describe('closeStatus', () => {
  it('reads a month with a stored balance as closed', () => {
    expect(closeStatus(vm(), 2)).toEqual({ closed: true, text: 'Febrero cerrado' })
    expect(closeStatus(vm(), 3)).toEqual({ closed: false, text: 'Marzo sin cerrar' })
  })
})

describe('evolution', () => {
  it('draws the net worth at the close of each month, hollow while the month is open', () => {
    const chart = evolution(vm(), 'month', 'line')

    expect(chart.points.map((point) => point.label)).toEqual([
      'Ene',
      'Feb',
      'Mar',
      'Abr',
      'May',
      'Jun',
      'Jul',
      'Ago',
      'Sep',
      'Oct',
      'Nov',
      'Dic',
    ])
    expect(chart.points.slice(0, 3).map((point) => point.open)).toEqual([false, false, true])
    expect(chart.note).toBe('+600,00\u00a0€ desde enero. El último dato aún no está cerrado.')
  })

  it('reads the move since the first month in whole euros, with its tone', () => {
    expect(evolution(vm(), 'month', 'line').delta).toEqual({
      text: '+600\u00a0€',
      since: 'desde enero',
      tone: 'gain',
    })
  })

  it('rounds the scale to at most four steps around the values', () => {
    const chart = evolution(vm(), 'month', 'line')

    expect(chart.ticks.map((tick) => tick.label)).toEqual([
      '2,4\u00a0mil\u00a0€',
      '2,6\u00a0mil\u00a0€',
      '2,8\u00a0mil\u00a0€',
      '3\u00a0mil\u00a0€',
      '3,2\u00a0mil\u00a0€',
    ])
    // 2550 sits 150 above the 2400 floor of an 800-wide scale.
    expect(chart.points[0].y).toBeCloseTo(81.25)
  })

  it('starts the bars at zero so their height reads as the amount', () => {
    const chart = evolution(vm(), 'month', 'bars')

    expect(chart.ticks[0].label).toBe('0\u00a0€')
    // 2550 of a 0–4000 scale.
    expect(chart.points[0].y).toBeCloseTo(36.25)
  })

  it('keeps the last month of each quarter and shows the value under few points', () => {
    const chart = evolution(vm(), 'quarter', 'line')

    expect(chart.points.map((point) => [point.label, point.sub])).toEqual([
      ['T1', '3,2\u00a0mil\u00a0€'],
      ['T2', '3,2\u00a0mil\u00a0€'],
      ['T3', '3,2\u00a0mil\u00a0€'],
      ['T4', '3,2\u00a0mil\u00a0€'],
    ])
    expect(chart.label).toBe(
      'Patrimonio por trimestre: T1 3.150,00\u00a0€, T2 3.150,00\u00a0€, T3 3.150,00\u00a0€, T4 3.150,00\u00a0€',
    )
  })
})

describe('composition', () => {
  it('splits the assets by weight, biggest first, leaving the debt out', () => {
    const mix = composition(vm(), 3)

    expect(
      mix.segments.map((segment) => [segment.name, segment.note, segment.pct, segment.tone]),
    ).toEqual([
      ['Fondo', 'Inversión', '55\u00a0%', 'lilac'],
      ['Banco', 'Efectivo', '44\u00a0%', 'lilac2'],
      ['Efectivo en mano', 'Efectivo', '1\u00a0%', 'lilac3'],
    ])
    expect(mix.note).toBe('3.650,00\u00a0€ en activos. Fondo pesa más: 55\u00a0%.')
  })

  it('folds everything past the third biggest into one «Resto»', () => {
    const many = state()
    many.accounts.push(
      { id: 'd', name: 'Hucha', openingBalance: 30 },
      { id: 'e', name: 'Monedero', openingBalance: 20 },
    )
    const mix = composition(vm(3, many), 3)

    expect(mix.segments.map((segment) => [segment.name, segment.note, segment.value])).toEqual([
      ['Fondo', 'Inversión', '2.000,00\u00a0€'],
      ['Banco', 'Efectivo', '1.600,00\u00a0€'],
      ['Efectivo en mano', 'Efectivo', '50,00\u00a0€'],
      ['Resto', '2 cuentas o activos', '50,00\u00a0€'],
    ])
  })
})

describe('holdings', () => {
  it('lists each group with its total, its count and each row with its share', () => {
    const groups = holdings(vm(3), 3)

    expect(groups.map((group) => [group.title, group.total, group.count])).toEqual([
      ['Efectivo', '1.650,00\u00a0€', '2 cuentas'],
      ['Inversión', '2.000,00\u00a0€', '1 activo'],
      ['Pasivos', '−500,00\u00a0€', '1 pasivo'],
    ])
    expect(groups[0].rows.map((row) => [row.name, row.value, row.share])).toEqual([
      ['Banco', '1.600,00\u00a0€', '97\u00a0%'],
      ['Efectivo en mano', '50,00\u00a0€', '3\u00a0%'],
    ])
  })

  it('says whether a balance was written down or comes from the movements', () => {
    expect(holdings(vm(2), 2)[0].rows.map((row) => row.note)).toEqual([
      'Apuntado en febrero',
      'Calculado con tus movimientos',
    ])
  })
})

describe('accountDetail', () => {
  it('reads the balance at the picked month against the month before', () => {
    const detail = accountDetail(vm(), 'accounts', 'bank', 3)!

    expect(detail).toMatchObject({ name: 'Banco', group: 'Efectivo', value: '1.600,00\u00a0€' })
    expect(detail.delta).toEqual({ text: '+400,00\u00a0€', note: 'desde febrero', tone: 'gain' })
    expect(detail.tiles).toEqual([
      { label: 'Del patrimonio', value: '44\u00a0%', tone: 'plain' },
      { label: 'Desde enero', value: '+60,0\u00a0%', tone: 'gain' },
      { label: 'Saldo inicial', value: '1.000,00\u00a0€', tone: 'plain' },
    ])
  })

  it('draws one bar per month, the lowest short and the highest full', () => {
    const { bars } = accountDetail(vm(), 'accounts', 'bank', 3)!

    expect(bars).toHaveLength(12)
    expect(bars.slice(0, 3).map((bar) => [bar.label, bar.height, bar.selected])).toEqual([
      ['Ene', 20, false],
      ['Feb', 47, false],
      ['Mar', 100, true],
    ])
    expect(bars[2].aria).toBe('Marzo: 1.600,00\u00a0€')
  })

  it('has nothing to compare the first month with', () => {
    expect(accountDetail(vm(), 'accounts', 'bank', 1)!.delta).toBeNull()
  })

  it('reads a debt as negative and outside the share of the assets', () => {
    const detail = accountDetail(vm(), 'liabilities', 'car', 3)!

    expect(detail.value).toBe('−500,00\u00a0€')
    expect(detail.delta).toEqual({ text: 'Sin cambios', note: 'desde febrero', tone: 'muted' })
    expect(detail.tiles[0]).toEqual({ label: 'Del patrimonio', value: '—', tone: 'plain' })
  })

  it('is gone when the account no longer exists', () => {
    expect(accountDetail(vm(), 'accounts', 'nope', 3)).toBeNull()
  })
})

describe('ledgerGroups', () => {
  it('puts the month before next to each field, with the calculated balance as its hint', () => {
    const [cash, , debt] = ledgerGroups(vm(3), 3)

    expect(cash).toMatchObject({ title: 'Efectivo', count: '2 cuentas' })
    expect(cash.rows[0]).toEqual({
      id: 'bank',
      kind: 'accounts',
      name: 'Banco',
      prev: '1.200,00\u00a0€',
      placeholder: '1.600,00',
      aria: 'Saldo de Banco en marzo',
    })
    // A debt is typed as what is owed, so the month before reads positive too.
    expect(debt.rows[0].prev).toBe('500,00\u00a0€')
  })

  it('has no month before in January', () => {
    expect(ledgerGroups(vm(1), 1)[0].rows[0].prev).toBe('—')
  })
})

describe('closeAction', () => {
  it('closes an open month, with or without edits', () => {
    expect(closeAction({ month: 3, closed: false, changes: 0, invalid: false })).toEqual({
      label: 'Cerrar marzo',
      text: 'Sin editar: se cierra con el saldo calculado',
      locked: false,
    })
    expect(closeAction({ month: 3, closed: false, changes: 2, invalid: false }).text).toBe(
      '2 saldos editados, sin cerrar',
    )
  })

  it('saves the edits of a closed month and rests once nothing changed', () => {
    expect(closeAction({ month: 3, closed: true, changes: 1, invalid: false })).toEqual({
      label: 'Guardar cambios',
      text: '1 saldo editado, sin guardar',
      locked: false,
    })
    expect(closeAction({ month: 3, closed: true, changes: 0, invalid: false })).toEqual({
      label: 'Cerrado',
      text: 'Cerrado con los saldos guardados',
      locked: true,
    })
  })

  it('asks to fix an invalid balance first', () => {
    expect(closeAction({ month: 3, closed: false, changes: 1, invalid: true }).text).toBe(
      'Corrige los saldos no válidos para cerrar el mes.',
    )
  })
})

describe('closingEdits', () => {
  const field = (text: string, parsed: number | null, effective: number): SnapshotField => ({
    text,
    parsed,
    invalid: parsed !== null && Number.isNaN(parsed),
    edited: text !== '',
    effective,
  })

  it('stores what was typed and the calculated balance of every field left empty', () => {
    const fields: Record<string, SnapshotField> = {
      'accounts:bank': field('1500', 1500, 1500),
      'accounts:cash': field('', null, 50),
      'investments:fund': field('', null, 2000),
      'liabilities:car': field('', null, 500),
    }
    const edits = closingEdits(vm(3).groups, (kind, id) => fields[`${kind}:${id}`])

    expect(edits).toEqual([
      { kind: 'accounts', id: 'bank', value: 1500 },
      { kind: 'accounts', id: 'cash', value: 50 },
      { kind: 'investments', id: 'fund', value: 2000 },
      { kind: 'liabilities', id: 'car', value: 500 },
    ])
  })

  it('refuses while a field is not a number', () => {
    const edits = closingEdits(vm(3).groups, (kind, id) =>
      kind === 'accounts' && id === 'bank' ? field('12x', Number.NaN, 1600) : field('', null, 0),
    )
    expect(edits).toBeNull()
  })
})

describe('monthTable', () => {
  it('marks each month closed or not and rounds the cells to euros', () => {
    const table = monthTable(vm())

    expect(
      table.months.slice(0, 3).map((month) => [month.short, month.closed, month.aria]),
    ).toEqual([
      ['Ene', true, 'Enero, cerrado'],
      ['Feb', true, 'Febrero, cerrado'],
      ['Mar', false, 'Marzo, sin cerrar'],
    ])
    const net = table.rows[table.rows.length - 1]
    expect(net.label).toBe('Patrimonio neto')
    expect(net.cells.slice(0, 3).map((cell) => cell.text)).toEqual(['2.550', '2.750', '3.150'])
  })

  it('colors only a closed month that moves more than 10 % and 300 € from a closed one', () => {
    const big = state()
    big.snapshots['2'].accounts.bank = 1600
    const bank = monthTable(vm(3, big)).rows.find((row) => row.label === 'Banco')!

    // Jan → Feb: +600 € and +60 %, both closed. Mar is still open.
    expect(bank.cells.slice(0, 3).map((cell) => cell.tone)).toEqual(['plain', 'gain', 'muted'])
  })

  it('names the groups as the new design does and keeps the debt negative', () => {
    const rows = monthTable(vm()).rows.filter((row) => row.kind === 'group')
    expect(rows.map((row) => row.label)).toEqual(['Efectivo', 'Inversión', 'Pasivos'])
    expect(rows[2].cells[0].text).toBe('−500')
  })
})

describe('cover texts', () => {
  it('talks about the last month of the year reached so far', () => {
    expect(coverMonth(vm())).toBe(12)
  })

  it('invites to close an open month and to look back at a closed one', () => {
    expect(closeCard(vm(), 3)).toEqual({
      title: 'Marzo está sin cerrar',
      note: 'Apunta el saldo real de cada cuenta a fin de mes para que el balance cuadre.',
      action: 'Cerrar marzo',
    })
    expect(closeCard(vm(), 2)).toEqual({
      title: 'Febrero está cerrado',
      note: 'Los saldos de febrero ya están apuntados. Puedes corregirlos o ver los meses anteriores.',
      action: 'Ver balance por meses',
    })
  })

  it('dates the balances today while the month runs, at its close otherwise', () => {
    const today = new Date(2020, 2, 20)
    expect(balanceDate(2020, 3, today)).toBe('Saldos calculados a 20 de marzo.')
    expect(balanceDate(2019, 12, today)).toBe('Saldos al cierre de diciembre.')
  })
})
