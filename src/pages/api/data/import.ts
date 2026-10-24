/**
 * `POST /api/data/import` (WP4) — accepts the same shape `GET
 * /api/data/export` produces (every collection optional) and re-creates it
 * for the authenticated user, inside one transaction.
 *
 * Every imported row gets a **new** server-generated id (repositories never
 * accept a client-supplied `id` — see WP1's "UUIDv7 generated server-side"
 * design decision), so foreign keys in the import payload (`accountId`,
 * `categoryId`, `recurringRuleId`, `contributionId`, `snapshotId`) are
 * remapped from the payload's old ids to the newly created rows' ids as
 * each collection is inserted, in dependency order (categories/accounts
 * first, leaf rows last). Rows whose referenced parent wasn't present in
 * the same payload (or itself failed to import) are skipped and reported
 * under `skipped`, rather than failing the whole import.
 *
 * With `?mode=replace` the user's current rows are wiped first, in the same
 * transaction, so restoring a backup leaves exactly the backup — not the
 * backup appended to what was there. Without it the rows are added.
 *
 * `integration_credentials` is never accepted here — the export never
 * includes it, and this route does not touch that repository.
 */

import type { APIRoute } from 'astro'
import { getDb } from '../../../db/client'
import * as accountsRepository from '../../../db/repositories/accounts'
import * as transactionsRepository from '../../../db/repositories/transactions'
import * as subscriptionsRepository from '../../../db/repositories/subscriptions'
import * as recurringRulesRepository from '../../../db/repositories/recurring-rules'
import * as pendingMovementsRepository from '../../../db/repositories/pending-movements'
import * as budgetEntriesRepository from '../../../db/repositories/budget-entries'
import * as goalsRepository from '../../../db/repositories/goals'
import { runWithDb } from '../../../db/database'
import * as wealthRepository from '../../../db/repositories/wealth'
import * as contributionsRepository from '../../../db/repositories/contributions'
import * as marketRepository from '../../../db/repositories/market'
import * as stockeventsSymbolMappingsRepository from '../../../db/repositories/stockevents-symbol-mappings'
import * as stockeventsCashMappingsRepository from '../../../db/repositories/stockevents-cash-mappings'
import * as userSettingsRepository from '../../../db/repositories/user-settings'
import { jsonResponse, requirePrincipal, withApiErrorHandling } from '../../../lib/server/api-auth'
import * as syncRepository from '../../../db/repositories/sync'
import { runInTransaction } from '../../../db/repositories/shared'
import type { MovementOperationInput } from '../../../db/repositories/transactions'
import type { RemoteOperation } from '../../../lib/bitvavo-types'
import { wipeUserData } from '../../../lib/server/wipe-user-data'
import { quoteConfigurationSchema } from '../../../lib/server/sync/command-schemas'

type Row = Record<string, unknown>

function remapId(map: Map<string, string>, oldId: unknown): string | undefined {
  if (typeof oldId !== 'string') {
    return undefined
  }
  return map.get(oldId)
}

/** Remaps an optional nullable FK field: `undefined` in → `undefined` out; present-but-unresolvable → `"__skip__"` sentinel. */
function remapOptionalId(
  map: Map<string, string>,
  oldId: unknown,
): string | null | undefined | '__skip__' {
  if (oldId === undefined) {
    return undefined
  }
  if (oldId === null) {
    return null
  }
  const mapped = remapId(map, oldId)
  return mapped ?? '__skip__'
}

interface ImportSummary {
  imported: Record<string, number>
  skipped: Record<string, number>
}

export const POST: APIRoute = async ({ request, locals, url }) =>
  withApiErrorHandling('/api/data/import', async () => {
    const principal = requirePrincipal(locals)

    let body: Row
    try {
      const parsedBody = await request.json()
      if (!parsedBody || typeof parsedBody !== 'object') {
        return jsonResponse({ error: 'Payload de importación inválido.' }, 400)
      }
      body = parsedBody as Row
    } catch {
      return jsonResponse({ error: 'Cuerpo JSON inválido.' }, 400)
    }

    const db = getDb(locals)
    const userId = principal.userId
    const replace = url?.searchParams.get('mode') === 'replace'

    const imported: Record<string, number> = {}
    const skipped: Record<string, number> = {}
    const bump = (record: Record<string, number>, key: string) => {
      record[key] = (record[key] ?? 0) + 1
    }

    const summary: ImportSummary = await runInTransaction(db, async (tx) => {
      const previousSettings = await runWithDb(tx, userSettingsRepository.get(userId))
      const onboarding = {
        onboardingPresented: previousSettings
          ? previousSettings.onboardingPresented === 1
          : optionalFlag((body.settings as Row | undefined)?.onboardingPresented),
        onboardingDismissed: previousSettings
          ? previousSettings.onboardingDismissed === 1
          : optionalFlag((body.settings as Row | undefined)?.onboardingDismissed),
        onboardingAccountCompleted: previousSettings
          ? previousSettings.onboardingAccountCompleted === 1
          : optionalFlag((body.settings as Row | undefined)?.onboardingAccountCompleted),
        onboardingMovementCompleted: previousSettings
          ? previousSettings.onboardingMovementCompleted === 1
          : optionalFlag((body.settings as Row | undefined)?.onboardingMovementCompleted),
        onboardingCompleted: previousSettings
          ? previousSettings.onboardingCompleted === 1
          : optionalFlag((body.settings as Row | undefined)?.onboardingCompleted),
      }
      if (replace) {
        await wipeUserData(tx, userId)
      }
      const categoryIdMap = new Map<string, string>()
      const accountIdMap = new Map<string, string>()
      const recurringRuleIdMap = new Map<string, string>()
      const wealthSnapshotIdMap = new Map<string, string>()
      const contributionIdMap = new Map<string, string>()

      // -- categories (no FK dependency) --------------------------------
      for (const row of asRows(body.categories)) {
        const created = await accountsRepository.createCategory(tx, userId, {
          legacyId: typeof row.legacyId === 'string' ? row.legacyId : null,
          name: String(row.name ?? ''),
          kind: String(row.kind ?? ''),
          sortOrder: typeof row.sortOrder === 'number' ? row.sortOrder : 0,
          emoji: optionalString(row.emoji),
        })
        if (typeof row.id === 'string') {
          categoryIdMap.set(row.id, created.id)
        }
        bump(imported, 'categories')
      }

      // -- accounts (no FK dependency) ------------------------------------
      for (const row of asRows(body.accounts)) {
        const created = await accountsRepository.create(tx, userId, {
          legacyId: typeof row.legacyId === 'string' ? row.legacyId : null,
          name: String(row.name ?? ''),
          kind: String(row.kind ?? ''),
          currency: String(row.currency ?? 'EUR'),
          openingBalance: typeof row.openingBalance === 'number' ? row.openingBalance : 0,
          isArchived: Boolean(row.isArchived),
        })
        if (typeof row.id === 'string') {
          accountIdMap.set(row.id, created.id)
        }
        bump(imported, 'accounts')
      }

      // -- twrLiquidityAccounts (FK: accountId required) -------------------
      for (const row of asRows(body.twrLiquidityAccounts)) {
        const accountId = remapId(accountIdMap, row.accountId)
        if (!accountId) {
          bump(skipped, 'twrLiquidityAccounts')
          continue
        }
        await accountsRepository.createTwrLiquidityAccount(tx, userId, {
          legacyId: optionalString(row.legacyId),
          accountId,
          name: String(row.name ?? ''),
        })
        bump(imported, 'twrLiquidityAccounts')
      }

      // -- transactions (FK: accountId, categoryId) ------------------------
      for (const row of asRows(body.transactions)) {
        const accountId = remapId(accountIdMap, row.accountId)
        if (!accountId) {
          bump(skipped, 'transactions')
          continue
        }
        const categoryId = remapOptionalId(categoryIdMap, row.categoryId)
        const destinationAccountId = remapOptionalId(accountIdMap, row.destinationAccountId)
        if (categoryId === '__skip__' || destinationAccountId === '__skip__') {
          bump(skipped, 'transactions')
          continue
        }
        await transactionsRepository.create(tx, userId, {
          legacyId: typeof row.legacyId === 'string' ? row.legacyId : null,
          accountId,
          destinationAccountId: destinationAccountId ?? null,
          categoryId: categoryId ?? null,
          type: String(row.type ?? ''),
          date: String(row.date ?? ''),
          description: typeof row.description === 'string' ? row.description : null,
          amount: typeof row.amount === 'number' ? row.amount : 0,
          currency: String(row.currency ?? 'EUR'),
          time: optionalString(row.time),
          declared: Boolean(row.declared),
          accountingMonth:
            Number.isInteger(row.accountingMonth) &&
            (row.accountingMonth as number) >= 1 &&
            (row.accountingMonth as number) <= 12
              ? (row.accountingMonth as number)
              : null,
          operation: await importOperation(tx, row.operation),
          externalId: optionalString(row.externalId),
          remoteOperation: isObject(row.remoteOperation)
            ? (row.remoteOperation as unknown as RemoteOperation)
            : null,
        })
        bump(imported, 'transactions')
      }

      // -- subscriptions (FK: accountId, categoryId — both optional) -------
      for (const row of asRows(body.subscriptions)) {
        const accountId = remapOptionalId(accountIdMap, row.accountId)
        const categoryId = remapOptionalId(categoryIdMap, row.categoryId)
        if (accountId === '__skip__' || categoryId === '__skip__') {
          bump(skipped, 'subscriptions')
          continue
        }
        await runWithDb(tx, subscriptionsRepository.create(userId, {
          legacyId: typeof row.legacyId === 'string' ? row.legacyId : null,
          name: String(row.name ?? ''),
          accountId: accountId ?? null,
          categoryId: categoryId ?? null,
          amount: typeof row.amount === 'number' ? row.amount : 0,
          currency: String(row.currency ?? 'EUR'),
          startDate: typeof row.startDate === 'string' ? row.startDate : null,
          nextChargeDate: typeof row.nextChargeDate === 'string' ? row.nextChargeDate : null,
          frequency: String(row.frequency ?? 'monthly'),
          isActive: row.isActive === undefined ? true : Boolean(row.isActive),
        }))
        bump(imported, 'subscriptions')
      }

      // -- recurringRules (FK: accountId, categoryId — both optional) ------
      for (const row of asRows(body.recurringRules)) {
        const accountId = remapOptionalId(accountIdMap, row.accountId)
        const categoryId = remapOptionalId(categoryIdMap, row.categoryId)
        const destinationAccountId = remapOptionalId(accountIdMap, row.destinationAccountId)
        if (
          accountId === '__skip__' ||
          categoryId === '__skip__' ||
          destinationAccountId === '__skip__'
        ) {
          bump(skipped, 'recurringRules')
          continue
        }
        const created = await runWithDb(tx, recurringRulesRepository.create(userId, {
          legacyId: typeof row.legacyId === 'string' ? row.legacyId : null,
          name: String(row.name ?? ''),
          type: String(row.type ?? ''),
          accountId: accountId ?? null,
          destinationAccountId: destinationAccountId ?? null,
          categoryId: categoryId ?? null,
          amount: typeof row.amount === 'number' ? row.amount : 0,
          currency: String(row.currency ?? 'EUR'),
          frequency: String(row.frequency ?? 'monthly'),
          interval: typeof row.interval === 'number' ? row.interval : undefined,
          startDate: optionalString(row.startDate),
          endDate: optionalString(row.endDate),
          lastExecutionDate: optionalString(row.lastExecutionDate),
          nextRunDate: optionalString(row.nextRunDate),
          symbol: optionalString(row.symbol),
          side: optionalString(row.side),
          units: optionalNumber(row.units),
          unitPrice: optionalNumber(row.unitPrice),
          fee: optionalNumber(row.fee),
          time: optionalString(row.time),
          status: typeof row.status === 'string' ? row.status : undefined,
        }))
        if (typeof row.id === 'string') {
          recurringRuleIdMap.set(row.id, created.id)
        }
        bump(imported, 'recurringRules')
      }

      // -- pendingMovements (FK: recurringRuleId required; accountId/categoryId optional) --
      for (const row of asRows(body.pendingMovements)) {
        const recurringRuleId = remapId(recurringRuleIdMap, row.recurringRuleId)
        if (!recurringRuleId) {
          bump(skipped, 'pendingMovements')
          continue
        }
        const accountId = remapOptionalId(accountIdMap, row.accountId)
        const categoryId = remapOptionalId(categoryIdMap, row.categoryId)
        const destinationAccountId = remapOptionalId(accountIdMap, row.destinationAccountId)
        if (
          accountId === '__skip__' ||
          categoryId === '__skip__' ||
          destinationAccountId === '__skip__'
        ) {
          bump(skipped, 'pendingMovements')
          continue
        }
        await pendingMovementsRepository.create(tx, userId, {
          legacyId: typeof row.legacyId === 'string' ? row.legacyId : null,
          recurringRuleId,
          accountId: accountId ?? null,
          destinationAccountId: destinationAccountId ?? null,
          categoryId: categoryId ?? null,
          amount: typeof row.amount === 'number' ? row.amount : 0,
          currency: String(row.currency ?? 'EUR'),
          dueDate: String(row.dueDate ?? ''),
          type: optionalString(row.type),
          description: optionalString(row.description),
          symbol: optionalString(row.symbol),
          side: optionalString(row.side),
          units: optionalNumber(row.units),
          unitPrice: optionalNumber(row.unitPrice),
          fee: optionalNumber(row.fee),
          time: optionalString(row.time),
          // The client's own movement id (`transactions.legacy_id`), which the
          // import keeps, so it needs no remapping.
          transactionId: optionalString(row.transactionId),
          status: typeof row.status === 'string' ? row.status : undefined,
        })
        bump(imported, 'pendingMovements')
      }

      // -- budgetEntries (FK: categoryId required) --------------------------
      for (const row of asRows(body.budgetEntries)) {
        const categoryId = remapId(categoryIdMap, row.categoryId)
        if (!categoryId) {
          bump(skipped, 'budgetEntries')
          continue
        }
        await runWithDb(tx, budgetEntriesRepository.create(userId, {
          legacyId: typeof row.legacyId === 'string' ? row.legacyId : null,
          categoryId,
          year: typeof row.year === 'number' ? row.year : new Date().getFullYear(),
          month: typeof row.month === 'number' ? row.month : 1,
          amount: typeof row.amount === 'number' ? row.amount : 0,
          currency: String(row.currency ?? 'EUR'),
        }))
        bump(imported, 'budgetEntries')
      }

      // -- goals (FK: categoryId optional, set on a savings goal) -------------
      for (const row of asRows(body.goals)) {
        const categoryId = remapOptionalId(categoryIdMap, row.categoryId)
        if (categoryId === '__skip__') {
          bump(skipped, 'goals')
          continue
        }
        await runWithDb(tx, goalsRepository.create(userId, {
          legacyId: typeof row.legacyId === 'string' ? row.legacyId : null,
          key: String(row.key ?? ''),
          categoryId: categoryId ?? null,
          name: String(row.name ?? ''),
          targetYear: typeof row.targetYear === 'number' ? row.targetYear : null,
          targetAmount: typeof row.targetAmount === 'number' ? row.targetAmount : 0,
          currency: String(row.currency ?? 'EUR'),
        }))
        bump(imported, 'goals')
      }

      // -- wealthSnapshots (+ balances, FK: accountId optional) --------------
      for (const row of asRows(body.wealthSnapshots)) {
        const created = await wealthRepository.create(tx, userId, {
          legacyId: typeof row.legacyId === 'string' ? row.legacyId : null,
          snapshotDate: String(row.snapshotDate ?? ''),
          year: typeof row.year === 'number' ? row.year : new Date().getFullYear(),
          month: typeof row.month === 'number' ? row.month : 1,
        })
        if (typeof row.id === 'string') {
          wealthSnapshotIdMap.set(row.id, created.id)
        }
        bump(imported, 'wealthSnapshots')

        for (const balance of asRows(row.balances)) {
          const accountId = remapOptionalId(accountIdMap, balance.accountId)
          if (accountId === '__skip__') {
            bump(skipped, 'snapshotBalances')
            continue
          }
          await wealthRepository.createBalance(tx, userId, {
            snapshotId: created.id,
            accountId: accountId ?? null,
            balance: typeof balance.balance === 'number' ? balance.balance : 0,
            currency: String(balance.currency ?? 'EUR'),
          })
          bump(imported, 'snapshotBalances')
        }
      }

      // -- contributions (+ allocations, FK: accountId optional) ------------
      for (const row of asRows(body.contributions)) {
        const created = await contributionsRepository.create(tx, userId, {
          legacyId: typeof row.legacyId === 'string' ? row.legacyId : null,
          date: String(row.date ?? ''),
          amount: typeof row.amount === 'number' ? row.amount : 0,
          currency: String(row.currency ?? 'EUR'),
          portfolioDate: typeof row.portfolioDate === 'string' ? row.portfolioDate : null,
          portfolioValue: typeof row.portfolioValue === 'number' ? row.portfolioValue : null,
          flow: typeof row.flow === 'number' ? row.flow : null,
        })
        if (typeof row.id === 'string') {
          contributionIdMap.set(row.id, created.id)
        }
        bump(imported, 'contributions')

        for (const allocation of asRows(row.allocations)) {
          const accountId = remapOptionalId(accountIdMap, allocation.accountId)
          if (accountId === '__skip__') {
            bump(skipped, 'contributionAllocations')
            continue
          }
          await contributionsRepository.createAllocation(tx, userId, {
            contributionId: created.id,
            accountId: accountId ?? null,
            amount: typeof allocation.amount === 'number' ? allocation.amount : 0,
            currency: String(allocation.currency ?? 'EUR'),
          })
          bump(imported, 'contributionAllocations')
        }
      }

      // -- userInstruments (FK: instrumentId must already exist globally; categoryId optional) --
      for (const row of asRows(body.userInstruments)) {
        if (typeof row.instrumentId !== 'string') {
          bump(skipped, 'userInstruments')
          continue
        }
        const instrument = await marketRepository.getInstrument(tx, row.instrumentId)
        const configuration = quoteConfigurationSchema.safeParse(row.quoteConfig)
        if (!instrument && !configuration.success) {
          bump(skipped, 'userInstruments')
          continue
        }
        const categoryId = remapOptionalId(categoryIdMap, row.categoryId)
        if (categoryId === '__skip__') {
          bump(skipped, 'userInstruments')
          continue
        }
        await marketRepository.createUserInstrument(tx, userId, {
          instrumentId: row.instrumentId,
          categoryId: categoryId ?? null,
          alias: typeof row.alias === 'string' ? (accountIdMap.get(row.alias) ?? row.alias) : null,
          ...(configuration.success ? { quoteConfig: configuration.data } : {}),
        })
        bump(imported, 'userInstruments')
      }

      // -- stockeventsSymbolMappings (FK: categoryId optional) ---------------
      for (const row of asRows(body.stockeventsSymbolMappings)) {
        const categoryId = remapOptionalId(categoryIdMap, row.categoryId)
        if (categoryId === '__skip__') {
          bump(skipped, 'stockeventsSymbolMappings')
          continue
        }
        await stockeventsSymbolMappingsRepository.create(tx, userId, {
          legacyId: typeof row.legacyId === 'string' ? row.legacyId : null,
          categoryId: categoryId ?? null,
          stockeventsSymbol: String(row.stockeventsSymbol ?? ''),
          sync: row.sync === 1 || row.sync === true,
          watchlistId: typeof row.watchlistId === 'string' ? row.watchlistId : null,
          hidden: row.hidden === 1 || row.hidden === true,
        })
        bump(imported, 'stockeventsSymbolMappings')
      }

      // -- stockeventsCashMappings ---------------------------------------------
      for (const row of asRows((body as Row).stockeventsCashMappings)) {
        const accountId = remapOptionalId(accountIdMap, row.accountId)
        if (accountId === '__skip__') {
          bump(skipped, 'stockeventsCashMappings')
          continue
        }
        if (typeof row.watchlistId !== 'string' || !row.watchlistId) {
          bump(skipped, 'stockeventsCashMappings')
          continue
        }
        await stockeventsCashMappingsRepository.upsertMapping(tx, userId, {
          accountId: accountId ?? (typeof row.accountId === 'string' ? row.accountId : null),
          watchlistId: row.watchlistId,
        })
        bump(imported, 'stockeventsCashMappings')
      }

      // -- stockeventsCashSyncEntries ------------------------------------------
      for (const row of asRows(body.stockeventsCashSyncEntries)) {
        const accountId = remapOptionalId(accountIdMap, row.accountId)
        if (accountId === '__skip__' || typeof row.watchlistId !== 'string' || !row.watchlistId) {
          bump(skipped, 'stockeventsCashSyncEntries')
          continue
        }
        await stockeventsCashMappingsRepository.upsertSyncEntry(tx, userId, {
          contributionDate: String(row.contributionDate ?? ''),
          accountId: accountId ?? null,
          watchlistId: row.watchlistId,
          syncedAmount: typeof row.syncedAmount === 'number' ? row.syncedAmount : 0,
          currency: String(row.currency ?? 'EUR'),
        })
        bump(imported, 'stockeventsCashSyncEntries')
      }

      // -- settings (singleton) ----------------------------------------------
      if (body.settings && typeof body.settings === 'object') {
        const settingsRow = body.settings as Row
        const existing = await runWithDb(tx, userSettingsRepository.get(userId))
        const patch = {
          ...onboarding,
          currency: typeof settingsRow.currency === 'string' ? settingsRow.currency : undefined,
          locale: typeof settingsRow.locale === 'string' ? settingsRow.locale : undefined,
          theme: typeof settingsRow.theme === 'string' ? settingsRow.theme : undefined,
          stockeventsEnabled: optionalFlag(settingsRow.stockeventsEnabled),
          stockeventsTradesToCash: optionalFlag(settingsRow.stockeventsTradesToCash),
        }
        if (existing) {
          await runWithDb(tx, userSettingsRepository.update(userId, patch))
        } else {
          await runWithDb(tx, userSettingsRepository.create(userId, patch))
        }
        bump(imported, 'settings')
      } else if (replace) {
        await runWithDb(tx, userSettingsRepository.create(userId, onboarding))
      }

      const { revision } = await syncRepository.bumpRevision(tx, userId)
      await syncRepository.createChange(tx, userId, {
        revision,
        entityType: 'reset',
        entityId: userId,
        changeType: 'update',
        payload: null,
      })

      return { imported, skipped }
    })

    return jsonResponse({ ok: true, ...summary }, 200)
  })

function asRows(value: unknown): Row[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((item): item is Row => Boolean(item) && typeof item === 'object')
}

function isObject(value: unknown): value is Row {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function optionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Settings flags travel as `0`/`1` from D1 or as booleans; anything else leaves the stored value. */
function optionalFlag(value: unknown): boolean | undefined {
  if (value === 1 || value === true) return true
  if (value === 0 || value === false) return false
  return undefined
}

/**
 * The exported operation of an investment movement. `instrumentId` points at
 * the global instrument catalogue, which a restore into another deployment
 * may not have: then the symbol alone is kept, as for an untracked ticker.
 */
async function importOperation(
  tx: Parameters<typeof marketRepository.getInstrument>[0],
  value: unknown,
): Promise<MovementOperationInput | null> {
  if (!isObject(value) || typeof value.side !== 'string') {
    return null
  }
  const instrument =
    typeof value.instrumentId === 'string'
      ? await marketRepository.getInstrument(tx, value.instrumentId)
      : undefined
  return {
    instrumentId: instrument?.id ?? null,
    symbol: optionalString(value.symbol),
    side: value.side,
    units: optionalNumber(value.units) ?? 0,
    unitPrice: optionalNumber(value.unitPrice) ?? 0,
    fee: optionalNumber(value.fee) ?? 0,
  }
}
