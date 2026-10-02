import { test, expect } from "./fixtures";

const DASHBOARD_CASHFLOW_DATASET_COUNT = 3;
interface TestChart {
  data: {
    datasets: Array<{
      data?: unknown[];
      borderColor?: string;
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
        name: "Resumen financiero",
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
        heading: "Resumen financiero",
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

  test("dashboard muestra el panel de distribución de patrimonio y navega al detalle", async ({
    page,
    tracker,
  }) => {
    await tracker.openDashboard();

    await expect(
      tracker.dashboardSection.getByRole("heading", {
        name: "Distribución de patrimonio",
      }),
    ).toBeVisible();
    await expect(
      tracker.dashboardSection.getByLabel("Distribución del patrimonio"),
    ).toBeVisible();
    await expect(
      tracker.dashboardSection.locator("#wealth-split-legend"),
    ).toBeVisible();

    await tracker.dashboardSection
      .getByRole("button", { name: "Ver detalle de patrimonio" })
      .click();

    await expect(page).toHaveURL(/\/patrimonio$/);
    await expect(
      tracker.wealthSection.getByRole("heading", { name: "Patrimonio total" }),
    ).toBeVisible();
  });

  test("dashboard repinta el borde del donut de patrimonio al cambiar de tema", async ({
    page,
    tracker,
  }) => {
    await tracker.openDashboard();
    await expect(
      tracker.dashboardSection.getByLabel("Distribución del patrimonio"),
    ).toBeVisible();

    const documentElement = page.locator("html");
    const themeToggle = page.getByRole("button", {
      name: /Cambiar a modo (oscuro|claro)/,
    });
    if ((await documentElement.getAttribute("data-theme")) === "dark") {
      await themeToggle.click();
      await expect(documentElement).toHaveAttribute("data-theme", "light");
    }

    await themeToggle.click();
    await expect(documentElement).toHaveAttribute("data-theme", "dark");

    await expect.poll(async () =>
      page.evaluate(() => {
        const canvas = document.getElementById("chart-wealth-split");
        if (!(canvas instanceof HTMLCanvasElement)) {
          return null;
        }

        const chartConstructor = (
          window as Window & { Chart?: TestChartConstructor }
        ).Chart;
        const chart = chartConstructor?.getChart(canvas);
        return chart?.data.datasets[0]?.borderColor;
      }),
    ).toBe("#121419");
  });

  test("dashboard muestra el patrimonio sobre el gráfico de cashflow", async ({
    page,
    tracker,
  }) => {
    await tracker.openDashboard();

    await expect(
      tracker.dashboardSection.locator("#chart-networth"),
    ).toBeVisible();
    await expect(
      tracker.dashboardSection.locator("#chart-cashflow"),
    ).toBeVisible();

    const order = await page.evaluate(() => {
      const networth = document
        .getElementById("chart-networth")
        ?.getBoundingClientRect();
      const cashflow = document
        .getElementById("chart-cashflow")
        ?.getBoundingClientRect();
      if (!networth || !cashflow) {
        return null;
      }
      return {
        networthTop: Math.round(networth.top),
        cashflowTop: Math.round(cashflow.top),
      };
    });

    expect(order).not.toBeNull();
    if (!order) {
      return;
    }
    // El hero de patrimonio se muestra por encima del bloque de cashflow.
    expect(order.cashflowTop).toBeGreaterThan(order.networthTop);
  });

  test("dashboard recorta evolucion y cashflow hasta el ultimo mes con datos", async ({
    page,
    tracker,
  }) => {
    await tracker.openDashboard();

    const chartDetails = await page.evaluate(() => {
      const networth = document.getElementById("chart-networth");
      const cashflow = document.getElementById("chart-cashflow");
      if (!networth || !cashflow) {
        return null;
      }

      return {
        linePointCount: parseInt(networth.dataset.chartPointCount || "0"),
        barCount: parseInt(cashflow.dataset.chartBarCount || "0"),
      };
    });

    expect(chartDetails).not.toBeNull();
    if (!chartDetails) {
      return;
    }
    expect(chartDetails.linePointCount).toBeGreaterThanOrEqual(0);
    expect(chartDetails.linePointCount).toBeLessThanOrEqual(12);
    expect(chartDetails.barCount).toBeGreaterThanOrEqual(0);
    expect(chartDetails.barCount % DASHBOARD_CASHFLOW_DATASET_COUNT).toBe(0);
    expect(chartDetails.barCount).toBe(
      chartDetails.linePointCount * DASHBOARD_CASHFLOW_DATASET_COUNT,
    );
  });

  test("dashboard muestra tooltip funcional al hacer hover en cada grafica", async ({
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

    const cashflowHasData = await page.evaluate(() => {
      const canvas = document.getElementById("chart-cashflow");
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
    if (cashflowHasData) {
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toContainText("Ingresos");
    } else {
      await expect(tooltip).toBeHidden();
    }
  });
})
