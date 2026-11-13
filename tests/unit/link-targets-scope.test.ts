import { setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { forgetLinkTargets, rememberLinkTargets } from '../../src/lib/client/link-targets'
import { buildMovementPublications } from '../../src/lib/client/movement-commands'
import { useFinancialStateStore } from '../../src/stores/financial-state'
import { useSyncStore } from '../../src/stores/sync'
import { createTestPinia } from '../helpers/pinia'
import type { Transaction } from '../../src/scripts/types'

/**
 * The page-local link targets are keyed by owner: one user's unresolved link
 * must never decide that another user's write is an explicit unlink (#487
 * review). The observable effect lives in `buildMovementPublications`, which
 * is what marks a publication `unlinked`.
 */
function movement(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'movement-1',
    date: '2026-01-10',
    month: 1,
    type: 'investment',
    accountId: 'checking',
    category: 'Cripto',
    description: 'Compra',
    amount: 100,
    // An imported operation publishes only its declaration and description,
    // so the test stays on the link decision instead of reference resolution.
    remoteOperation: {
      provider: 'bitvavo',
      externalId: 'ext-1',
      executedAt: '2026-01-10T09:30:00.000Z',
      timeZone: 'Europe/Madrid',
      date: '2026-01-10',
      time: '09:30',
      side: 'buy',
      symbol: 'BTC-EUR',
      quantity: '0.001',
      unitPrice: '100',
      fee: '0',
      cashAmount: '0.1',
      currency: 'EUR',
    },
    ...overrides,
  }
}

async function unlinkedFlag(
  ownerUserId: string,
  before: Transaction,
  after: Transaction,
): Promise<boolean | undefined> {
  setActivePinia(createTestPinia())
  useSyncStore().userId = ownerUserId
  useFinancialStateStore().commitState((draft) => {
    draft.transactions = [after]
  })
  const publications = await buildMovementPublications([before], [after], 'EUR')
  expect(publications).not.toBeNull()
  expect(publications).toHaveLength(1)
  return publications![0].unlinked
}

describe('objetivos de vinculación por usuario', () => {
  beforeEach(() => {
    forgetLinkTargets('user-a')
    forgetLinkTargets('user-b')
  })

  it('marca el desvínculo explícito del mismo usuario', async () => {
    rememberLinkTargets('user-a', ['movement-1'], 'instrument-a')
    await expect(
      unlinkedFlag('user-a', movement({ instrumentId: 'instrument-a' }), movement()),
    ).resolves.toBe(true)
  })

  it('no hereda objetivos de otro usuario en una publicación posterior', async () => {
    // The previous session linked movement-1; the next user signs in and edits
    // a movement that happens to share the id.
    rememberLinkTargets('user-a', ['movement-1'], 'instrument-a')

    await expect(
      unlinkedFlag('user-b', movement({ instrumentId: 'instrument-a' }), movement()),
    ).resolves.toBeUndefined()
  })

  it('olvida los objetivos cuando la intención deja de estar resolviéndose', async () => {
    rememberLinkTargets('user-a', ['movement-1'], 'instrument-a')
    forgetLinkTargets('user-a', ['movement-1'])

    await expect(
      unlinkedFlag('user-a', movement({ instrumentId: 'instrument-a' }), movement()),
    ).resolves.toBeUndefined()
  })
})
