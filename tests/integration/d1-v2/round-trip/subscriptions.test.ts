// @vitest-environment happy-dom
/**
 * Round trip for subscriptions — audit §3.1, bug (a) of issue #134.
 *
 * The row does reach D1; what fails is reading it back, so only a test that
 * crosses both directions can see it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startRoundTrip, type RoundTrip } from "./harness";
import { runWithDb } from '../../../../src/db/database'

describe("round trip: subscriptions", () => {
  let trip: RoundTrip;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime("2026-09-13T10:00:00Z");
    trip = await startRoundTrip();
  });

  afterEach(() => {
    trip.cleanup();
    vi.useRealTimers();
  });

  it("a subscription the user creates is still there after a reload", async () => {
    const { useFinancialStateStore } = await import("../../../../src/stores/financial-state");
    const { useSettingsStore } = await import("../../../../src/stores/settings");
    const { useMovementsStore } = await import("../../../../src/stores/movements");

    const financialState = useFinancialStateStore();
    financialState.commitState((draft) => {
      draft.expenseCategories = ["Ocio"];
    });
    useSettingsStore().addEntity("accounts", "Revolut", "0");
    await trip.reload();

    const accountId = financialState.accounts[0].id;
    expect(
      useMovementsStore().addSubscription({
        name: "Netflix",
        amount: 13.99,
        accountId,
        category: "Ocio",
        frequency: "monthly",
        firstChargeDate: "2026-09-12",
      }),
    ).toBe(true);

    const reloaded = await trip.reload();

    // The write half works: the row really is in D1. Everything that follows
    // is about reading it back (audit §3.1).
    const stored = await import("../../../../src/db/repositories/subscriptions").then((repo) =>
      runWithDb(trip.testDb.db, repo.listByUser(trip.userId)),
    );
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe("Netflix");
    expect(stored[0].startDate).toBe("2026-09-12");
    expect(stored[0].nextChargeDate).toBe("2026-10-12");

    expect(reloaded.subscriptions).toHaveLength(1);
    expect(reloaded.subscriptions[0]).toMatchObject({
      name: "Netflix",
      amount: 13.99,
      category: "Ocio",
      startDate: "2026-09-12",
      nextChargeDate: "2026-10-12",
    });
  });

  it("keeps the start date and frequency when the user edits a subscription", async () => {
    const { useFinancialStateStore } = await import("../../../../src/stores/financial-state");
    const { useSettingsStore } = await import("../../../../src/stores/settings");
    const { useMovementsStore } = await import("../../../../src/stores/movements");

    const financialState = useFinancialStateStore();
    financialState.commitState((draft) => {
      draft.expenseCategories = ["Ocio"];
    });
    useSettingsStore().addEntity("accounts", "Revolut", "0");
    await trip.reload();

    const accountId = financialState.accounts[0].id;
    const movements = useMovementsStore();
    movements.addSubscription({
      name: "Netflix",
      amount: 13.99,
      accountId,
      category: "Ocio",
      frequency: "monthly",
      firstChargeDate: "2026-09-20",
    });
    await trip.reload();

    const editableFinancialState = useFinancialStateStore();
    const editableMovements = useMovementsStore();
    expect(
      editableMovements.updateSubscription(editableFinancialState.subscriptions[0].id, {
        name: "Netflix Premium",
        amount: 19.99,
        accountId,
        category: "Ocio",
        frequency: "quarterly",
      }),
    ).toBe(true);

    const reloaded = await trip.reload();
    expect(reloaded.subscriptions[0]).toMatchObject({
      name: "Netflix Premium",
      startDate: "2026-09-20",
      frequency: "quarterly",
    });
  });

  it("persists a due charge and advances the next charge date", async () => {
    const { useFinancialStateStore } = await import("../../../../src/stores/financial-state");
    const { useMovementsStore } = await import("../../../../src/stores/movements");
    const accountsRepository = await import("../../../../src/db/repositories/accounts");

    await runWithDb(trip.testDb.db, accountsRepository.create(trip.userId, {
      legacyId: "revolut",
      name: "Revolut",
      kind: "cash",
      currency: "EUR",
      openingBalance: 0,
    }));
    await runWithDb(trip.testDb.db, accountsRepository.createCategory(trip.userId, {
      legacyId: "expense:Ocio",
      name: "Ocio",
      kind: "expense",
    }));
    await trip.reload();

    const currentFinancialState = useFinancialStateStore();
    useMovementsStore().addSubscription({
      name: "Netflix",
      amount: 13.99,
      accountId: currentFinancialState.accounts[0].id,
      category: "Ocio",
      frequency: "monthly",
      firstChargeDate: "2026-09-13",
    });

    const reloaded = await trip.reload();
    expect(reloaded.transactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ date: "2026-09-13", description: "Netflix", amount: 13.99 }),
      ]),
    );
    expect(reloaded.subscriptions[0].nextChargeDate).toBe("2026-10-13");
  });

  it.each([null, '2026-09-12'])(
    'persists a migrated subscription charge generated during startup (next date: %s)',
    async (nextChargeDate) => {
      trip.cleanup()
      vi.setSystemTime('2026-09-11T10:00:00Z')
      trip = await startRoundTrip(async (db, userId) => {
        const accounts = await import('../../../../src/db/repositories/accounts')
        const subscriptions = await import('../../../../src/db/repositories/subscriptions')
        const account = await runWithDb(db, accounts.create(userId, {
          legacyId: 'legacy-account',
          name: 'Cuenta',
          kind: 'cash',
          currency: 'EUR',
          openingBalance: 0,
        }))
        await runWithDb(db, subscriptions.create(userId, {
          legacyId: 'legacy-todoist',
          name: 'Todoist',
          accountId: account.id,
          amount: 48,
          currency: 'EUR',
          frequency: 'yearly',
          startDate: '2025-09-12',
          nextChargeDate,
        }))
      })

      await trip.reload()
      const subscriptionsRepository = await import('../../../../src/db/repositories/subscriptions')
      expect(
        (await runWithDb(trip.testDb.db, subscriptionsRepository.listByUser(trip.userId)))[0].nextChargeDate,
      ).toBe('2026-09-12')
      vi.setSystemTime('2026-09-13T10:00:00Z')
      const reloaded = await trip.reload()
      expect(reloaded.subscriptions[0].nextChargeDate).toBe('2027-09-12')
      expect(reloaded.transactions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ description: 'Todoist', date: '2026-09-12', amount: 48 }),
        ]),
      )
      const secondReload = await trip.reload()
      expect(secondReload.transactions).toHaveLength(1)
      const transactionsRepository = await import('../../../../src/db/repositories/transactions')
      expect(await runWithDb(trip.testDb.db, transactionsRepository.listByUser(trip.userId))).toHaveLength(1)
    },
  )

  it("recovers a subscription created before start dates were stored", async () => {
    const subscriptionsRepository = await import(
      "../../../../src/db/repositories/subscriptions"
    );
    const created = await runWithDb(trip.testDb.db, subscriptionsRepository.create(trip.userId, {
      legacyId: "legacy-netflix",
      name: "Netflix",
      amount: 13.99,
      currency: "EUR",
      frequency: "monthly",
    }));
    trip.testDb.sqlite
      .prepare(
        "UPDATE subscriptions SET billing_day = 31, start_date = NULL, next_charge_date = NULL, created_at = ? WHERE id = ?",
      )
      .run("2026-02-10T10:00:00.000Z", created.id);

    const reloaded = await trip.reload();
    expect(reloaded.subscriptions[0]).toMatchObject({
      id: "legacy-netflix",
      name: "Netflix",
      startDate: "2026-02-28",
      nextChargeDate: "2026-09-28",
    });
  });
});
