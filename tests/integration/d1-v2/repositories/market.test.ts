import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as marketRepo from "../../../../src/db/repositories/market";
import { createTestDb, type TestDatabase } from "../setup";
import { seedUser } from "./fixtures";
import { runWithDb } from '../../../../src/db/database'

describe("market repository", () => {
  let testDb: TestDatabase;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  describe("market quotes (global reference data)", () => {
    it("creates and reads quotes with money conversion, rejects orphan FK", async () => {
      const { db } = testDb;
      const instrument = await runWithDb(db, marketRepo.createInstrument({
        symbol: "AAPL",
        normalizedSymbol: "AAPL",
        provider: "twelve-data",
        currency: "USD",
      }));

      const created = await runWithDb(db, marketRepo.createQuote({
        instrumentId: instrument.id,
        price: 189.5,
        currency: "USD",
        quotedAt: "2026-01-15T00:00:00.000Z",
      }));
      expect(created.price).toBe(189.5);

      expect(await runWithDb(db, marketRepo.listQuotesByInstrument(instrument.id))).toHaveLength(1);

      await expect(
        runWithDb(db, marketRepo.createQuote({
          instrumentId: "does-not-exist",
          price: 1,
          currency: "USD",
          quotedAt: "2026-01-15T00:00:00.000Z",
        })),
      ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
    });
  });

  describe("user instruments (per-user join table)", () => {
    it("enforces cross-user isolation", async () => {
      const { db } = testDb;
      const userA = await seedUser(db);
      const userB = await seedUser(db);
      const instrument = await runWithDb(db, marketRepo.createInstrument({
        symbol: "AAPL",
        normalizedSymbol: "AAPL",
        provider: "twelve-data",
        currency: "USD",
      }));
      const created = await runWithDb(db, marketRepo.createUserInstrument(userA.id, { instrumentId: instrument.id }));

      expect(await runWithDb(db, marketRepo.getUserInstrument(userB.id, created.id))).toBeUndefined();
      expect(await runWithDb(db, marketRepo.listUserInstrumentsByUser(userB.id))).toHaveLength(0);
    });
  });
});
