import { test, expect } from "./fixtures";

interface TestChart {
  data: {
    datasets: Array<{
      data?: unknown[];
    }>;
  };
  tooltip: {
    setActiveElements(
      elements: Array<{ datasetIndex: number; index: number }>,
      position: { x: number; y: number },
    ): void;
  };
  update(): void;
}

interface TestChartConstructor {
  getChart(canvas: HTMLCanvasElement): TestChart | undefined;
}

test.describe("Finance tracker E2E", () => {
  test("sincroniza pestañas con path y permite carga directa por URL", { tag: "@smoke" }, async ({
    page,
    tracker,
  }) => {
    await tracker.openTransactions();
    await expect(page).toHaveURL(/\/movimientos$/);

    await tracker.openInvestment();
    await expect(page).toHaveURL(/\/inversion$/);

    await page.goto("/presupuesto");
    await expect(page).toHaveURL(/\/presupuesto$/);
    await expect(
      tracker.budgetSection.getByRole("heading", { name: "Presupuesto" }),
    ).toBeVisible();
  });

  test("redirige rutas de sección desconocidas al dashboard", async ({ page }) => {
    await page.goto("/seccion-inexistente");
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.locator("#dashboard").getByRole("heading", {
        name: "Dashboard",
        exact: true,
      }),
    ).toBeVisible();
  });

  test("navega por todas las tabs principales y mantiene su heading visible", async ({
    page,
    tracker,
  }) => {
    const tabs = [
      {
        open: () => tracker.openDashboard(),
        path: /\/$/,
        heading: "Dashboard",
      },
      {
        open: () => tracker.openTransactions(),
        path: /\/movimientos$/,
        heading: "Movimientos",
      },
      {
        open: () => tracker.openBudget(),
        path: /\/presupuesto$/,
        heading: "Presupuesto",
      },
      {
        open: () => tracker.openWealth(),
        path: /\/patrimonio$/,
        heading: "Patrimonio total",
      },
      {
        open: () => tracker.openInvestment(),
        path: /\/inversion$/,
        heading: "Inversión",
      },
      {
        open: () => tracker.openGoals(),
        path: /\/objetivos$/,
        heading: "Objetivos",
      },
      {
        open: () => tracker.openSettings(),
        path: /\/configuracion$/,
        heading: "Configuración base",
      },
      {
        open: () => tracker.openData(),
        path: /\/datos$/,
        heading: "Datos y backups",
      },
    ];

    for (const tab of tabs) {
      await tab.open();
      await expect(page).toHaveURL(tab.path);
      await expect(
        page.getByRole("heading", { name: tab.heading, exact: true }),
      ).toBeVisible();
    }
  });

  test("renderiza dashboard con KPIs", async ({ tracker }) => {
    await tracker.openDashboard();
    const incomeText = await tracker.dashboardIncomeText();
    expect(incomeText).toContain("€");
  });

  test("dashboard muestra la distribución del patrimonio con su leyenda", async ({
    tracker,
  }) => {
    await tracker.openDashboard();

    const block = tracker.dashboardSection.getByRole("region", {
      name: "Distribución del patrimonio",
    });
    await expect(block).toBeVisible();
    await expect(
      block.getByRole("img", { name: "Distribución del patrimonio por tipo de activo" }),
    ).toBeVisible();
    await expect(block.locator("#wealth-split-legend li").first()).toContainText("%");
  });

  test("dashboard muestra tooltip funcional en la evolución del patrimonio", async ({
    page,
    tracker,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === "mobile-chrome",
      "Mobile emula interacción táctil y no tiene hover fiable.",
    );
    await tracker.openDashboard();

    const tooltip = page.locator("#chart-tooltip");
    await expect(tooltip).toBeHidden();

    const networthHasData = await page.evaluate(() => {
      const canvas = document.getElementById("chart-networth");
      if (!(canvas instanceof HTMLCanvasElement)) {
        return false;
      }
      const chartConstructor = (
        window as Window & { Chart?: TestChartConstructor }
      ).Chart;
      const chart = chartConstructor?.getChart(canvas);
      const tooltipApi = chart?.tooltip;
      if (chart && tooltipApi && chart.data.datasets[0]?.data?.length > 0) {
        tooltipApi.setActiveElements([{ datasetIndex: 0, index: 0 }], {
          x: 0,
          y: 0,
        });
        chart.update();
        return true;
      }
      return false;
    });
    if (networthHasData) {
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toContainText("€");
    } else {
      await expect(tooltip).toBeHidden();
    }
  });
})
