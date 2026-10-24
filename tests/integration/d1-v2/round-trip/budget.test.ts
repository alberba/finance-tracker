// @vitest-environment happy-dom
/**
 * Round trip for Presupuesto and categorías — audit §4.4 (legacyId without a
 * year), §4.5 (month off-by-one, December lost) and §4.7 (category legacyId
 * mismatch leaking `categoryId: null` into everything).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startRoundTrip, type RoundTrip } from "./harness";
import { runWithDb } from '../../../../src/db/database'

/** Seeds categories the way the v1 migration writes them: `legacyId = name`. */
async function seedMigratedCategory(db: RoundTrip["testDb"]["db"], userId: string, name: string) {
  const accountsRepository = await import("../../../../src/db/repositories/accounts");
  return runWithDb(db, accountsRepository.createCategory(userId, { name, kind: "expense", legacyId: name }));
}

describe("round trip: presupuesto y categorías", () => {
  let trip: RoundTrip;

  afterEach(() => {
    trip.cleanup();
  });

  describe("con categorías migradas", () => {
    beforeEach(async () => {
      trip = await startRoundTrip(async (db, userId) => {
        await seedMigratedCategory(db, userId, "Comida");
      });
      const state = await trip.reload();
      expect(state.expenseCategories).toContain("Comida");
    });

    it("does not duplicate a migrated category when it is first referenced (§4.7)", async () => {
      const { useBudgetStore } = await import("../../../../src/stores/budget");
      useBudgetStore().updateBudgetValue("expense", "Comida", 0, 300);
      await trip.reload();

      const accountsRepository = await import("../../../../src/db/repositories/accounts");
      const categories = await runWithDb(trip.testDb.db, accountsRepository.listCategoriesByUser(trip.userId));
      expect(categories.filter((category) => category.name === "Comida")).toHaveLength(1);
    });

    it("keeps the first budget edit of a cell (§4.7)", async () => {
      const { useBudgetStore } = await import("../../../../src/stores/budget");
      useBudgetStore().updateBudgetValue("expense", "Comida", 0, 300);

      const reloaded = await trip.reload();

      expect(reloaded.budget.expense.Comida?.[0]).toBe(300);
    });
  });

  describe("sin datos migrados", () => {
    beforeEach(async () => {
      trip = await startRoundTrip();
      const { useFinancialStateStore } = await import("../../../../src/stores/financial-state");
      useFinancialStateStore().commitState((draft) => {
        draft.expenseCategories = ["Ocio"];
      });
    });

    it("reads a budget amount back in the month the user typed it in (§4.5)", async () => {
      const { useBudgetStore } = await import("../../../../src/stores/budget");
      // Enero — index 0 in the UI's 12-slot array.
      useBudgetStore().updateBudgetValue("expense", "Ocio", 0, 120);
      await trip.reload();
      useBudgetStore().updateBudgetValue("expense", "Ocio", 0, 120);

      const reloaded = await trip.reload();

      expect(reloaded.budget.expense.Ocio?.[0]).toBe(120);
      expect(reloaded.budget.expense.Ocio?.[1]).toBe(0);
    });

    it("does not lose December (§4.5)", async () => {
      const { useBudgetStore } = await import("../../../../src/stores/budget");
      useBudgetStore().updateBudgetValue("expense", "Ocio", 11, 500);
      await trip.reload();
      useBudgetStore().updateBudgetValue("expense", "Ocio", 11, 500);

      const reloaded = await trip.reload();

      expect(reloaded.budget.expense.Ocio?.[11]).toBe(500);
    });

    it("does not overwrite last year's amount when editing this year's (§4.4)", async () => {
      const { useFinancialStateStore } = await import("../../../../src/stores/financial-state");
      const { useBudgetStore } = await import("../../../../src/stores/budget");
      const budget = useBudgetStore();
      const financialState = useFinancialStateStore();

      financialState.commitState((draft) => {
        draft.year = 2025;
      });
      budget.updateBudgetValue("expense", "Ocio", 0, 100);
      await trip.reload();

      useFinancialStateStore().commitState((draft) => {
        draft.year = 2026;
      });
      useBudgetStore().updateBudgetValue("expense", "Ocio", 0, 250);
      await trip.reload();

      const budgetEntriesRepository = await import("../../../../src/db/repositories/budget-entries");
      const entries = await runWithDb(trip.testDb.db, budgetEntriesRepository.listByUser(trip.userId));
      expect(entries.map((entry) => ({ year: entry.year, amount: entry.amount }))).toEqual(
        expect.arrayContaining([
          { year: 2025, amount: 100 },
          { year: 2026, amount: 250 },
        ]),
      );
    });

    it("keeps both cells when two are edited back-to-back for a category that has never synced (§4.7)", async () => {
      const { useBudgetStore } = await import("../../../../src/stores/budget");
      const budget = useBudgetStore();

      // Neither call awaits the other — this is what filling in January then
      // February looks like before either edit's category-create has synced.
      budget.updateBudgetValue("expense", "Ocio", 0, 120);
      budget.updateBudgetValue("expense", "Ocio", 1, 80);

      const reloaded = await trip.reload();

      expect(reloaded.budget.expense.Ocio?.[0]).toBe(120);
      expect(reloaded.budget.expense.Ocio?.[1]).toBe(80);
    });
  });
});
