import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as accountsRepository from '../../../../src/db/repositories/accounts'
import * as userSettingsRepository from '../../../../src/db/repositories/user-settings'
import { applySyncBatch } from '../../../../src/lib/server/sync/apply-command'
import { createTestDb, type TestDatabase } from '../setup'
import { seedAccount, seedUser } from '../repositories/fixtures'
import { runWithDb } from '../../../../src/db/database'
import * as syncRepository from '../../../../src/db/repositories/sync'
import { projectSyncV2State } from '../../../../src/lib/client/v2-state-projection'
import { applyPendingCommands } from '../../../../src/lib/client/pending-overlay'
import { settingsUpdateCommandSchema } from '../../../../src/lib/server/sync/command-schemas'
import { applyRemoteChanges, emptyReadModel } from '../../../../src/lib/client/sync-read-model'

/**
 * `user_settings` has no `entityId` to address, so `baseVersion` is its only
 * optimistic-concurrency guard (audit §6.4): two devices changing the currency
 * used to end in a silent last-write-wins with no conflict the queue could
 * rebase.
 */
describe('settingsUpdate carries optimistic concurrency (audit §6.4)', () => {
  let testDb: TestDatabase
  let userId: string

  beforeEach(async () => {
    testDb = createTestDb()
    userId = (await seedUser(testDb.db)).id
  })

  afterEach(() => {
    testDb.close()
  })

  it('applies the patch when baseVersion matches the stored settings', async () => {
    const settings = await runWithDb(
      testDb.db,
      userSettingsRepository.create(userId, { currency: 'EUR' }),
    )

    const result = await runWithDb(
      testDb.db,
      applySyncBatch(userId, [
        {
          commandId: 'settings-fresh',
          action: 'settingsUpdate',
          baseVersion: settings.version,
          patch: { currency: 'USD' },
        },
      ]),
    )

    expect(result.results[0].status).toBe('applied')
    expect((await runWithDb(testDb.db, userSettingsRepository.get(userId)))?.currency).toBe('USD')

    // The change log must carry the resulting row (including `version`), not
    // the patch: otherwise another device throws the settings away and loses
    // the version guard for its next write.
    const changes = await runWithDb(testDb.db, syncRepository.listChangesSince(userId, 0))
    const settingsChange = changes.find((change) => change.entityType === 'userSettings')
    expect(settingsChange).toBeDefined()
    const payload = JSON.parse(settingsChange!.payload!)
    expect(payload).toMatchObject({ currency: 'USD', version: settings.version + 1 })
    const projected = applyRemoteChanges(
      emptyReadModel(),
      [settingsChange!],
      settingsChange!.revision,
    )
    expect(projected.settings).toMatchObject({ currency: 'USD', version: settings.version + 1 })
  })

  it('conflicts on a stale baseVersion, reports the stored version and leaves the row alone', async () => {
    const settings = await runWithDb(
      testDb.db,
      userSettingsRepository.create(userId, { currency: 'EUR' }),
    )
    // Another device moved the row on after this one read it.
    await runWithDb(
      testDb.db,
      userSettingsRepository.update(userId, { currency: 'GBP' }, settings.version),
    )

    const result = await runWithDb(
      testDb.db,
      applySyncBatch(userId, [
        {
          commandId: 'settings-stale',
          action: 'settingsUpdate',
          baseVersion: settings.version,
          patch: { currency: 'USD' },
        },
      ]),
    )

    expect(result.results[0]).toMatchObject({
      status: 'conflict',
      currentVersion: settings.version + 1,
    })
    expect(result.halted).toBe(true)
    expect((await runWithDb(testDb.db, userSettingsRepository.get(userId)))?.currency).toBe('GBP')
  })

  it('treats a patch the server already holds as a replay, not a conflict', async () => {
    const settings = await runWithDb(
      testDb.db,
      userSettingsRepository.create(userId, { currency: 'EUR' }),
    )
    await runWithDb(
      testDb.db,
      userSettingsRepository.update(userId, { currency: 'USD' }, settings.version),
    )

    const result = await runWithDb(
      testDb.db,
      applySyncBatch(userId, [
        {
          commandId: 'settings-replay',
          action: 'settingsUpdate',
          baseVersion: settings.version,
          patch: { currency: 'USD' },
        },
      ]),
    )

    expect(result.results[0].status).toBe('noop')
  })

  it('does not read a TWR-only command as an already-applied replay', async () => {
    const account = await seedAccount(testDb.db, userId)
    const settings = await runWithDb(
      testDb.db,
      userSettingsRepository.create(userId, { currency: 'EUR' }),
    )
    await runWithDb(
      testDb.db,
      userSettingsRepository.update(userId, { currency: 'GBP' }, settings.version),
    )

    // The patch carries no settings column at all, and an empty patch is
    // trivially "already held". Reading that as a replay would skip the TWR
    // write entirely, so it has to be a conflict.
    const stale = await runWithDb(
      testDb.db,
      applySyncBatch(userId, [
        {
          commandId: 'twr-stale',
          action: 'settingsUpdate',
          baseVersion: settings.version,
          patch: { twrLiquidityAccountIds: [account.id] },
        },
      ]),
    )
    expect(stale.results[0].status).toBe('conflict')
    expect(
      await runWithDb(testDb.db, accountsRepository.listTwrLiquidityAccountsByUser(userId)),
    ).toHaveLength(0)

    const fresh = await runWithDb(
      testDb.db,
      applySyncBatch(userId, [
        {
          commandId: 'twr-fresh',
          action: 'settingsUpdate',
          baseVersion: settings.version + 1,
          patch: { twrLiquidityAccountIds: [account.id] },
        },
      ]),
    )
    expect(fresh.results[0].status).toBe('applied')
    expect(
      await runWithDb(testDb.db, accountsRepository.listTwrLiquidityAccountsByUser(userId)),
    ).toMatchObject([{ accountId: account.id }])
  })

  it('still creates settings for a command that carries no baseVersion', async () => {
    const result = await runWithDb(
      testDb.db,
      applySyncBatch(userId, [
        { commandId: 'settings-legacy', action: 'settingsUpdate', patch: { currency: 'USD' } },
      ]),
    )

    expect(result.results[0].status).toBe('applied')
    expect((await runWithDb(testDb.db, userSettingsRepository.get(userId)))?.currency).toBe('USD')
  })
})

describe('dashboard layout through sync', () => {
  it('survives the outbox schema, offline projection, storage and remote changes', async () => {
    const database = createTestDb()
    try {
      const user = await seedUser(database.db)
      const layout = { version: 1 as const, items: [{ id: 'goals', col: 0, row: 0, w: 2, h: 3 }] }
      const command = settingsUpdateCommandSchema.parse({
        commandId: 'layout-save',
        action: 'settingsUpdate',
        patch: { dashboardLayout: layout },
      })
      expect(
        projectSyncV2State(applyPendingCommands(emptyReadModel(), [command])).dashboardLayout,
      ).toEqual(layout)
      const result = await runWithDb(database.db, applySyncBatch(user.id, [command]))
      expect(result.results[0].status).toBe('applied')
      expect(
        (await runWithDb(database.db, userSettingsRepository.get(user.id)))?.dashboardLayout,
      ).toEqual(layout)
      const changes = await runWithDb(database.db, syncRepository.listChangesSince(user.id, 0))
      const remote = applyRemoteChanges(emptyReadModel(), changes, result.revision)
      expect(projectSyncV2State(remote).dashboardLayout).toEqual(layout)
      const reset = settingsUpdateCommandSchema.parse({
        commandId: 'layout-reset',
        action: 'settingsUpdate',
        patch: { dashboardLayout: null },
      })
      expect(projectSyncV2State(applyPendingCommands(remote, [reset])).dashboardLayout).toBeNull()
      await runWithDb(database.db, applySyncBatch(user.id, [reset]))
      expect(
        (await runWithDb(database.db, userSettingsRepository.get(user.id)))?.dashboardLayout,
      ).toBeNull()
    } finally {
      database.close()
    }
  })
})

describe('investment grouping through sync', () => {
  it('survives the outbox schema, offline projection, storage and remote changes', async () => {
    const database = createTestDb()
    try {
      const user = await seedUser(database.db)
      const command = settingsUpdateCommandSchema.parse({
        commandId: 'grouping-save',
        action: 'settingsUpdate',
        patch: { investmentGrouping: 'type' },
      })
      expect(
        projectSyncV2State(applyPendingCommands(emptyReadModel(), [command])).investmentGrouping,
      ).toBe('type')
      const result = await runWithDb(database.db, applySyncBatch(user.id, [command]))
      expect(result.results[0].status).toBe('applied')
      expect(
        (await runWithDb(database.db, userSettingsRepository.get(user.id)))?.investmentGrouping,
      ).toBe('type')
      const changes = await runWithDb(database.db, syncRepository.listChangesSince(user.id, 0))
      const remote = applyRemoteChanges(emptyReadModel(), changes, result.revision)
      expect(projectSyncV2State(remote).investmentGrouping).toBe('type')
    } finally {
      database.close()
    }
  })

  it('is by account until someone chooses otherwise, and rejects a grouping that does not exist', () => {
    expect(projectSyncV2State(emptyReadModel()).investmentGrouping).toBe('account')
    expect(() =>
      settingsUpdateCommandSchema.parse({
        commandId: 'grouping-bad',
        action: 'settingsUpdate',
        patch: { investmentGrouping: 'broker' },
      }),
    ).toThrow()
  })
})
