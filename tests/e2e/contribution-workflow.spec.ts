import { test, expect, mirrorStateToServer } from "./fixtures";

test.describe("recorrido guiado de aportes", () => {
  test("fecha inicial del aporte es hoy", async ({ tracker }) => {
    await tracker.openContributionWorkflowModal();
    const expectedToday = new Date().toISOString().slice(0, 10);
    expect(await tracker.contributionWorkflowDateValue()).toBe(expectedToday);
  });

  test("abre modal, muestra paso 1 y avisa por importe sin asignar", async ({
    tracker,
    page,
  }) => {
    await tracker.openContributionWorkflowModal();
    await tracker.contributionWorkflowSelectMonth("ENERO");
    await tracker.contributionWorkflowSetDate("2026-01-31");

    const modal = page.locator("#contribution-workflow-dialog");
    await expect(
      modal.locator("#contribution-workflow-step-snapshot"),
    ).toBeVisible();
    expect(
      await modal.locator("#contribution-workflow-investments-body tr").count(),
    ).toBeGreaterThan(0);
    await expect(
      modal.locator("#contribution-workflow-liquidity-body"),
    ).toContainText("MyInvestor");
    await expect(
      modal.locator("#contribution-workflow-liquidity-body"),
    ).toContainText("Trading 212");
    await expect(
      modal.locator("#contribution-workflow-liquidity-body"),
    ).toContainText("Trade Republic");

    await tracker.contributionWorkflowApplySnapshotCalculator({
      type: "investment",
      rowName: "Fondos Indexados",
      expression: "10000+2000",
    });
    await tracker.contributionWorkflowApplySnapshotCalculator({
      type: "liquidity",
      rowName: "MyInvestor",
      expression: "750+250",
    });
    await tracker.contributionWorkflowSetLiquiditySnapshot("Trading 212", 700);
    await tracker.contributionWorkflowSetLiquiditySnapshot(
      "Trade Republic",
      500,
    );

    await tracker.contributionWorkflowGoToAllocationStep();
    await tracker.contributionWorkflowSetTotal(200);
    await tracker.contributionWorkflowSetAllocation("MyInvestor", 80);

    await expect(tracker.contributionWorkflowAllocationWarning()).toContainText(
      "Importe sin asignar",
    );

    await tracker.contributionWorkflowSave();
    await expect(modal).toBeHidden();
    await expect(page.getByRole("status")).toContainText(
      "Aporte guardado con avisos.",
    );
  });

  test("reparto completo guarda flow derivado por asignaciones", async ({
    tracker,
    page,
  }) => {
    await tracker.openContributionWorkflowModal();
    await tracker.contributionWorkflowSelectMonth("ABRIL");
    await tracker.contributionWorkflowSetDate("2026-04-30");
    await tracker.contributionWorkflowSetInvestmentSnapshot(
      "Fondos Indexados",
      13000,
    );
    await tracker.contributionWorkflowSetLiquiditySnapshot("MyInvestor", 1200);
    await tracker.contributionWorkflowSetLiquiditySnapshot("Trading 212", 900);
    await tracker.contributionWorkflowSetLiquiditySnapshot(
      "Trade Republic",
      750,
    );

    await tracker.contributionWorkflowGoToAllocationStep();
    await tracker.contributionWorkflowSetTotal(300);
    await tracker.contributionWorkflowSetAllocation("MyInvestor", 100);
    await tracker.contributionWorkflowSetAllocation("Trading 212", 100);
    await tracker.contributionWorkflowSetAllocation("Trade Republic", 100);

    await expect(tracker.contributionWorkflowAllocationWarning()).toBeEmpty();

    await tracker.contributionWorkflowSave();
    await expect(page.getByRole("status")).toContainText(
      "Aporte guardado con avisos.",
    );

    expect(await tracker.getContributionFlowByDate("2026-04-30")).toBe(300);
  });

  test("aporte manual no suma el aporte al valor de cartera de cierre", async ({
    tracker,
    page,
  }) => {
    await tracker.openContributionWorkflowModal();
    await tracker.contributionWorkflowSelectMonth("ABRIL");
    await tracker.contributionWorkflowSetDate("2026-04-15");
    await tracker.contributionWorkflowSetInvestmentSnapshot(
      "Fondos Indexados",
      13000,
    );
    await tracker.contributionWorkflowSetLiquiditySnapshot("MyInvestor", 1200);
    await tracker.contributionWorkflowSetLiquiditySnapshot("Trading 212", 900);
    await tracker.contributionWorkflowSetLiquiditySnapshot(
      "Trade Republic",
      750,
    );

    await tracker.contributionWorkflowGoToAllocationStep();
    await tracker.contributionWorkflowSetTotal(300);
    await tracker.contributionWorkflowSetAllocation("MyInvestor", 100);
    await tracker.contributionWorkflowSetAllocation("Trading 212", 100);
    await tracker.contributionWorkflowSetAllocation("Trade Republic", 100);
    await tracker.contributionWorkflowSave();

    await expect(page.getByRole("status")).toContainText("Aporte guardado");
    const row = tracker
      .investmentSection()
      .locator("#contribution-body tr", { hasText: "2026-04-15" });
    await expect(row).toBeVisible();
    await expect(row.locator("td").nth(1)).toHaveText("15.850,00 €");

    const accounts = await page.evaluate(() => {
      const raw = window.localStorage.getItem("finance-tracker-state-v1");
      if (!raw) {
        return null;
      }
      const state = JSON.parse(raw) as {
        snapshots?: Record<string, { accounts?: Record<string, number> }>;
      };
      return state.snapshots?.["3"]?.accounts || null;
    });
    expect(accounts?.myinvestor).toBe(1300);
    expect(accounts?.["trading-212"]).toBe(1000);
    expect(accounts?.["trade-republic"]).toBe(850);
  });

  test("compatibilidad mixta: legacy + allocations", async ({
    tracker,
    page,
  }) => {
    await tracker.setContributionFlowByDate("2026-01-31", 123.45);

    await tracker.openContributionWorkflowModal();
    await tracker.contributionWorkflowSelectMonth("MAYO");
    await tracker.contributionWorkflowSetDate("2026-05-31");
    await tracker.contributionWorkflowSetInvestmentSnapshot(
      "Fondos Indexados",
      14000,
    );
    await tracker.contributionWorkflowSetLiquiditySnapshot("MyInvestor", 1300);
    await tracker.contributionWorkflowSetLiquiditySnapshot("Trading 212", 1000);
    await tracker.contributionWorkflowSetLiquiditySnapshot(
      "Trade Republic",
      800,
    );

    await tracker.contributionWorkflowGoToAllocationStep();
    await tracker.contributionWorkflowSetTotal(77);
    await tracker.contributionWorkflowSetAllocation("MyInvestor", 77);
    await tracker.contributionWorkflowSave();

    const summary = await page.evaluate(() => {
      const raw = window.localStorage.getItem("finance-tracker-state-v1");
      if (!raw) {
        return { legacy: 0, allocations: 0 };
      }
      const state = JSON.parse(raw) as {
        contributions?: Array<{
          flowSource?: string;
          flowAllocations?: Array<{ accountId: string; amount: number }>;
          flow?: number;
          portfolioDate?: string;
        }>;
      };
      const contributions = Array.isArray(state.contributions)
        ? state.contributions
        : [];
      const legacy = contributions.filter(
        (item) => item.flowSource === "legacy",
      ).length;
      const allocations = contributions.filter(
        (item) =>
          Array.isArray(item.flowAllocations) &&
          item.flowAllocations.length > 0,
      ).length;
      return { legacy, allocations };
    });

    expect(summary.legacy).toBeGreaterThan(0);
    expect(summary.allocations).toBeGreaterThan(0);
  });

  test("si falta una cuenta de liquidez mantiene el flujo con cuentas restantes", async ({
    tracker,
    page,
  }) => {
    await page.evaluate(() => {
      const raw = window.localStorage.getItem("finance-tracker-state-v1");
      if (!raw) {
        return;
      }
      const state = JSON.parse(raw) as {
        accounts?: Array<{ id: string; name: string }>;
      };
      state.accounts = (state.accounts || []).filter(
        (account) =>
          String(account.name || "")
            .trim()
            .toLowerCase() !== "trade republic",
      );
      window.localStorage.setItem(
        "finance-tracker-state-v1",
        JSON.stringify(state),
      );
    });
    await mirrorStateToServer(page);
    await tracker.reload();

    await tracker.openContributionWorkflowModal();
    await expect(
      page.locator("#contribution-workflow-liquidity-body"),
    ).not.toContainText("Trade Republic");

    await tracker.contributionWorkflowSelectMonth("JUNIO");
    await tracker.contributionWorkflowSetDate("2026-06-30");
    await tracker.contributionWorkflowSetInvestmentSnapshot(
      "Fondos Indexados",
      15000,
    );
    await tracker.contributionWorkflowSetLiquiditySnapshot("MyInvestor", 1200);
    await tracker.contributionWorkflowSetLiquiditySnapshot("Trading 212", 900);
    await tracker.contributionWorkflowGoToAllocationStep();
    await tracker.contributionWorkflowSetTotal(100);
    await tracker.contributionWorkflowSetAllocation("MyInvestor", 100);
    await tracker.contributionWorkflowSave();

    await expect(page.getByRole("status")).toContainText(
      "Aporte guardado con avisos.",
    );
  });

  test("relaciona cuenta y lista para añadir el aporte al efectivo de Stock Events", async ({
    tracker,
    page,
  }) => {
    const syncedTransactions: Record<string, unknown>[] = [];
    await page.route("**/api/stockevents/watchlists", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          watchlists: [{ id: "wl-etf", name: "Cartera ETF" }],
        }),
      });
    });
    await page.route("**/api/stockevents/transactions", async (route) => {
      const body = route.request().postDataJSON() as {
        transaction?: Record<string, unknown>;
      };
      if (body.transaction) syncedTransactions.push(body.transaction);
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          transaction: {
            id: "se-cash-1",
            watchlistId: "wl-etf",
            symbol: "CASH_EUR",
          },
        }),
      });
    });

    await page.evaluate(() => {
      const raw = localStorage.getItem("finance-tracker-state-v1");
      if (!raw) {
        throw new Error("No se encontró el estado financiero inicial");
      }
      const state = JSON.parse(raw);
      state.stockEvents = {
        enabled: true,
        apiKey: "test-stock-events-key",
        symbolMappings: [],
        cashMappings: [],
      };
      localStorage.setItem("finance-tracker-state-v1", JSON.stringify(state));
    });
    await mirrorStateToServer(page);
    await tracker.reload();
    await tracker.openSettings();

    const mappingSelect = page.getByRole("combobox", {
      name: "Lista de efectivo de MyInvestor",
    });
    await expect(mappingSelect).toBeEnabled();
    await mappingSelect.selectOption("wl-etf");
    await expect(mappingSelect).toHaveValue("wl-etf");
    await expect
      .poll(() =>
        page.evaluate(() => {
          const raw = localStorage.getItem("finance-tracker-state-v1");
          return raw ? JSON.parse(raw).stockEvents?.cashMappings : [];
        }),
      )
      .toContainEqual({ accountId: "myinvestor", watchlistId: "wl-etf" });

    await tracker.openContributionWorkflowModal();
    await tracker.contributionWorkflowSelectMonth("JULIO");
    await tracker.contributionWorkflowSetDate("2026-07-19");
    await tracker.contributionWorkflowSetInvestmentSnapshot(
      "Fondos Indexados",
      16000,
    );
    await tracker.contributionWorkflowSetLiquiditySnapshot("MyInvestor", 1400);
    await tracker.contributionWorkflowSetLiquiditySnapshot("Trading 212", 900);
    await tracker.contributionWorkflowSetLiquiditySnapshot(
      "Trade Republic",
      750,
    );
    await tracker.contributionWorkflowGoToAllocationStep();
    await tracker.contributionWorkflowSetTotal(125.5);
    await tracker.contributionWorkflowSetAllocation("MyInvestor", 125.5);

    const modal = page.locator("#contribution-workflow-dialog");
    await modal
      .getByRole("checkbox", {
        name: /Añadir las asignaciones al efectivo de Stock Events/,
      })
      .check();
    await tracker.contributionWorkflowSave();

    await expect.poll(() => syncedTransactions[0]).toMatchObject({
      watchlistId: "wl-etf",
      symbol: "CASH_EUR",
      date: "2026-07-19T00:00:00Z",
      change: 1,
      price: 125.5,
      priceCurrency: "EUR",
      toCash: true,
      type: "DEFAULT",
    });

    await tracker.openContributionWorkflowModal();
    await tracker.contributionWorkflowSelectMonth("JULIO");
    await tracker.contributionWorkflowSetDate("2026-07-19");
    await tracker.contributionWorkflowGoToAllocationStep();
    await tracker.contributionWorkflowSetTotal(150.5);
    await tracker.contributionWorkflowSetAllocation("MyInvestor", 150.5);
    await page
      .locator("#contribution-workflow-dialog")
      .getByRole("checkbox", {
        name: /Añadir las asignaciones al efectivo de Stock Events/,
      })
      .check();
    await tracker.contributionWorkflowSave();

    await expect.poll(() => syncedTransactions).toHaveLength(2);
    expect(syncedTransactions[1]).toMatchObject({
      change: 1,
      price: 25,
      toCash: true,
    });
  });

  test("enter en el paso 1 no guarda el aporte", async ({ tracker, page }) => {
    await tracker.openContributionWorkflowModal();
    await tracker.contributionWorkflowSelectMonth("ABRIL");
    await tracker.contributionWorkflowSetDate("2026-04-30");
    await tracker.contributionWorkflowSetInvestmentSnapshot(
      "Fondos Indexados",
      13000,
    );

    const modal = page.locator("#contribution-workflow-dialog");
    await tracker.contributionWorkflowPressEnterInInvestmentSnapshot(
      "Fondos Indexados",
    );

    await expect(modal).toBeVisible();
    await expect(
      modal.locator("#contribution-workflow-step-snapshot"),
    ).toBeVisible();
    await expect(page.locator("#toast")).not.toContainText(
      "Aporte guardado con avisos.",
    );
    await expect(
      tracker
        .investmentSection()
        .locator("#contribution-body tr", { hasText: "2026-04-30" }),
    ).toHaveCount(0);
  });
});
