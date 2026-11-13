import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The page-local link targets are keyed by owner: one user's unresolved link
 * must never decide that another user's write is an explicit unlink (#487
 * review). The observable effect lives in `buildMovementPublications`, which
 * is what marks a publication `unlinked`.
 */
const session = vi.hoisted(() => ({
  userId: 'user-a' as string | null,
  getEntityRef: vi.fn(async () => null),
  peekPendingCreateId: vi.fn(async () => null),
}))

vi.mock('../../src/stores/sync', () => ({ useSyncStore: () => session }))
vi.mock('../../src/lib/client/command-mapping', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/client/command-mapping')>()
  return {
    ...actual,
    resolveEntityId: vi.fn(async () => 'srv-account'),
    resolveOrCreateCategoryId: vi.fn(async () => 'srv-category'),
  }
})

import { forgetLinkTargets, rememberLinkTargets } from '../../src/lib/client/link-targets'
import { buildMovementPublications } from '../../src/lib/client/movement-commands'
import { useFinancialStateStore } from '../../src/stores/financial-state'
import type { Transaction } from '../../src/scripts/types'

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
    ...overrides,
  }
}

async function unlinkedFlag(before: Transaction, after: Transaction): Promise<boolean | undefined> {
  setActivePinia(createPinia())
  useFinancialStateStore().commitState((draft) => {
    draft.transactions = [after]
  })
  const publications = await buildMovementPublications([before], [after], 'EUR')
  expect(publications).toHaveLength(1)
  return publications[0].unlinked
}

describe('objetivos de vinculación por usuario', () => {
  beforeEach(() => {
    session.userId = 'user-a'
    forgetLinkTargets('user-a')
    forgetLinkTargets('user-b')
  })

  it('marca el desvínculo explícito del mismo usuario', async () => {
    rememberLinkTargets('user-a', ['movement-1'], 'instrument-a')
    await expect(
      unlinkedFlag(movement({ instrumentId: 'instrument-a' }), movement()),
    ).resolves.toBe(true)
  })

  it('no hereda objetivos de otro usuario en una publicación posterior', async () => {
    // The previous session linked movement-1; the next user signs in and edits
    // a movement that happens to share the id.
    rememberLinkTargets('user-a', ['movement-1'], 'instrument-a')
    session.userId = 'user-b'

    await expect(
      unlinkedFlag(movement({ instrumentId: 'instrument-a' }), movement()),
    ).resolves.toBeUndefined()
  })

  it('olvida los objetivos cuando la intención deja de estar resolviéndose', async () => {
    rememberLinkTargets('user-a', ['movement-1'], 'instrument-a')
    forgetLinkTargets('user-a', ['movement-1'])

    await expect(
      unlinkedFlag(movement({ instrumentId: 'instrument-a' }), movement()),
    ).resolves.toBeUndefined()
  })
})
