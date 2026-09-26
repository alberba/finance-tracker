import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

/** The portfolio chart opens in €; the percentage view is one click away. */
async function showPortfolioPercent(page: Page) {
  await page
    .locator("#investment")
    .getByRole("group", { name: "Unidad del gráfico" })
    .getByRole("button", { name: "%" })
    .click();
  await expect(page.locator("#investment-portfolio-chart")).toHaveAttribute(
    "aria-label",
    "Evolución cartera total",
  );
}

/** Expands the first position so its per-asset chart renders. */
async function openFirstPosition(page: Page) {
  await page.locator("#investment .inv-pos-row").first().click();
  await expect(page.locator("#investment-asset-chart")).toBeVisible();
}

test.describe("Investment charts E2E", () => {
  test("inversión renderiza el gráfico de cartera, la barra de reparto y el gráfico por activo al desplegar", { tag: "@smoke" }, async ({
    tracker,
    page,
  }) => {
    await tracker.openInvestment();

    await expect(page.locator("#investment-portfolio-chart")).toBeVisible();
    await expect(page.locator("#investment-allocation")).toBeVisible();
    await expect(page.locator("#investment-asset-chart")).toHaveCount(0);

    await openFirstPosition(page);
  });

  test("inversión: gráficos de líneas muestran valores porcentuales", async ({
    tracker,
    page,
  }) => {
    await tracker.openInvestment();
    await showPortfolioPercent(page);
    await openFirstPosition(page);

    const chartData = await page.evaluate(() => {
      const portfolio = document.getElementById("investment-portfolio-chart");
      const assets = document.getElementById("investment-asset-chart");
      if (!portfolio || !assets) return null;

      const portfolioTooltips: string[] = JSON.parse(
        portfolio.dataset.chartTooltips || "[]",
      ).flat();
      const assetsTooltips: string[] = JSON.parse(
        assets.dataset.chartTooltips || "[]",
      ).flat();

      return {
        portfolioCount: parseInt(portfolio.dataset.chartPointCount || "0"),
        assetsCount: parseInt(assets.dataset.chartPointCount || "0"),
        firstPortfolioTooltip: portfolioTooltips[0] || "",
        firstAssetsTooltip: assetsTooltips[0] || "",
      };
    });

    expect(chartData).not.toBeNull();
    if (!chartData) return;

    expect(chartData.portfolioCount).toBeGreaterThan(0);
    expect(chartData.assetsCount).toBeGreaterThan(0);

    // Verificar que los tooltips contienen símbolo de porcentaje
    expect(chartData.firstPortfolioTooltip).toMatch(/%/);
    expect(chartData.firstAssetsTooltip).toMatch(/%/);
  });

  test("inversión: gráficos de líneas muestran tick 0% en eje Y", async ({
    tracker,
    page,
  }) => {
    await tracker.openInvestment();
    await showPortfolioPercent(page);
    await openFirstPosition(page);

    const zeroTickStatus = await page.evaluate(() => {
      const portfolio = document.getElementById("investment-portfolio-chart");
      const assets = document.getElementById("investment-asset-chart");
      return {
        portfolio: portfolio?.dataset.chartHasZeroTick === "true",
        assets: assets?.dataset.chartHasZeroTick === "true",
      };
    });

    expect(zeroTickStatus.portfolio).toBe(true);
    expect(zeroTickStatus.assets).toBe(true);
  });

  test("inversión: el gráfico de cartera tiene altura suficiente", async ({
    tracker,
    page,
  }) => {
    await tracker.openInvestment();

    const height = await page.evaluate(
      () =>
        (
          document.getElementById("investment-portfolio-chart")
            ?.parentElement as HTMLElement | null
        )?.offsetHeight || 0,
    );

    expect(height).toBeGreaterThan(200);
  });

  test("inversión: el gráfico de cartera muestra solo la serie Cartera Total", async ({
    tracker,
    page,
  }) => {
    await tracker.openInvestment();
    await showPortfolioPercent(page);

    const details = await page.evaluate(() => {
      const canvas = document.getElementById("investment-portfolio-chart");
      if (!canvas) return null;

      const tooltipRows: string[][] = JSON.parse(
        canvas.dataset.chartTooltips || "[]",
      );
      const allTooltips = tooltipRows.flat();
      const invalidTooltip = allTooltips.find(
        (value) => !value.startsWith("Cartera Total · "),
      );
      const seriesNames: string[] = JSON.parse(
        canvas.dataset.chartSeriesNames || "[]",
      );

      return {
        invalidTooltip: invalidTooltip || "",
        seriesCount: seriesNames.length,
        pointCount: parseInt(canvas.dataset.chartPointCount || "0"),
      };
    });

    expect(details).not.toBeNull();
    if (!details) return;

    expect(details.pointCount).toBeGreaterThan(0);
    expect(details.invalidTooltip).toBe("");
    expect(details.seriesCount).toBe(1);
  });

  test("inversión: gráficos de líneas calculan ganancia sobre capital aportado acumulado", async ({
    tracker,
    page,
  }) => {
    await tracker.openInvestment();
    await page.locator("#investment-month").selectOption({ label: "MARZO" });
    await showPortfolioPercent(page);
    await openFirstPosition(page);

    const result = await page.evaluate(() => {
      const storageKey = "finance-tracker-state-v1";
      const rawState = localStorage.getItem(storageKey);
      if (!rawState) {
        return { error: "No se encontró estado persistido en localStorage." };
      }

      const state = JSON.parse(rawState) as {
        investmentAssets: Array<{
          id: string;
          name: string;
          openingBalance: number;
        }>;
        transactions: Array<{
          type: string;
          month: number;
          category: string;
          amount: number;
        }>;
        snapshots: Record<string, { investments: Record<string, number> }>;
      };

      const month = 2; // MARZO
      const monthLabel = "MARZO";

      const slug = (value: unknown) =>
        String(value || "")
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");

      const round2 = (value: number) => Math.round(value * 100) / 100;

      const matchesInvestmentAsset = (
        category: string,
        asset: { id: string; name: string },
      ) => {
        if (!category || !asset) {
          return false;
        }
        const categorySlug = slug(category);
        return (
          categorySlug === asset.id ||
          category.toLowerCase() === String(asset.name || "").toLowerCase()
        );
      };

      const getLatestSnapshotValue = (assetId: string, targetMonth: number) => {
        for (let m = targetMonth; m >= 0; m -= 1) {
          const snapshot = state.snapshots[String(m)];
          if (!snapshot || !snapshot.investments) {
            continue;
          }
          const value = snapshot.investments[assetId];
          if (typeof value === "number") {
            return { month: m, value };
          }
        }
        return null;
      };

      const computeInvestmentValue = (assetId: string, targetMonth: number) => {
        const asset = state.investmentAssets.find(
          (item) => item.id === assetId,
        );
        if (!asset) {
          return 0;
        }

        const latestSnapshot = getLatestSnapshotValue(assetId, targetMonth);
        let startMonth = -1;
        let value = Number(asset.openingBalance || 0);

        if (latestSnapshot) {
          startMonth = latestSnapshot.month;
          value = latestSnapshot.value;
        }

        state.transactions.forEach((item) => {
          if (item.type !== "investment") {
            return;
          }
          const txMonth = Number(item.month);
          if (txMonth <= startMonth || txMonth > targetMonth) {
            return;
          }
          if (!matchesInvestmentAsset(item.category, asset)) {
            return;
          }
          value += Number(item.amount || 0);
        });

        return round2(value);
      };

      const computeInvestedCapitalByAsset = (
        assetId: string,
        targetMonth: number,
      ) => {
        const asset = state.investmentAssets.find(
          (item) => item.id === assetId,
        );
        if (!asset) {
          return 0;
        }
        const openingCapital = Number(asset.openingBalance || 0);
        const contributions = state.transactions.reduce((sum, item) => {
          if (item.type !== "investment") {
            return sum;
          }
          if (Number(item.month) > targetMonth) {
            return sum;
          }
          if (!matchesInvestmentAsset(item.category, asset)) {
            return sum;
          }
          return sum + Number(item.amount || 0);
        }, 0);
        return round2(openingCapital + contributions);
      };

      const computeInvestedCapitalTotal = (targetMonth: number) =>
        round2(
          state.investmentAssets.reduce(
            (sum, asset) =>
              sum + computeInvestedCapitalByAsset(asset.id, targetMonth),
            0,
          ),
        );

      const toGainPercent = (value: number, investedCapital: number) => {
        if (investedCapital <= 0) {
          return 0;
        }
        return ((value - investedCapital) / investedCapital) * 100;
      };

      const parseTooltipPercent = (tooltip: string | null) => {
        const match = (tooltip || "").match(/:\s*(-?\d+(?:[.,]\d+)?)%/);
        if (!match) {
          return NaN;
        }
        return Number(match[1].replace(",", "."));
      };

      // Read tooltip data from data attributes (Chart.js canvas approach)
      const portfolioCanvas = document.getElementById(
        "investment-portfolio-chart",
      );
      const assetsCanvas = document.getElementById("investment-asset-chart");
      if (!portfolioCanvas || !assetsCanvas) {
        return { error: "No se encontraron los canvas de los gráficos." };
      }

      const portfolioTooltipData: string[][] = JSON.parse(
        portfolioCanvas.dataset.chartTooltips || "[]",
      );
      const assetsTooltipData: string[][] = JSON.parse(
        assetsCanvas.dataset.chartTooltips || "[]",
      );

      const portfolioTooltip = portfolioTooltipData
        .flat()
        .find((tooltip) => tooltip.includes(`Cartera Total · ${monthLabel}:`));
      if (!portfolioTooltip) {
        return { error: "No se encontró tooltip de Cartera Total para MARZO." };
      }

      const assetTooltip = assetsTooltipData
        .flat()
        .find((tooltip) => tooltip.includes(` · ${monthLabel}:`));
      if (!assetTooltip) {
        return { error: "No se encontró tooltip de activo para MARZO." };
      }

      const assetName = assetTooltip.split(" · ")[0].trim();
      const asset = state.investmentAssets.find(
        (item) => item.name === assetName,
      );
      if (!asset) {
        return {
          error: `No se encontró activo en estado para tooltip: ${assetName}`,
        };
      }

      const portfolioValue = round2(
        state.investmentAssets.reduce(
          (sum, item) => sum + computeInvestmentValue(item.id, month),
          0,
        ),
      );
      const portfolioInvestedCapital = computeInvestedCapitalTotal(month);
      const expectedPortfolioPct = toGainPercent(
        portfolioValue,
        portfolioInvestedCapital,
      );

      const assetValue = computeInvestmentValue(asset.id, month);
      const assetInvestedCapital = computeInvestedCapitalByAsset(
        asset.id,
        month,
      );
      const expectedAssetPct = toGainPercent(assetValue, assetInvestedCapital);

      const actualPortfolioPct = parseTooltipPercent(portfolioTooltip);
      const actualAssetPct = parseTooltipPercent(assetTooltip);

      return {
        error: "",
        actualPortfolioPct,
        expectedPortfolioPct,
        actualAssetPct,
        expectedAssetPct,
      };
    });

    expect(result.error).toBe("");
    if (result.error) {
      return;
    }

    const {
      actualPortfolioPct,
      expectedPortfolioPct,
      actualAssetPct,
      expectedAssetPct,
    } = result as {
      actualPortfolioPct: number;
      expectedPortfolioPct: number;
      actualAssetPct: number;
      expectedAssetPct: number;
    };

    expect(
      Math.abs(actualPortfolioPct - expectedPortfolioPct),
    ).toBeLessThanOrEqual(0.05);
    expect(Math.abs(actualAssetPct - expectedAssetPct)).toBeLessThanOrEqual(
      0.05,
    );
  });

  test("inversión: gráficos de líneas arrancan en 01/01 con valor de apertura", async ({
    tracker,
    page,
  }) => {
    await tracker.openInvestment();
    await page.locator("#investment-month").selectOption({ label: "ENERO" });
    await showPortfolioPercent(page);
    await openFirstPosition(page);

    const tooltips = await page.evaluate(() => {
      const portfolio = document.getElementById("investment-portfolio-chart");
      const assets = document.getElementById("investment-asset-chart");
      if (!portfolio || !assets) return null;

      const portfolioTooltipData: string[][] = JSON.parse(
        portfolio.dataset.chartTooltips || "[]",
      );
      const assetsTooltipData: string[][] = JSON.parse(
        assets.dataset.chartTooltips || "[]",
      );

      return {
        firstPortfolio: portfolioTooltipData[0]?.[0] || "",
        firstAssets: assetsTooltipData[0]?.[0] || "",
      };
    });

    expect(tooltips).not.toBeNull();
    if (!tooltips) return;

    expect(tooltips.firstPortfolio).toContain("01/01");
    expect(tooltips.firstAssets).toContain("01/01");
    expect(tooltips.firstPortfolio).toMatch(/0[.,]00%/);
  });

  test("inversión: la barra de reparto tiene un segmento por posición con su tooltip", async ({
    tracker,
  }) => {
    await tracker.openInvestment();
    const section = tracker.investmentSection();

    const segments = section.locator("#investment-allocation .inv-alloc__seg");
    const positions = section.locator(".inv-pos-row");
    const count = await positions.count();
    expect(count).toBeGreaterThan(0);
    await expect(segments).toHaveCount(count);

    const firstName = (
      await positions.first().locator("th").innerText()
    ).trim();
    await segments.first().hover();
    const tip = segments.first().locator(".inv-alloc__tip");
    await expect(tip).toBeVisible();
    await expect(tip).toContainText(firstName);
    await expect(tip).toContainText("%");
  });

  test("inversión: seleccionar mes diferente actualiza los gráficos", async ({
    tracker,
    page,
  }) => {
    await tracker.openInvestment();

    // Obtener cantidad inicial de puntos
    const initialPoints = await page.evaluate(() => {
      const canvas = document.getElementById("investment-portfolio-chart");
      return parseInt(canvas?.dataset.chartPointCount || "0");
    });

    // Seleccionar mes anterior
    await page.locator("#investment-month").selectOption({ label: "ENERO" });
    await expect(page.locator("#investment-portfolio-chart")).toHaveAttribute(
      "data-chart-point-count",
      /\d+/,
    );

    // La cantidad de puntos debe cambiar o ser diferente
    const updatedPoints = await page.evaluate(() => {
      const canvas = document.getElementById("investment-portfolio-chart");
      return parseInt(canvas?.dataset.chartPointCount || "0");
    });

    // En enero debería haber menos o igual puntos de datos
    expect(updatedPoints).toBeLessThanOrEqual(initialPoints);
  });
});
