// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'

import { useEntrySheet, type InvestmentEntryPreset } from '../../src/composables/useEntrySheet'
import type { PendingMovement } from '../../src/scripts/types'

const pending: PendingMovement = {
  id: 'p1',
  occurrenceKey: 'r1:2026-11-01',
  ruleId: 'r1',
  occurrenceDate: '2026-11-01',
  type: 'expense',
  accountId: 'a',
  category: 'Casa',
  description: 'Alquiler',
  amount: 800,
  status: 'pending',
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
  transactionId: null,
}

const preset: InvestmentEntryPreset = { side: 'buy', symbol: 'VWCE', category: 'ETF' }

/** A click whose `currentTarget` is `button`, as the browser sets it while the handler runs. */
function clickOn(button: HTMLElement): MouseEvent {
  const event = new MouseEvent('click')
  Object.defineProperty(event, 'currentTarget', { value: button })
  return event
}

describe('useEntrySheet', () => {
  afterEach(() => {
    const sheet = useEntrySheet()
    sheet.closeEntrySheet()
    sheet.takeReturnFocus()
    sheet.pending.value = null
    sheet.investmentPreset.value = null
  })

  it('comparte un único estado entre todos los que lo usan', () => {
    expect(useEntrySheet().open).toBe(useEntrySheet().open)
  })

  it('abre la hoja vacía para un movimiento nuevo y devuelve el foco al botón', () => {
    const sheet = useEntrySheet()
    const button = document.createElement('button')
    sheet.pending.value = pending
    sheet.investmentPreset.value = preset

    sheet.openEntrySheet(clickOn(button))

    expect(sheet.open.value).toBe(true)
    expect(sheet.pending.value).toBeNull()
    expect(sheet.investmentPreset.value).toBeNull()
    expect(sheet.takeReturnFocus()).toBe(button)
  })

  it('sin evento o sin un elemento HTML no hay a dónde devolver el foco', () => {
    const sheet = useEntrySheet()
    sheet.openEntrySheet()
    expect(sheet.open.value).toBe(true)
    expect(sheet.takeReturnFocus()).toBeNull()

    const event = new MouseEvent('click')
    Object.defineProperty(event, 'currentTarget', { value: window })
    sheet.openEntrySheet(event)
    expect(sheet.takeReturnFocus()).toBeNull()
  })

  it('abre una inversión ya rellenada con la operación y el activo', () => {
    const sheet = useEntrySheet()
    const button = document.createElement('button')
    sheet.pending.value = pending

    sheet.openInvestmentEntry(preset, clickOn(button))

    expect(sheet.open.value).toBe(true)
    expect(sheet.pending.value).toBeNull()
    expect(sheet.investmentPreset.value).toEqual(preset)
    expect(sheet.takeReturnFocus()).toBe(button)
  })

  it('una inversión abierta sin evento no guarda foco anterior', () => {
    const sheet = useEntrySheet()
    sheet.openEntrySheet(clickOn(document.createElement('button')))
    sheet.openInvestmentEntry({ ...preset, side: 'sell', accountId: 'a', currency: 'USD' })
    expect(sheet.investmentPreset.value).toMatchObject({ side: 'sell', currency: 'USD' })
    expect(sheet.takeReturnFocus()).toBeNull()
  })

  it('edita una copia del pendiente y devuelve el foco al elemento indicado', () => {
    const sheet = useEntrySheet()
    const row = document.createElement('li')
    sheet.investmentPreset.value = preset

    sheet.openPendingEdit(pending, row)

    expect(sheet.open.value).toBe(true)
    expect(sheet.pending.value).toEqual(pending)
    expect(sheet.pending.value).not.toBe(pending)
    expect(sheet.investmentPreset.value).toBeNull()
    expect(sheet.takeReturnFocus()).toBe(row)
  })

  it('entrega el foco una sola vez', () => {
    const sheet = useEntrySheet()
    const row = document.createElement('li')
    sheet.openPendingEdit(pending, row)
    expect(sheet.takeReturnFocus()).toBe(row)
    expect(sheet.takeReturnFocus()).toBeNull()
  })

  it('cerrar la hoja la cierra sin vaciar lo que contiene', () => {
    const sheet = useEntrySheet()
    sheet.openPendingEdit(pending)
    sheet.closeEntrySheet()
    expect(sheet.open.value).toBe(false)
    expect(sheet.pending.value).toEqual(pending)
  })
})
