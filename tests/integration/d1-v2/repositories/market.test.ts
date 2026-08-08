import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as marketRepo from "../../../../src/db/repositories/market";
import { createTestDb, type TestDatabase } from "../setup";
import { seedUser } from "./fixtures";

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
      const created = await marketRepo.createInstrument(db, {
        symbol: "AAPL",
        normalizedSymbol: "AAPL",
        provider: "twelve-data",
        currency: "USD",
      });
      expect(created.symbol).toBe("AAPL");

      const found = await marketRepo.getInstrumentBySymbol(db, "twelve-data", "AAPL");
      expect(found?.id).toBe(created.id);

      expect(await marketRepo.listInstruments(db)).toHaveLength(1);
      expect(await marketRepo.removeInstrument(db, created.id)).toBe(true);
    });

    it("bulk inserts instruments", async () => {
      const { db } = testDb;
      const rows = await marketRepo.bulkInsertInstruments(db, [
        { symbol: "AAPL", normalizedSymbol: "AAPL", provider: "twelve-data", currency: "USD" },
        { symbol: "BTC", normalizedSymbol: "BTC", provider: "coingecko", currency: "BTC" },
      ]);
      expect(rows).toHaveLength(2);
    });
  });

  describe("market quotes (global reference data)", () => {
    it("creates and reads quotes with money conversion, rejects orphan FK", async () => {
      const { db } = testDb;
      const instrument = await marketRepo.createInstrument(db, {
        symbol: "AAPL",
        normalizedSymbol: "AAPL",
        provider: "twelve-data",
        currency: "USD",
      });

      const created = await marketRepo.createQuote(db, {
        instrumentId: instrument.id,
        price: 189.5,
        currency: "USD",
        quotedAt: "2026-01-15T00:00:00.000Z",
      });
      expect(created.price).toBe(189.5);

      expect(await marketRepo.listQuotesByInstrument(db, instrument.id)).toHaveLength(1);

      await expect(
        marketRepo.createQuote(db, {
          instrumentId: "does-not-exist",
          price: 1,
          currency: "USD",
          quotedAt: "2026-01-15T00:00:00.000Z",
        }),
      ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
    });
  });

  describe("user instruments (per-user join table)", () => {
    it("creates, reads, updates and deletes (CRUD)", async () => {
      const { db } = testDb;
      const user = await seedUser(db);
      const instrument = await marketRepo.createInstrument(db, {
        symbol: "AAPL",
        normalizedSymbol: "AAPL",
        provider: "twelve-data",
        currency: "USD",
      });

      const created = await marketRepo.createUserInstrument(db, user.id, {
        instrumentId: instrument.id,
        alias: "Apple",
      });
      expect(created.alias).toBe("Apple");

      const updated = await marketRepo.updateUserInstrument(db, user.id, created.id, { alias: "AAPL" });
      expect(updated?.alias).toBe("AAPL");

      expect(await marketRepo.removeUserInstrument(db, user.id, created.id)).toBe(true);
    });

    it("rejects tracking a non-existent instrument (FK violation)", async () => {
      const { db } = testDb;
      const user = await seedUser(db);
      await expect(
        marketRepo.createUserInstrument(db, user.id, { instrumentId: "does-not-exist" }),
      ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
    });

    it("enforces cross-user isolation", async () => {
      const { db } = testDb;
      const userA = await seedUser(db);
      const userB = await seedUser(db);
      const instrument = await marketRepo.createInstrument(db, {
        symbol: "AAPL",
        normalizedSymbol: "AAPL",
        provider: "twelve-data",
        currency: "USD",
      });
      const created = await marketRepo.createUserInstrument(db, userA.id, { instrumentId: instrument.id });

      expect(await marketRepo.getUserInstrument(db, userB.id, created.id)).toBeUndefined();
      expect(await marketRepo.listUserInstrumentsByUser(db, userB.id)).toHaveLength(0);
    });
  });
});
