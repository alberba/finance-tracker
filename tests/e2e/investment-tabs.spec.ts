import { test, expect } from "./fixtures";

test.describe("inversión tabs y TWR", () => {
  test("inversión muestra 3 subpestañas y alterna vistas", async ({ tracker }) => {
    await tracker.openInvestment();
    const investmentSection = tracker.investmentSection();

    await expect(investmentSection.getByRole("button", { name: "Dashboard" })).toBeVisible();
    await expect(investmentSection.getByRole("button", { name: "Movimientos" })).toBeVisible();
    await expect(investmentSection.getByRole("button", { name: "Aportes" })).toBeVisible();

    await tracker.openInvestmentDashboardTab();
    await expect(investmentSection.locator("#investment-tab-dashboard")).toBeVisible();
    await expect(investmentSection.locator("#investment-tab-movements")).toBeHidden();

    await tracker.openInvestmentMovementsTab();
    await expect(investmentSection.locator("#investment-tab-movements")).toBeVisible();

    await tracker.openInvestmentContributionsTab();
    await expect(investmentSection.locator("#investment-tab-contributions")).toBeVisible();
  });

  test("movimientos de inversión solo muestra tipo inversión", async ({ tracker }) => {
    await tracker.openInvestmentMovementsTab();
    const types = await tracker.getInvestmentMovementsTypes();
    expect(types.length).toBeGreaterThan(0);
    expect(types.every((type) => type === "Inversión")).toBe(true);
  });

  test("editar y eliminar en movimientos de inversión se refleja en movimientos generales", async ({ tracker }) => {
    await tracker.addCustomTransaction({
      date: "2026-02-22",
      monthLabel: "FEBRERO",
      type: "investment",
      categoryLabel: "Crypto",
      amount: 77,
      description: "e2e-invest-sync",
    });

    await tracker.editInvestmentMovementByDescription("e2e-invest-sync", {
      amount: 88,
      newDescription: "e2e-invest-sync-edited",
      category: "Crypto",
    });

    await tracker.openTransactions();
    await tracker.filterTransactionsMonth("FEBRERO");
    await tracker.setTransactionDescriptionFilter("e2e-invest-sync-edited");
    await tracker.expectTransactionDescriptionVisible("e2e-invest-sync-edited");

    await tracker.deleteInvestmentMovementByDescription("e2e-invest-sync-edited");
    await tracker.openTransactions();
    await tracker.filterTransactionsMonth("FEBRERO");
    await tracker.setTransactionDescriptionFilter("e2e-invest-sync-edited");
    await expect(tracker.transactionsSection.locator("#tx-table-body tr", { hasText: "e2e-invest-sync-edited" })).toHaveCount(0);
  });

  test("aportes renderiza tabla TWR con base 100 y retornos iniciales vacíos", async ({ tracker }) => {
    await tracker.openInvestmentContributionsTab();
    const section = tracker.investmentSection();

    const headers = await section.locator("#investment-tab-contributions thead th").allInnerTexts();
    expect(headers.map((value) => value.trim())).toEqual([
      "Fecha",
      "Valor cartera (cierre)",
      "Flujo del día",
      "VLE",
      "Participaciones antes",
      "Participaciones después",
      "Retorno período",
      "Retorno acumulado",
    ]);

    const firstRow = section.locator("#contribution-body tr").first();
    await expect(firstRow).toBeVisible();
    await expect(firstRow.locator("td").nth(3)).toHaveText("100");
    await expect(firstRow.locator("td").nth(6)).toHaveText("--");
    await expect(firstRow.locator("td").nth(7)).toHaveText("--");
  });

  test("editar flujo en aportes recalcula y persiste tras recarga", async ({ tracker }) => {
    await tracker.openInvestmentContributionsTab();
    const section = tracker.investmentSection();

    const firstRow = section.locator("#contribution-body tr").first();
    const firstDate = (await firstRow.locator("td").nth(0).innerText()).trim();

    const secondRow = section.locator("#contribution-body tr").nth(1);
    await expect(secondRow).toBeVisible();
    const previousVle = (await secondRow.locator("td").nth(3).innerText()).trim();

    await tracker.setContributionFlowByDate(firstDate, 0);

    const nextVle = (await secondRow.locator("td").nth(3).innerText()).trim();
    expect(nextVle).not.toBe(previousVle);

    await tracker.reload();
    await tracker.openInvestmentContributionsTab();
    const persistedVle = (await tracker.investmentSection().locator("#contribution-body tr").nth(1).locator("td").nth(3).innerText()).trim();
    expect(persistedVle).toBe(nextVle);
  });
});
