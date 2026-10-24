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

  describe("market instruments (global reference data)", () => {
    it("creates, reads, updates via bulk insert and deletes an instrument (CRUD)", async () => {
      const { db } = testDb;
      const created = await runWithDb(db, marketRepo.createInstrument({
        symbol: "AAPL",
        normalizedSymbol: "AAPL",
        provider: "twelve-data",
        currency: "USD",
      }));
      expect(created.symbol).toBe("AAPL");

      const found = await runWithDb(db, marketRepo.getInstrumentBySymbol("twelve-data", "AAPL"));
      expect(found?.id).toBe(created.id);

      expect(await runWithDb(db, marketRepo.listInstruments())).toHaveLength(1);
      expect(await runWithDb(db, marketRepo.removeInstrument(created.id))).toBe(true);
    });

    it("bulk inserts instruments", async () => {
      const { db } = testDb;
      const rows = await runWithDb(db, marketRepo.bulkInsertInstruments([
        { symbol: "AAPL", normalizedSymbol: "AAPL", provider: "twelve-data", currency: "USD" },
        { symbol: "BTC", normalizedSymbol: "BTC", provider: "coingecko", currency: "BTC" },
      ]));
      expect(rows).toHaveLength(2);
    });
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
    it("creates, reads, updates and deletes (CRUD)", async () => {
      const { db } = testDb;
      const user = await seedUser(db);
      const instrument = await runWithDb(db, marketRepo.createInstrument({
        symbol: "AAPL",
        normalizedSymbol: "AAPL",
        provider: "twelve-data",
        currency: "USD",
      }));

      const created = await runWithDb(db, marketRepo.createUserInstrument(user.id, {
        instrumentId: instrument.id,
        alias: "Apple",
      }));
      expect(created.alias).toBe("Apple");

      const updated = await runWithDb(db, marketRepo.updateUserInstrument(user.id, created.id, { alias: "AAPL" }));
      expect(updated?.alias).toBe("AAPL");

      expect(await runWithDb(db, marketRepo.removeUserInstrument(user.id, created.id))).toBe(true);
    });

    it("rejects tracking a non-existent instrument (FK violation)", async () => {
      const { db } = testDb;
      const user = await seedUser(db);
      await expect(
        runWithDb(db, marketRepo.createUserInstrument(user.id, { instrumentId: "does-not-exist" })),
      ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
    });

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
