import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyOneCommand } from "../../../src/lib/server/sync/apply-command";
import * as accountsRepository from "../../../src/db/repositories/accounts";
import * as transactionsRepository from "../../../src/db/repositories/transactions";
import * as subscriptionsRepository from "../../../src/db/repositories/subscriptions";
import * as budgetEntriesRepository from "../../../src/db/repositories/budget-entries";
import * as contributionsRepository from "../../../src/db/repositories/contributions";
import * as marketRepository from "../../../src/db/repositories/market";
import * as stockeventsSymbolMappingsRepository from "../../../src/db/repositories/stockevents-symbol-mappings";
import * as wealthRepository from "../../../src/db/repositories/wealth";
import { createTestDb, type TestDatabase } from "../../integration/d1-v2/setup";
import { seedUser } from "../../integration/d1-v2/repositories/fixtures";
import { runWithDb } from '../../../src/db/database'

/**
 * WP10 security suite — "no cross-account access by ID guessing".
 *
 * `apply-command.ts` is the single write path every `/api/sync` command
 * flows through; every mutation is scoped by `userId` at the repository
 * boundary (WP6 design decision — every repository method takes `userId`
 * explicitly and never trusts an ambient value). These tests attack that
 * boundary directly: user B submits a syntactically valid command
 * addressing user A's real entity id, and must never be able to read,
 * mutate, or delete it — not even learn it exists (a `not_found`
 * conflict-free response, not a 403 that would confirm the id is valid).
 */
describe("apply-command cross-tenant isolation (WP10)", () => {
  let testDb: TestDatabase;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  it("rejects an update command targeting another user's account as not_found, without mutating it", async () => {
    const { db } = testDb;
    const userA = await seedUser(db, "victim@example.com");
    const userB = await seedUser(db, "attacker@example.com");

    const accountA = await runWithDb(db, accountsRepository.create(userA.id, {
      name: "Cuenta de la víctima",
      kind: "cash",
      currency: "EUR",
      openingBalance: 1000,
    }));

    const outcome = await applyOneCommand(db, userB.id, {
      commandId: "attack-update-1",
      action: "update",
      entityType: "account",
      entityId: accountA.id,
      baseVersion: accountA.version,
      data: { name: "Cuenta robada" },
    } as never);

    expect(outcome.status).toBe("not_found");

    const untouched = await runWithDb(db, accountsRepository.get(userA.id, accountA.id));
    expect(untouched?.name).toBe("Cuenta de la víctima");
  });

  it("rejects a remove command targeting another user's transaction as not_found, without deleting it", async () => {
    const { db } = testDb;
    const userA = await seedUser(db, "victim2@example.com");
    const userB = await seedUser(db, "attacker2@example.com");
    const accountA = await runWithDb(db, accountsRepository.create(userA.id, {
      name: "Cuenta A",
      kind: "cash",
      currency: "EUR",
      openingBalance: 0,
    }));
    const categoryA = await runWithDb(db, accountsRepository.createCategory(userA.id, {
      name: "Comida",
      kind: "expense",
    }));
    const txA = await runWithDb(db, transactionsRepository.create(userA.id, {
      accountId: accountA.id,
      categoryId: categoryA.id,
      type: "expense",
      date: "2026-01-01",
      description: "Compra",
      amount: -20,
      currency: "EUR",
    }));

    const outcome = await applyOneCommand(db, userB.id, {
      commandId: "attack-remove-1",
      action: "remove",
      entityType: "transaction",
      entityId: txA.id,
      baseVersion: txA.version,
    } as never);

    expect(outcome.status).toBe("not_found");
    expect(await runWithDb(db, transactionsRepository.get(userA.id, txA.id))).toBeDefined();
  });

  it("does not leak user A's entity data into user B's create response by id guessing", async () => {
    const { db } = testDb;
    const userA = await seedUser(db, "victim3@example.com");
    const userB = await seedUser(db, "attacker3@example.com");
    const accountA = await runWithDb(db, accountsRepository.create(userA.id, {
      name: "Secreta",
      kind: "cash",
      currency: "EUR",
      openingBalance: 500,
    }));

    // Attacker guesses A's real account id as the parent for a transaction
    // they create in their own tenant — must fail (FK/ownership check),
    // never silently attach to A's account.
    await expect(
      runWithDb(db, transactionsRepository.create(userB.id, {
        accountId: accountA.id,
        categoryId: null,
        type: "expense",
        date: "2026-01-01",
        description: "Fuga",
        amount: -1,
        currency: "EUR",
      })),
    ).rejects.toThrow();
  });

  it("rejects a create command (via apply-command) that references another user's category", async () => {
    const { db } = testDb;
    const userA = await seedUser(db, "victim4@example.com");
    const userB = await seedUser(db, "attacker4@example.com");
    const categoryA = await runWithDb(db, accountsRepository.createCategory(userA.id, {
      name: "Categoría de A",
      kind: "expense",
    }));

    // The repository-level guard throws `RejectedCommandError`, which
    // `apply-command` turns into a terminal `rejected` outcome — never a
    // silently B-owned row pointing at A's category.
    const outcome = await applyOneCommand(db, userB.id, {
        commandId: "attack-create-1",
        action: "create",
        entityType: "subscription",
        data: {
          name: "Suscripción robada",
          categoryId: categoryA.id,
          amount: 9.99,
          currency: "EUR",
          frequency: "monthly",
        },
      } as never)
    expect(outcome.status).toBe("rejected");
    expect(await runWithDb(db, subscriptionsRepository.listByUser(userB.id))).toHaveLength(0);
  });

  it("repository-level guard: subscriptions.create rejects another user's accountId/categoryId directly", async () => {
    const { db } = testDb;
    const userA = await seedUser(db, "victim5@example.com");
    const userB = await seedUser(db, "attacker5@example.com");
    const accountA = await runWithDb(db, accountsRepository.create(userA.id, {
      name: "Cuenta A",
      kind: "cash",
      currency: "EUR",
      openingBalance: 0,
    }));

    await expect(
      runWithDb(db, subscriptionsRepository.create(userB.id, {
        name: "Fuga",
        accountId: accountA.id,
        amount: 5,
        currency: "EUR",
        frequency: "monthly",
      })),
    ).rejects.toThrow();
  });

  it("repository-level guard: budgetEntries.create rejects another user's categoryId directly", async () => {
    const { db } = testDb;
    const userA = await seedUser(db, "victim6@example.com");
    const userB = await seedUser(db, "attacker6@example.com");
    const categoryA = await runWithDb(db, accountsRepository.createCategory(userA.id, {
      name: "Categoría de A",
      kind: "expense",
    }));

    await expect(
      runWithDb(db, budgetEntriesRepository.create(userB.id, {
        categoryId: categoryA.id,
        year: 2026,
        month: 1,
        amount: 100,
        currency: "EUR",
      })),
    ).rejects.toThrow();
  });

  it("rejects another user's category in a tracked instrument", async () => {
    const { db } = testDb;
    const userA = await seedUser(db, "market-victim@example.com");
    const userB = await seedUser(db, "market-attacker@example.com");
    const categoryA = await runWithDb(db, accountsRepository.createCategory(userA.id, {
      name: "Cartera privada",
      kind: "investment",
    }));
    const instrument = await runWithDb(db, marketRepository.createInstrument({
      symbol: "SEC",
      normalizedSymbol: "SEC",
      provider: "test",
      currency: "EUR",
    }));

    await expect(
      runWithDb(db, marketRepository.createUserInstrument(userB.id, {
        instrumentId: instrument.id,
        categoryId: categoryA.id,
      })),
    ).rejects.toThrow(/categoría/i);
  });

  it("rejects another user's snapshot and account in a snapshot balance", async () => {
    const { db } = testDb;
    const userA = await seedUser(db, "snapshot-victim@example.com");
    const userB = await seedUser(db, "snapshot-attacker@example.com");
    const accountA = await runWithDb(db, accountsRepository.create(userA.id, {
      name: "Cuenta privada",
      kind: "cash",
      currency: "EUR",
      openingBalance: 0,
    }));
    const snapshotA = await runWithDb(db, wealthRepository.create(userA.id, {
      snapshotDate: "2026-08-01",
      year: 2026,
      month: 7,
    }));

    await expect(
      runWithDb(db, wealthRepository.createBalance(userB.id, {
        snapshotId: snapshotA.id,
        accountId: accountA.id,
        balance: 500,
        currency: "EUR",
      })),
    ).rejects.toThrow();
  });

  it("rejects another user's contribution and account in an allocation", async () => {
    const { db } = testDb;
    const userA = await seedUser(db, "contribution-victim@example.com");
    const userB = await seedUser(db, "contribution-attacker@example.com");
    const accountA = await runWithDb(db, accountsRepository.create(userA.id, {
      name: "Broker privado",
      kind: "investment",
      currency: "EUR",
      openingBalance: 0,
    }));
    const contributionA = await runWithDb(db, contributionsRepository.create(userA.id, {
      date: "2026-08-01",
      amount: 100,
      currency: "EUR",
    }));

    await expect(
      runWithDb(db, contributionsRepository.createAllocation(userB.id, {
        contributionId: contributionA.id,
        accountId: accountA.id,
        amount: 100,
        currency: "EUR",
      })),
    ).rejects.toThrow();
  });

  it("rejects another user's account in a TWR liquidity link", async () => {
    const { db } = testDb;
    const userA = await seedUser(db, "twr-victim@example.com");
    const userB = await seedUser(db, "twr-attacker@example.com");
    const accountA = await runWithDb(db, accountsRepository.create(userA.id, {
      name: "Liquidez privada",
      kind: "cash",
      currency: "EUR",
      openingBalance: 0,
    }));

    await expect(
      runWithDb(db, accountsRepository.createTwrLiquidityAccount(userB.id, {
        accountId: accountA.id,
        name: "Referencia cruzada",
      })),
    ).rejects.toThrow(/cuenta/i);
  });

  it("rejects another user's category in a Stock Events mapping", async () => {
    const { db } = testDb;
    const userA = await seedUser(db, "stockevents-victim@example.com");
    const userB = await seedUser(db, "stockevents-attacker@example.com");
    const categoryA = await runWithDb(db, accountsRepository.createCategory(userA.id, {
      name: "Inversión privada",
      kind: "investment",
    }));

    await expect(
      runWithDb(db, stockeventsSymbolMappingsRepository.create(userB.id, {
        categoryId: categoryA.id,
        stockeventsSymbol: "SECRET",
      })),
    ).rejects.toThrow(/categoría/i);
  });
});
