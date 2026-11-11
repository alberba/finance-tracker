import { describe, expect, it } from 'vitest'

import type { BitvavoPreview } from '../../src/lib/bitvavo-types'
import type { OutboxEntry } from '../../src/lib/client/outbox'
import {
  bitvavoConfirmLabel,
  bitvavoDetail,
  bitvavoHeadline,
  bitvavoSummary,
  exportContents,
  importStepLabel,
  pendingWord,
  queueRows,
  sinceLabel,
  syncView,
  type SyncInput,
} from '../../src/neon/sections/data/view-model'

const sentence = (parts: Array<{ text: string }>) => parts.map((part) => part.text).join('')

describe('exportContents', () => {
  it('names what a copy holds, with the figures apart', () => {
    const parts = exportContents({
      totalTransactions: 1214,
      totalSnapshots: 38,
      totalContributions: 24,
      meta: '',
    })
    expect(sentence(parts)).toBe('Contiene 1.214 movimientos, 38 snapshots y 24 aportes.')
    expect(parts.filter((part) => part.figure).map((part) => part.text)).toEqual([
      '1.214',
      '38',
      '24',
    ])
  })

  it('uses the singular for one and keeps zero as a figure', () => {
    const parts = exportContents({
      totalTransactions: 1,
      totalSnapshots: 0,
      totalContributions: 1,
      meta: '',
    })
    expect(sentence(parts)).toBe('Contiene 1 movimiento, 0 snapshots y 1 aporte.')
  })
})

describe('sinceLabel', () => {
  it('counts seconds, minutes and hours since the last check', () => {
    const now = 10_000_000
    expect(sinceLabel(null, now)).toBeNull()
    expect(sinceLabel(now - 12_000, now)).toBe('hace 12 s')
    expect(sinceLabel(now - 180_000, now)).toBe('hace 3 min')
    expect(sinceLabel(now - 2 * 3_600_000, now)).toBe('hace 2 h')
    expect(sinceLabel(now + 5_000, now)).toBe('hace 0 s')
  })
})

describe('pendingWord', () => {
  it('agrees with the count', () => {
    expect(pendingWord(0)).toBe('nada pendiente')
    expect(pendingWord(1)).toBe('cambio pendiente')
    expect(pendingWord(2)).toBe('cambios pendientes')
  })
})

describe('syncView', () => {
  const NOW = 1_000_000
  const base: SyncInput = {
    demo: false,
    online: true,
    status: 'idle',
    pendingCount: 0,
    lastCheckedAt: NOW - 12_000,
    now: NOW,
  }

  it('says everything is sent when nothing waits', () => {
    expect(syncView(base)).toEqual({
      label: 'Sincronizado',
      meta: 'hace 12 s',
      dot: 'ok',
      button: 'Sincronizar ahora',
      canSync: true,
      pending: { figure: '0', word: 'nada pendiente' },
    })
  })

  it('counts what is waiting and lights the dot', () => {
    const view = syncView({ ...base, pendingCount: 2 })
    expect(view.label).toBe('Pendiente de enviar')
    expect(view.meta).toBe('(2 pendientes) · hace 12 s')
    expect(view.dot).toBe('pending')
    expect(view.pending).toEqual({ figure: '2', word: 'cambios pendientes' })
    expect(syncView({ ...base, pendingCount: 1 }).meta).toBe('(1 pendiente) · hace 12 s')
  })

  it('shows the cycle running and blocks a second one', () => {
    const view = syncView({ ...base, status: 'syncing' })
    expect(view).toMatchObject({
      label: 'Sincronizando…',
      button: 'Sincronizando…',
      canSync: false,
    })
    expect(view.dot).toBe('idle')
  })

  it('reports offline and a failed cycle', () => {
    expect(syncView({ ...base, online: false })).toMatchObject({
      label: 'Sin conexión',
      canSync: false,
    })
    expect(syncView({ ...base, status: 'error' })).toMatchObject({
      label: 'No se pudo sincronizar',
      dot: 'pending',
      canSync: true,
    })
  })

  it('leaves out the time before the first check', () => {
    expect(syncView({ ...base, lastCheckedAt: null }).meta).toBe('')
    expect(syncView({ ...base, lastCheckedAt: null, pendingCount: 3 }).meta).toBe('(3 pendientes)')
  })

  it('has nothing to sync in the demo', () => {
    expect(syncView({ ...base, demo: true })).toMatchObject({
      label: 'Sin sincronización',
      dot: 'idle',
      canSync: false,
    })
  })
})

function entry(seq: number, command: Record<string, unknown>): OutboxEntry {
  return {
    seq,
    command: { commandId: `c${seq}`, ...command } as OutboxEntry['command'],
    enqueuedAt: '2026-10-09T10:00:00Z',
    attempts: 0,
  }
}

describe('queueRows', () => {
  it('describes a created movement with its concept and amount', () => {
    const rows = queueRows([
      entry(1, {
        action: 'create',
        entityType: 'transaction',
        data: { description: 'Mercadona', amount: 64.32 },
      }),
    ])
    expect(rows).toEqual([
      { key: 1, kind: 'Movimiento', text: 'Mercadona · 64,32\u00a0€', act: 'Crear' },
    ])
  })

  it('falls back to the amount, the name or the kind of what changed', () => {
    const rows = queueRows([
      entry(1, { action: 'create', entityType: 'transaction', data: { amount: 300 } }),
      entry(2, {
        action: 'update',
        entityType: 'account',
        entityId: 'a',
        patch: { name: 'Nómina' },
      }),
      entry(3, { action: 'remove', entityType: 'goal', entityId: 'g' }),
      entry(4, { action: 'settingsUpdate', patch: { theme: 'x' } }),
    ])
    expect(rows.map(({ kind, text, act }) => [kind, text, act])).toEqual([
      ['Movimiento', '300,00\u00a0€', 'Crear'],
      ['Cuenta', 'Nómina', 'Editar'],
      ['Objetivo', 'Objetivo', 'Eliminar'],
      ['Ajustes', 'Preferencias', 'Editar'],
    ])
  })

  it('keeps the order of the outbox', () => {
    const rows = queueRows([
      entry(7, { action: 'remove', entityType: 'transaction', entityId: 'a' }),
      entry(9, { action: 'remove', entityType: 'transaction', entityId: 'b' }),
    ])
    expect(rows.map((row) => row.key)).toEqual([7, 9])
  })
})

describe('importStepLabel', () => {
  it('numbers the two steps and then says it is done', () => {
    expect(importStepLabel('origin')).toBe('Paso 1 de 2 · Elige de dónde viene')
    expect(importStepLabel('review')).toBe('Paso 2 de 2 · Revisa antes de confirmar')
    expect(importStepLabel('done')).toBe('Listo')
  })
})

function operation(
  externalId: string,
  extra: Partial<BitvavoPreview['operations'][number]> = {},
): BitvavoPreview['operations'][number] {
  return {
    provider: 'bitvavo',
    externalId,
    executedAt: '2026-03-01T10:00:00Z',
    timeZone: 'Europe/Madrid',
    date: '2026-03-01',
    time: '11:00:00',
    side: 'buy',
    symbol: 'BTC',
    quantity: '0.1',
    unitPrice: '50000',
    fee: '0',
    cashAmount: '5000',
    currency: 'EUR',
    candidates: [],
    alreadyImported: false,
    ...extra,
  }
}

function preview(
  operations: BitvavoPreview['operations'],
  incompatible: BitvavoPreview['incompatible'] = [],
): BitvavoPreview {
  return {
    connectionVersion: 1,
    id: 'p1',
    accountId: 'a1',
    from: 0,
    to: 1,
    timeZone: 'Europe/Madrid',
    operations,
    incompatible,
  }
}

describe('Bitvavo preview', () => {
  const mixed = preview(
    [
      operation('a'),
      operation('b'),
      operation('c', { alreadyImported: true }),
      operation('d', { candidates: [{ id: 't', description: 'Compra BTC', date: '2026-03-01' }] }),
    ],
    [{ externalId: 'x', reason: 'Divisa no compatible' }],
  )

  it('splits what is found into new, duplicate and to resolve', () => {
    expect(bitvavoSummary(mixed)).toEqual({
      found: 4,
      duplicates: 1,
      fresh: 3,
      toResolve: 1,
      incompatible: 1,
    })
  })

  it('does not ask to resolve what is already imported', () => {
    const summary = bitvavoSummary(
      preview([
        operation('a', {
          alreadyImported: true,
          candidates: [{ id: 't', description: 'x', date: '2026-03-01' }],
        }),
      ]),
    )
    expect(summary).toMatchObject({ duplicates: 1, fresh: 0, toResolve: 0 })
  })

  it('writes the headline, the detail and the button', () => {
    const summary = bitvavoSummary(mixed)
    expect(sentence(bitvavoHeadline(summary))).toBe('Hemos encontrado 4 movimientos, 1 duplicado.')
    expect(bitvavoDetail(summary)).toBe(
      '3 son nuevos. El duplicado ya estaba importado y se omite. 1 es incompatible y no se importa.',
    )
    expect(bitvavoConfirmLabel(summary)).toBe('Importar 3')
  })

  it('agrees the plural with the artboard sentence', () => {
    const summary = {
      found: 148,
      duplicates: 6,
      fresh: 142,
      toResolve: 0,
      incompatible: 0,
    }
    expect(sentence(bitvavoHeadline(summary))).toBe(
      'Hemos encontrado 148 movimientos, 6 duplicados.',
    )
    expect(bitvavoDetail(summary)).toBe(
      '142 son nuevos. Los 6 duplicados ya estaban importados y se omiten.',
    )
    expect(bitvavoConfirmLabel(summary)).toBe('Importar 142')
  })
})
