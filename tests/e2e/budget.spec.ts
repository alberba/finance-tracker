import { test, expect } from "./fixtures";

test.describe("Budget E2E", () => {
  test("presupuesto renderiza tres tablas anuales por bloque", async ({
    page,
    tracker,
  }) => {
    await tracker.openBudget();

    await expect(
      tracker.budgetSection.getByRole("heading", { name: "Presupuesto" }),
    ).toBeVisible();
    await expect(page.locator("[data-finance-workspace] #budget")).toBeVisible();
    await expect(
      tracker.budgetSection.locator("[data-budget-type='income']"),
    ).toBeVisible();
    await expect(
      tracker.budgetSection.locator("[data-budget-type='expense']"),
    ).toBeVisible();
    await expect(
      tracker.budgetSection.locator("[data-budget-type='investment']"),
    ).toBeVisible();
    await expect(
      tracker.budgetSection.getByRole("columnheader", { name: "ENE" }).first(),
    ).toBeVisible();
    await expect(
      tracker.budgetSection.getByRole("columnheader", { name: "DIC" }).first(),
    ).toBeVisible();
  });

  test("permite editar presupuesto anual por categoría y mes y conservarlo", async ({
    tracker,
  }) => {
    await tracker.setBudgetValue({
      typeValue: "expense",
      monthLabel: "MARZO",
      categoryLabel: "Comida",
      plannedValue: 432.1,
    });

    expect(
      await tracker.getBudgetValue({
        typeValue: "expense",
        monthLabel: "MARZO",
        categoryLabel: "Comida",
      }),
    ).toBe(432.1);

    await tracker.reload();
    await tracker.openBudget();

    expect(
      await tracker.getBudgetValue({
        typeValue: "expense",
        monthLabel: "MARZO",
        categoryLabel: "Comida",
      }),
    ).toBe(432.1);
  });
});
