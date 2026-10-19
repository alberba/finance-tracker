/**
 * Market data repository (WP6): instruments, quotes, and the per-user
 * tracking join table.
 *
 * `marketInstruments`/`marketQuotes` intentionally have no `user_id` column
 * (see `src/db/schema/market.ts` — shared reference data, one AAPL row/quote
 * series serves every user), so unlike every other repository in this
 * directory their methods do not take a `userId` param: there is no tenant
 * to scope by. `userInstruments` is the per-user join table and follows the
 * usual `userId`-scoped CRUD surface.
 */

import { and, eq, inArray } from 'drizzle-orm'
import { fromMinorUnits, toMinorUnits } from '../../lib/money'
import { marketInstruments, marketQuotes, userInstruments } from '../schema'
import type { InstrumentQuoteConfig } from '../../scripts/types'
import { normalizeSymbol, yahooQuoteSymbol } from '../../domain/investment/symbol-matching'
import {
  type Db,
  assertOwnedReferences,
  chunkIds,
  clientIdentity,
  nowIso,
  versionGuard,
} from './shared'

export type MarketInstrumentRow = typeof marketInstruments.$inferSelect
export type MarketQuoteRow = Omit<typeof marketQuotes.$inferSelect, 'priceMinor'> & {
  price: number
}
export type UserInstrumentRow = typeof userInstruments.$inferSelect

export interface CreateMarketInstrumentInput {
  legacyId?: string | null
  symbol: string
  normalizedSymbol: string
  provider: string
  name?: string | null
  assetClass?: string | null
  currency: string
}

export interface CreateMarketQuoteInput {
  instrumentId: string
  price: number
  currency: string
  quotedAt: string
}

export interface CreateUserInstrumentInput {
  /** Identity minted by the client (ADR 0001); omitted by v1-migrated writes. */
  id?: string
  instrumentId: string
  categoryId?: string | null
  alias?: string | null
  quoteConfig?: InstrumentQuoteConfig
}

export interface UpdateUserInstrumentInput {
  categoryId?: string | null
  alias?: string | null
  quoteConfig?: InstrumentQuoteConfig
}

function toQuoteRow(row: typeof marketQuotes.$inferSelect): MarketQuoteRow {
  return { ...row, price: fromMinorUnits(row.priceMinor, row.currency) }
}

// -- market_instruments (global) ------------------------------------------------

export async function listInstruments(db: Db): Promise<MarketInstrumentRow[]> {
  return db.select().from(marketInstruments)
}

export async function getInstrument(db: Db, id: string): Promise<MarketInstrumentRow | undefined> {
  const [row] = await db.select().from(marketInstruments).where(eq(marketInstruments.id, id))
  return row
}

/**
 * Batched form of {@link getInstrument} for bootstrap assembly (audit
 * §5.1): one query for every tracked instrument instead of one query per
 * instrument.
 */
export async function listInstrumentsByIds(db: Db, ids: string[]): Promise<MarketInstrumentRow[]> {
  if (ids.length === 0) {
    return []
  }
  const rows: MarketInstrumentRow[] = []
  for (const chunk of chunkIds(ids)) {
    rows.push(
      ...(await db.select().from(marketInstruments).where(inArray(marketInstruments.id, chunk))),
    )
  }
  return rows
}

export async function getInstrumentBySymbol(
  db: Db,
  provider: string,
  normalizedSymbol: string,
): Promise<MarketInstrumentRow | undefined> {
  const [row] = await db
    .select()
    .from(marketInstruments)
    .where(
      and(
        eq(marketInstruments.provider, provider),
        eq(marketInstruments.normalizedSymbol, normalizedSymbol),
      ),
    )
  return row
}

export async function createInstrument(
  db: Db,
  input: CreateMarketInstrumentInput,
): Promise<MarketInstrumentRow> {
  const now = nowIso()
  const [row] = await db
    .insert(marketInstruments)
    .values({
      legacyId: input.legacyId ?? null,
      symbol: input.symbol,
      normalizedSymbol: input.normalizedSymbol,
      provider: input.provider,
      name: input.name ?? null,
      assetClass: input.assetClass ?? null,
      currency: input.currency,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
  return row
}

export async function removeInstrument(db: Db, id: string): Promise<boolean> {
  const existing = await getInstrument(db, id)
  if (!existing) {
    return false
  }
  await db.delete(marketInstruments).where(eq(marketInstruments.id, id))
  return true
}

export async function bulkInsertInstruments(
  db: Db,
  inputs: CreateMarketInstrumentInput[],
): Promise<MarketInstrumentRow[]> {
  if (inputs.length === 0) {
    return []
  }
  const now = nowIso()
  return db
    .insert(marketInstruments)
    .values(
      inputs.map((input) => ({
        legacyId: input.legacyId ?? null,
        symbol: input.symbol,
        normalizedSymbol: input.normalizedSymbol,
        provider: input.provider,
        name: input.name ?? null,
        assetClass: input.assetClass ?? null,
        currency: input.currency,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .returning()
}

// -- market_quotes (global) ------------------------------------------------------

export async function listQuotesByInstrument(
  db: Db,
  instrumentId: string,
): Promise<MarketQuoteRow[]> {
  const rows = await db
    .select()
    .from(marketQuotes)
    .where(eq(marketQuotes.instrumentId, instrumentId))
  return rows.map(toQuoteRow)
}

/**
 * Batched form of {@link listQuotesByInstrument} for bootstrap assembly
 * (audit §5.1): one query for every tracked instrument's quotes instead of
 * one query per instrument.
 */
export async function listQuotesByInstruments(
  db: Db,
  instrumentIds: string[],
): Promise<Map<string, MarketQuoteRow[]>> {
  const byInstrument = new Map<string, MarketQuoteRow[]>()
  if (instrumentIds.length === 0) {
    return byInstrument
  }
  const rows: (typeof marketQuotes.$inferSelect)[] = []
  for (const chunk of chunkIds(instrumentIds)) {
    rows.push(
      ...(await db.select().from(marketQuotes).where(inArray(marketQuotes.instrumentId, chunk))),
    )
  }
  for (const row of rows) {
    const quote = toQuoteRow(row)
    const existing = byInstrument.get(quote.instrumentId)
    if (existing) {
      existing.push(quote)
    } else {
      byInstrument.set(quote.instrumentId, [quote])
    }
  }
  return byInstrument
}

export async function getQuote(db: Db, id: string): Promise<MarketQuoteRow | undefined> {
  const [row] = await db.select().from(marketQuotes).where(eq(marketQuotes.id, id))
  return row ? toQuoteRow(row) : undefined
}

export async function createQuote(db: Db, input: CreateMarketQuoteInput): Promise<MarketQuoteRow> {
  const [row] = await db
    .insert(marketQuotes)
    .values({
      instrumentId: input.instrumentId,
      priceMinor: toMinorUnits(input.price, input.currency),
      currency: input.currency,
      quotedAt: input.quotedAt,
      createdAt: nowIso(),
    })
    .returning()
  return toQuoteRow(row)
}

export async function removeQuote(db: Db, id: string): Promise<boolean> {
  const existing = await getQuote(db, id)
  if (!existing) {
    return false
  }
  await db.delete(marketQuotes).where(eq(marketQuotes.id, id))
  return true
}

export async function bulkInsertQuotes(
  db: Db,
  inputs: CreateMarketQuoteInput[],
): Promise<MarketQuoteRow[]> {
  if (inputs.length === 0) {
    return []
  }
  const now = nowIso()
  const rows = await db
    .insert(marketQuotes)
    .values(
      inputs.map((input) => ({
        instrumentId: input.instrumentId,
        priceMinor: toMinorUnits(input.price, input.currency),
        currency: input.currency,
        quotedAt: input.quotedAt,
        createdAt: now,
      })),
    )
    .returning()
  return rows.map(toQuoteRow)
}

// -- user_instruments (per-user) --------------------------------------------------

export async function listUserInstrumentsByUser(
  db: Db,
  userId: string,
): Promise<UserInstrumentRow[]> {
  return db.select().from(userInstruments).where(eq(userInstruments.userId, userId))
}

export async function getUserInstrument(
  db: Db,
  userId: string,
  id: string,
): Promise<UserInstrumentRow | undefined> {
  const [row] = await db
    .select()
    .from(userInstruments)
    .where(and(eq(userInstruments.id, id), eq(userInstruments.userId, userId)))
  return row
}

export async function createUserInstrument(
  db: Db,
  userId: string,
  input: CreateUserInstrumentInput,
): Promise<UserInstrumentRow> {
  await assertOwnedReferences(db, userId, { categoryId: input.categoryId })
  if (input.quoteConfig) {
    if (!input.alias) throw new Error('Falta la cuenta de inversión del símbolo.')
    await assertOwnedReferences(db, userId, { accountId: input.alias })
  }
  const instrumentId = input.quoteConfig
    ? await materializeQuoteInstrument(db, input.quoteConfig)
    : input.instrumentId
  const now = nowIso()
  const [row] = await db
    .insert(userInstruments)
    .values({
      ...clientIdentity(input.id),
      userId,
      instrumentId,
      categoryId: input.categoryId ?? null,
      alias: input.alias ?? null,
      quoteConfig: input.quoteConfig ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
  return row
}

export async function updateUserInstrument(
  db: Db,
  userId: string,
  id: string,
  input: UpdateUserInstrumentInput,
  expectedVersion?: number,
): Promise<UserInstrumentRow | undefined> {
  const existing = await getUserInstrument(db, userId, id)
  if (!existing) {
    return undefined
  }
  await assertOwnedReferences(db, userId, { categoryId: input.categoryId })
  if (input.quoteConfig || (existing.quoteConfig && input.alias !== undefined)) {
    const accountId = input.alias ?? existing.alias
    if (!accountId) throw new Error('Falta la cuenta de inversión del símbolo.')
    await assertOwnedReferences(db, userId, { accountId })
  }
  const [row] = await db
    .update(userInstruments)
    .set({
      categoryId: input.categoryId === undefined ? existing.categoryId : input.categoryId,
      alias: input.alias === undefined ? existing.alias : input.alias,
      quoteConfig: input.quoteConfig === undefined ? existing.quoteConfig : input.quoteConfig,
      updatedAt: nowIso(),
      version: existing.version + 1,
    })
    .where(
      and(
        eq(userInstruments.id, id),
        eq(userInstruments.userId, userId),
        versionGuard(userInstruments.version, expectedVersion),
      ),
    )
    .returning()
  return row
}

export async function removeUserInstrument(
  db: Db,
  userId: string,
  id: string,
  expectedVersion?: number,
): Promise<boolean> {
  const existing = await getUserInstrument(db, userId, id)
  if (!existing) {
    return false
  }
  const deleted = await db
    .delete(userInstruments)
    .where(
      and(
        eq(userInstruments.id, id),
        eq(userInstruments.userId, userId),
        versionGuard(userInstruments.version, expectedVersion),
      ),
    )
    .returning({ id: userInstruments.id })
  return deleted.length > 0
}

export async function bulkInsertUserInstruments(
  db: Db,
  userId: string,
  inputs: CreateUserInstrumentInput[],
): Promise<UserInstrumentRow[]> {
  if (inputs.length === 0) {
    return []
  }
  if (inputs.some((input) => input.quoteConfig)) {
    const rows: UserInstrumentRow[] = []
    for (const input of inputs) rows.push(await createUserInstrument(db, userId, input))
    return rows
  }
  const now = nowIso()
  return db
    .insert(userInstruments)
    .values(
      inputs.map((input) => ({
        ...clientIdentity(input.id),
        userId,
        instrumentId: input.instrumentId,
        categoryId: input.categoryId ?? null,
        alias: input.alias ?? null,
        quoteConfig: input.quoteConfig ?? null,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .returning()
}

async function materializeQuoteInstrument(db: Db, config: InstrumentQuoteConfig): Promise<string> {
  const symbol =
    config.provider === 'yahoo' ? yahooQuoteSymbol(config) : normalizeSymbol(config.symbol)
  const now = nowIso()
  await db
    .insert(marketInstruments)
    .values({
      symbol,
      normalizedSymbol: symbol,
      provider: config.provider,
      assetClass: config.type,
      currency: config.currency,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: [marketInstruments.provider, marketInstruments.normalizedSymbol],
    })
  const instrument = await getInstrumentBySymbol(db, config.provider, symbol)
  if (!instrument) throw new Error('No se pudo crear el instrumento de cotización.')
  return instrument.id
}
