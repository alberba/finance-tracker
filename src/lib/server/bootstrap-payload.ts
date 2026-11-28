/**
 * Assembles the full private dataset a client needs to initialize its local
 * cache. Extracted from `GET /api/bootstrap` so the round-trip test harness
 * (`tests/integration/d1-v2/round-trip/`) can exercise the *same* assembly the
 * route serves without going through HTTP — the read half of
 * store → command → repository → bootstrap → projection → normalizeState.
 *
 * The collections and their relations come from the shared private read
 * (`private-read.ts`); only bootstrap-specific data lives here: the sync
 * revision cursor, the year marker and the catalog/quotes-derived
 * `instruments` array.
 *
 * Pure read: it never writes, mirroring the route's contract.
 */

import { Effect } from 'effect'
import * as marketRepository from '../../db/repositories/market'
import * as syncRepository from '../../db/repositories/sync'
import { readPrivateDataset } from './private-read'

export function buildBootstrapPayload(userId: string, year?: number) {
  return Effect.gen(function* () {
    const [privateData, revisionRow] = yield* Effect.all(
      [readPrivateDataset(userId, { year }), syncRepository.getRevision(userId)] as const,
      { concurrency: 'unbounded' },
    )

    const instrumentIds = privateData.userInstruments.map(
      (userInstrument) => userInstrument.instrumentId,
    )
    const [instrumentRows, quotesByInstrument] = yield* Effect.all(
      [
        marketRepository.listInstrumentsByIds(instrumentIds),
        marketRepository.listQuotesByInstruments(instrumentIds),
      ] as const,
      { concurrency: 'unbounded' },
    )
    const instrumentsById = new Map(instrumentRows.map((instrument) => [instrument.id, instrument]))
    const instruments = privateData.userInstruments
      .map((userInstrument) => {
        const instrument = instrumentsById.get(userInstrument.instrumentId)
        if (!instrument) return null
        const quotes = quotesByInstrument.get(instrument.id) ?? []
        return { ...instrument, userInstrument, quotes }
      })
      .filter((instrument) => instrument !== null)

    return {
      year: year ?? null,
      revision: revisionRow?.revision ?? 0,
      settings: privateData.settings,
      accounts: privateData.accounts,
      categories: privateData.categories,
      transactions: privateData.transactions,
      subscriptions: privateData.subscriptions,
      recurringRules: privateData.recurringRules,
      pendingMovements: privateData.pendingMovements,
      budgetEntries: privateData.budgetEntries,
      goals: privateData.goals,
      wealthSnapshots: privateData.wealthSnapshots,
      contributions: privateData.contributions,
      userInstruments: privateData.userInstruments,
      instruments,
      twrLiquidityAccounts: privateData.twrLiquidityAccounts,
      stockeventsSymbolMappings: privateData.stockeventsSymbolMappings,
      stockeventsCashMappings: privateData.stockeventsCashMappings,
      stockeventsCashSyncEntries: privateData.stockeventsCashSyncEntries,
    }
  })
}
