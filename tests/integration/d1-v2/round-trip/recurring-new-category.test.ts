// @vitest-environment happy-dom
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import * as accounts from '../../../../src/db/repositories/accounts'
import { runWithDb } from '../../../../src/db/database'
import { categories, pendingMovements, transactions } from '../../../../src/db/schema'
import { useRecurringStore } from '../../../../src/stores/recurring'
import { seedRentPending, startRoundTrip, type RoundTrip } from './harness'

/**
 * Confirming an investment pending whose category does not exist on the server
 * yet: the movement and the pending both resolve that same category. They must
 * agree on its id, or the pending's status change references a category that
 * never gets created (issue #283).
 */

const CASH_LEGACY = 'new-category-cash'
const BROKER_LEGACY = 'new-category-broker'

let trip: RoundTrip
let pendingId: string

beforeEach(async () => {
  trip = await startRoundTrip(async (db, userId) => {
    await seedRentPending(db, userId, CASH_LEGACY)
    await runWithDb(
      db,
      accounts.create(userId, {
        legacyId: BROKER_LEGACY,
        name: 'Broker',
        kind: 'investment',
        currency: 'EUR',
        openingBalance: 500,
      }),
    )
  })
  await trip.reload()
  pendingId = useRecurringStore().openPendingMovements[0].id
})

afterEach(() => {
  trip.cleanup()
})

/** The pending becomes a crypto purchase in a category that exists nowhere yet. */
function confirmAsNewCategoryInvestment() {
  return useRecurringStore().confirmPending(pendingId, {
    type: 'investment',
    accountId: BROKER_LEGACY,
    category: 'Cripto',
    description: 'Compra ETH',
    amount: 1,
    symbol: 'eth',
    side: 'buy',
    units: 0.01,
    unitPrice: 1000,
    time: '10:30',
  })
}

/** What the server ended up with, read straight from the rows. */
async function serverRows() {
  const { db, userId } = { db: trip.testDb.db, userId: trip.userId }
  const created = await db.select().from(categories).where(eq(categories.userId, userId))
  const cripto = created.filter((row) => row.name === 'Cripto' && row.kind === 'investment')
  const [pending] = await db
    .select()
    .from(pendingMovements)
    .where(eq(pendingMovements.id, 'pending-rent'))
  const movements = await db.select().from(transactions).where(eq(transactions.userId, userId))
  return { cripto, pending, movements }
}

describe('confirmar un pendiente de inversión con una categoría nueva (#283)', () => {
  it('crea la categoría una sola vez y el pendiente la referencia tras sincronizar', async () => {
    trip.setOffline(true)
    const outcome = await confirmAsNewCategoryInvestment()
    expect(outcome.accepted).toBe(true)
    if (!outcome.accepted) throw new Error('No se aceptó')
    await trip.reloadOffline()

    trip.setOffline(false)
    const synced = await trip.reload()

    const { cripto, pending, movements } = await serverRows()
    expect(cripto).toHaveLength(1)
    expect(movements).toHaveLength(1)
    expect(movements[0]).toMatchObject({ id: outcome.transactionId, categoryId: cripto[0].id })
    expect(pending).toMatchObject({
      status: 'confirmed',
      transactionId: outcome.transactionId,
      categoryId: cripto[0].id,
    })
    expect(synced.pendingMovements[0]).toMatchObject({
      status: 'confirmed',
      category: 'Cripto',
      transactionId: outcome.transactionId,
    })
    expect(await trip.pending()).toHaveLength(0)
  })
})
