// @vitest-environment happy-dom
import { getActivePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as accounts from '../../../../src/db/repositories/accounts'
import { runWithDb } from '../../../../src/db/database'
import { useFinancialStateStore } from '../../../../src/stores/financial-state'
import { useRecurringStore } from '../../../../src/stores/recurring'
import { useSyncStore } from '../../../../src/stores/sync'
import { createTestPinia } from '../../../helpers/pinia'
import { startRoundTrip, type RoundTrip } from './harness'

const ACCOUNT_LEGACY = 'rule-write-checking'
const SAVINGS_LEGACY = 'rule-write-savings'

interface Seeded {
  accountId: string
  savingsId: string
  brokerId: string
}

let trip: RoundTrip
let seeded: Seeded
let today: string
let secondTab: ReturnType<typeof useSyncStore> | null = null

function setToday(value: string): void {
  today = value
  ;(window as Window & { __FINANCE_TODAY__?: string }).__FINANCE_TODAY__ = value
}

async function seedRows(
  db: Parameters<NonNullable<Parameters<typeof startRoundTrip>[0]>>[0],
  userId: string,
): Promise<Seeded> {
  const account = await runWithDb(
    db,
    accounts.create(userId, {
      legacyId: ACCOUNT_LEGACY,
      name: 'Cuenta',
      kind: 'cash',
      currency: 'EUR',
      openingBalance: 1000,
    }),
  )
  const savings = await runWithDb(
    db,
    accounts.create(userId, {
      legacyId: SAVINGS_LEGACY,
      name: 'Ahorro',
      kind: 'cash',
      currency: 'EUR',
      openingBalance: 0,
    }),
  )
  const broker = await runWithDb(
    db,
    accounts.create(userId, {
      legacyId: 'rule-write-broker',
      name: 'Broker',
      kind: 'investment',
      currency: 'EUR',
      openingBalance: 500,
    }),
  )
  await runWithDb(db, accounts.createCategory(userId, { name: 'Vivienda', kind: 'expense' }))
  await runWithDb(db, accounts.createCategory(userId, { name: 'Ocio', kind: 'expense' }))
  await runWithDb(db, accounts.createCategory(userId, { name: 'Cripto', kind: 'investment' }))
  await runWithDb(
    db,
    accounts.createCategory(userId, { name: 'Fondo de emergencia', kind: 'saving' }),
  )
  return { accountId: account.id, savingsId: savings.id, brokerId: broker.id }
}

function queueView(entries: Awaited<ReturnType<RoundTrip['pending']>>) {
  return (
    entries as Array<{
      seq: number
      command: {
        action: string
        entityType: string
        commandId: string
        data?: { id?: string; lastExecutionDate?: string | null; nextRunDate?: string | null }
        patch?: Record<string, unknown>
      }
    }>
  ).sort((left, right) => left.seq - right.seq)
}

describe('regla recurrente durable (#493)', () => {
  beforeEach(async () => {
    setToday('2026-03-15')
    trip = await startRoundTrip(async (db, userId) => {
      await seedRows(db, userId)
    })
    await trip.reload()
    // The local model addresses accounts by the id the bootstrap projects
    // (the legacy id of a migrated row), so resolve them after the reload.
    const financial = useFinancialStateStore()
    const byName = (name: string) =>
      [...financial.accounts, ...financial.investmentAssets].find(
        (account) => account.name === name,
      )!.id
    seeded = {
      accountId: byName('Cuenta'),
      savingsId: byName('Ahorro'),
      brokerId: byName('Broker'),
    }
  })

  afterEach(async () => {
    await secondTab?.dispose()
    secondTab = null
    trip.cleanup()
    delete (window as Window & { __FINANCE_TODAY__?: string }).__FINANCE_TODAY__
  })

  it('crea una regla sin conexión y tras recargar conserva regla, pendiente y calendario una sola vez', async () => {
    trip.setOffline(true)
    const recurring = useRecurringStore()
    const accepted = await recurring.addRule({
      type: 'expense',
      accountId: seeded.accountId,
      category: 'Vivienda',
      description: 'Alquiler',
      amount: 900,
      frequency: 'monthly',
      interval: 1,
      startDate: '2026-03-01',
    })
    expect(accepted).toBe(true)

    const rule = useRecurringStore().rules.find((item) => item.description === 'Alquiler')
    expect(rule).toBeDefined()
    const pending = useRecurringStore().openPendingMovements.filter(
      (item) => item.ruleId === rule!.id,
    )
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({
      occurrenceDate: '2026-03-01',
      amount: 900,
      status: 'pending',
    })

    // The durable order is rule, then the pendings it references, then the
    // calendar: an occurrence can never exist before its rule, and the rule's
    // calendar only advances once every occurrence is queued.
    const queued = queueView(await trip.pending())
    expect(queued.map((entry) => `${entry.command.entityType}:${entry.command.action}`)).toEqual([
      'recurringRule:create',
      'pendingMovement:create',
      'recurringRule:update',
    ])
    expect(queued[0].command.data?.id).toBe(rule!.id)
    const pendingCommand = queued[1].command as unknown as {
      data: { id: string; recurringRuleId: string; dueDate: string }
    }
    expect(pendingCommand.data.id).toBe(pending[0].id)
    expect(pendingCommand.data.recurringRuleId).toBe(rule!.id)
    expect(pendingCommand.data.dueDate).toBe('2026-03-01')

    // The calendar is durable only after the pendings: it is a later rule
    // update queued behind the occurrence, never part of the rule create.
    expect(queued[2].command.patch).toMatchObject({
      lastExecutionDate: '2026-03-01',
      nextRunDate: '2026-04-01',
    })
    expect(queued[0].command.data).toMatchObject({ lastExecutionDate: null, nextRunDate: '2026-03-01' })

    // A reload while still offline reuses the durable records: the same rule
    // and occurrence ids, one of each, and the accepted values.
    const offlineState = await trip.reloadOffline()
    const reloadedRule = offlineState.recurringRules.find((item) => item.id === rule!.id)
    expect(reloadedRule).toMatchObject({
      description: 'Alquiler',
      amount: 900,
      lastExecutionDate: '2026-03-01',
      nextOccurrenceDate: '2026-04-01',
    })
    const reloadedPending = offlineState.pendingMovements.filter(
      (item) => item.ruleId === rule!.id,
    )
    expect(reloadedPending).toHaveLength(1)
    expect(reloadedPending[0].id).toBe(pending[0].id)
    expect(offlineState.pendingMovements).toHaveLength(1)
    expect(offlineState.recurringRules).toHaveLength(1)
    expect(await trip.pending()).toHaveLength(3)

    // Reconnecting sends each queued command once; nothing is duplicated.
    trip.setOffline(false)
    const synced = await trip.reload()
    expect(synced.recurringRules).toHaveLength(1)
    expect(synced.recurringRules[0]).toMatchObject({
      id: rule!.id,
      amount: 900,
      lastExecutionDate: '2026-03-01',
      nextOccurrenceDate: '2026-04-01',
    })
    expect(synced.pendingMovements).toHaveLength(1)
    expect(synced.pendingMovements[0]).toMatchObject({
      id: pending[0].id,
      ruleId: rule!.id,
      status: 'pending',
    })
    expect(await trip.pending()).toEqual([])
    // No rule/pending command was published twice.
    const createIds = trip
      .commandBatches()
      .flat()
      .filter(
        (command) =>
          (command as { action?: string; entityType?: string }).action === 'create' &&
          ['recurringRule', 'pendingMovement'].includes(
            (command as { entityType?: string }).entityType ?? '',
          ),
      )
      .map((command) => (command as { commandId: string }).commandId)
    expect(new Set(createIds).size).toBe(createIds.length)
    expect(today).toBe('2026-03-15')
  })

  it('edita, pausa y refresca sin conexión sin perder ni duplicar ocurrencias', async () => {
    setToday('2026-04-15')
    const recurring = useRecurringStore()
    expect(
      await recurring.addRule({
        type: 'expense',
        accountId: seeded.accountId,
        category: 'Vivienda',
        description: 'Alquiler',
        amount: 900,
        frequency: 'monthly',
        interval: 1,
        startDate: '2026-03-01',
      }),
    ).toBe(true)
    const ruleId = useRecurringStore().rules[0].id
    const generated = useRecurringStore().openPendingMovements.map((item) => item.id).sort()
    expect(generated).toHaveLength(2)

    trip.setOffline(true)
    expect(
      await useRecurringStore().updateRule(ruleId, {
        type: 'expense',
        accountId: seeded.accountId,
        category: 'Vivienda',
        description: 'Alquiler ajustado',
        amount: 925,
        frequency: 'monthly',
        interval: 1,
        startDate: '2026-03-01',
      }),
    ).toBe(true)
    await useRecurringStore().toggleRule(ruleId, false)
    expect(useRecurringStore().rules[0]).toMatchObject({ active: false, amount: 925 })

    // A paused rule generates nothing; reactivating and refreshing adds only
    // the new occurrence, never a second copy of the existing ones.
    setToday('2026-05-15')
    await useRecurringStore().refreshPending()
    expect(useRecurringStore().openPendingMovements).toHaveLength(2)
    await useRecurringStore().toggleRule(ruleId, true)
    await useRecurringStore().refreshPending()
    expect(useRecurringStore().openPendingMovements).toHaveLength(3)

    const offline = await trip.reloadOffline()
    expect(offline.recurringRules).toHaveLength(1)
    expect(offline.recurringRules[0]).toMatchObject({
      id: ruleId,
      description: 'Alquiler ajustado',
      amount: 925,
      active: true,
    })
    expect(offline.pendingMovements).toHaveLength(3)
    expect(offline.pendingMovements.map((item) => item.occurrenceDate).sort()).toEqual([
      '2026-03-01',
      '2026-04-01',
      '2026-05-01',
    ])
    expect(generated.every((id) => offline.pendingMovements.some((item) => item.id === id))).toBe(
      true,
    )

    trip.setOffline(false)
    const synced = await trip.reload()
    expect(synced.recurringRules).toHaveLength(1)
    expect(synced.recurringRules[0]).toMatchObject({
      amount: 925,
      description: 'Alquiler ajustado',
      active: true,
      nextOccurrenceDate: '2026-06-01',
    })
    expect(synced.pendingMovements).toHaveLength(3)
    expect(await trip.pending()).toEqual([])
  })

  it('confirma un pendiente antes del primer envío de una regla recién creada', async () => {
    trip.setOffline(true)
    const recurring = useRecurringStore()

    // An investment rule and its occurrence are accepted offline; neither has
    // ever reached the server.
    expect(
      await recurring.addRule({
        type: 'investment',
        accountId: seeded.brokerId,
        category: 'Cripto',
        description: 'Compra BTC',
        amount: 10010,
        symbol: 'btc',
        side: 'buy',
        units: 0.5,
        unitPrice: 20000,
        fee: 10,
        time: '10:30',
        frequency: 'monthly',
        interval: 1,
        startDate: '2026-03-01',
      }),
    ).toBe(true)
    const rule = useRecurringStore().rules[0]
    const investmentPending = useRecurringStore().openPendingMovements.find(
      (item) => item.ruleId === rule.id,
    )!
    const confirmed = await useRecurringStore().confirmPending(investmentPending.id)
    expect(confirmed.accepted).toBe(true)
    if (!confirmed.accepted) throw new Error('No se aceptó el pendiente de inversión')

    const offline = await trip.reloadOffline()
    expect(
      offline.transactions.find((item) => item.id === confirmed.transactionId),
    ).toMatchObject({
      type: 'investment',
      symbol: 'BTC',
      side: 'buy',
      units: 0.5,
      unitPrice: 20000,
      fee: 10,
      time: '10:30',
      amount: 10010,
    })

    trip.setOffline(false)
    const synced = await trip.reload()
    expect(synced.transactions).toHaveLength(1)
    expect(synced.transactions[0]).toMatchObject({
      id: confirmed.transactionId,
      symbol: 'BTC',
      units: 0.5,
      unitPrice: 20000,
    })
    expect(synced.recurringRules).toHaveLength(1)
    expect(
      synced.pendingMovements.find((item) => item.id === investmentPending.id),
    ).toMatchObject({
      status: 'confirmed',
      transactionId: confirmed.transactionId,
      ruleId: rule.id,
    })
    // The confirmed pending references the rule that was created in the same
    // queue, in order: the rule create precedes the movement and the update.
    const ruleCreate = trip
      .commandBatches()
      .flat()
      .find(
        (command) =>
          (command as { action?: string; entityType?: string }).action === 'create' &&
          (command as { entityType?: string }).entityType === 'recurringRule',
      )
    expect(ruleCreate).toBeDefined()
  })

  it('confirma el pendiente de una regla de ahorro recién creada con su cuenta destino', async () => {
    trip.setOffline(true)
    expect(
      await useRecurringStore().addRule({
        type: 'saving',
        accountId: seeded.accountId,
        destinationAccountId: seeded.savingsId,
        category: 'Fondo de emergencia',
        description: 'Ahorro mensual',
        amount: 200,
        frequency: 'monthly',
        interval: 1,
        startDate: '2026-03-01',
      }),
    ).toBe(true)
    const rule = useRecurringStore().rules[0]
    const pending = useRecurringStore().openPendingMovements.find(
      (item) => item.ruleId === rule.id,
    )!
    const confirmed = await useRecurringStore().confirmPending(pending.id)
    expect(confirmed.accepted).toBe(true)
    if (!confirmed.accepted) throw new Error('No se aceptó el ahorro')

    trip.setOffline(false)
    const synced = await trip.reload()
    expect(synced.transactions.find((item) => item.id === confirmed.transactionId)).toMatchObject({
      type: 'saving',
      accountId: seeded.accountId,
      destinationAccountId: seeded.savingsId,
      amount: 200,
    })
    expect(synced.pendingMovements.find((item) => item.id === pending.id)).toMatchObject({
      status: 'confirmed',
      transactionId: confirmed.transactionId,
    })
  })

  it('un rechazo definitivo de la regla se reintenta con las mismas identidades', async () => {
    trip.setOffline(true)
    expect(
      await useRecurringStore().addRule({
        type: 'expense',
        accountId: seeded.accountId,
        category: 'Vivienda',
        description: 'Cuota rechazada',
        amount: 50,
        frequency: 'monthly',
        interval: 1,
        startDate: '2026-03-01',
      }),
    ).toBe(true)
    const ruleId = useRecurringStore().rules[0].id
    const pendingId = useRecurringStore().openPendingMovements[0].id
    const queued = (await trip.pending()) as Array<{
      command: { commandId: string; entityType: string; action: string }
    }>
    const ruleCreate = queued.find(
      (entry) =>
        entry.command.entityType === 'recurringRule' && entry.command.action === 'create',
    )!
    trip.rejectSyncCommand(ruleCreate.command.commandId, 'La cuenta ya no existe.')

    trip.setOffline(false)
    await trip.syncStore.syncNow()
    // The definitive failure is visible and the reservation keeps both works.
    const statuses = await vi.waitFor(
      async () => {
        const views = await useRecurringStore().ruleWriteStatus(ruleId)
        expect(views.some((view) => view.failure !== null)).toBe(true)
        return views
      },
      { timeout: 5000, interval: 20 },
    )
    expect(statuses.some((view) => view.failure !== null)).toBe(true)

    // Explicit retry: new command attempts, same rule/pending identities.
    const retried = await useRecurringStore().retryRuleWrite(ruleId)
    expect(retried.accepted).toBe(true)
    const synced = await trip.reload()
    expect(synced.recurringRules).toHaveLength(1)
    expect(synced.recurringRules[0].id).toBe(ruleId)
    expect(synced.pendingMovements).toHaveLength(1)
    expect(synced.pendingMovements[0]).toMatchObject({ id: pendingId, ruleId, status: 'pending' })
    expect(await trip.pending()).toEqual([])
  })

  it('descarta un guardado de regla antes de enviarlo sin dejar rastro', async () => {
    trip.setOffline(true)
    expect(
      await useRecurringStore().addRule({
        type: 'expense',
        accountId: seeded.accountId,
        category: 'Vivienda',
        description: 'Cuota descartada',
        amount: 50,
        frequency: 'monthly',
        interval: 1,
        startDate: '2026-03-01',
      }),
    ).toBe(true)
    const ruleId = useRecurringStore().rules[0].id
    const outcome = await useRecurringStore().discardRuleWrite(ruleId)
    expect(outcome.discarded).toBe(true)
    expect(outcome.kept).toBe(0)
    expect(await trip.pending()).toEqual([])

    const offline = await trip.reloadOffline()
    expect(offline.recurringRules).toHaveLength(0)
    expect(offline.pendingMovements).toHaveLength(0)

    trip.setOffline(false)
    const synced = await trip.reload()
    expect(synced.recurringRules).toHaveLength(0)
    expect(synced.pendingMovements).toHaveLength(0)
  })

  it('dos pestañas refrescan la misma regla con una sola ocurrencia y categoría', async () => {
    expect(
      await useRecurringStore().addRule({
        type: 'expense',
        accountId: seeded.accountId,
        category: 'Vivienda',
        description: 'Alquiler',
        amount: 900,
        frequency: 'monthly',
        interval: 1,
        startDate: '2026-03-01',
      }),
    ).toBe(true)
    await trip.reload()

    // A second tab: another Pinia and sync runtime over the same per-user
    // databases (the outbox is shared, the in-memory projections are not).
    const tabAPinia = getActivePinia()
    const tabARecurring = useRecurringStore()
    setActivePinia(createTestPinia())
    const tabBPinia = getActivePinia()!
    secondTab = useSyncStore()
    await secondTab.init(trip.userId)
    const tabBRecurring = useRecurringStore()
    expect(tabBRecurring.rules).toHaveLength(1)

    trip.setOffline(true)
    setToday('2026-04-15')
    trip.syncStore.connection = 'offline'
    secondTab.connection = 'offline'

    setActivePinia(tabAPinia!)
    await tabARecurring.refreshPending()
    const tabAIds = tabARecurring.openPendingMovements.map((item) => item.id)
    expect(tabARecurring.openPendingMovements).toHaveLength(2)

    // The second tab's projection has not seen the first tab's occurrence,
    // so it generates its own. The module recognises the queued occurrence
    // for the same rule+dueDate and does not publish a second one.
    setActivePinia(tabBPinia)
    await tabBRecurring.refreshPending()
    setActivePinia(tabAPinia!)

    const queued = await trip.pending()
    const pendingCreates = queued.filter(
      (entry) =>
        (entry as { command: { action: string; entityType: string } }).command.action === 'create' &&
        (entry as { command: { action: string; entityType: string } }).command.entityType ===
          'pendingMovement',
    )
    expect(pendingCreates).toHaveLength(1)

    await secondTab.dispose()
    secondTab = null
    trip.setOffline(false)
    trip.syncStore.connection = 'online'
    const synced = await trip.reload()
    expect(synced.recurringRules).toHaveLength(1)
    expect(synced.pendingMovements.map((item) => item.occurrenceDate).sort()).toEqual([
      '2026-03-01',
      '2026-04-01',
    ])
    // One occurrence per due date: the first tab's identity wins.
    expect(synced.pendingMovements.map((item) => item.id).sort()).toEqual(
      tabAIds.sort(),
    )
    // The category already existed, so no tab minted a duplicate one.
    const categoryCreates = trip
      .commandBatches()
      .flat()
      .filter(
        (command) =>
          (command as { action?: string; entityType?: string }).action === 'create' &&
          (command as { entityType?: string }).entityType === 'category',
      )
    expect(categoryCreates).toEqual([])
    expect(await trip.pending()).toEqual([])
  })

  it('elimina una regla sin conexión sin encolar pendientes condenados por la cascada', async () => {
    const recurring = useRecurringStore()
    const created = await recurring.addRule({
      type: 'expense',
      accountId: seeded.accountId,
      category: 'Vivienda',
      description: 'Alquiler',
      amount: 900,
      frequency: 'monthly',
      interval: 1,
      startDate: '2026-03-01',
    })
    expect(created).toBe(true)
    await trip.reload()
    const rule = useRecurringStore().rules.find((item) => item.description === 'Alquiler')!

    trip.setOffline(true)
    await useRecurringStore().removeRule(rule.id)
    expect(await trip.pending()).toHaveLength(1)
    const [remove] = queueView(await trip.pending())
    expect(remove.command).toMatchObject({ entityType: 'recurringRule', action: 'remove' })

    // The server deletes the rule's pendings through the cascade: no doomed
    // pending update is queued behind the remove.
    trip.setOffline(false)
    // `reload()` restarts the client (a fresh sync store) and its drain keeps
    // syncing until a clean cycle clears `lastError`, so the error a rejected
    // command leaves can only be read from the live client right after the
    // one cycle that sends the removal.
    await trip.syncStore.syncNow()
    expect(trip.syncStore.lastError).toBeNull()
    const synced = await trip.reload()
    expect(synced.recurringRules).toHaveLength(0)
    expect(synced.pendingMovements).toHaveLength(0)
    const pendingCommands = trip
      .commandBatches()
      .flat()
      .filter(
        (command) =>
          (command as { entityType?: string }).entityType === 'pendingMovement' &&
          (command as { action?: string }).action !== 'create',
      )
    expect(pendingCommands).toEqual([])
  })
})
