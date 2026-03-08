import { computeContributionMetrics as computeContributionMetricsCore } from "../../lib/finance-core";
import { parseTransactionYear } from "../investment-movements";
import { renderDonutChart, renderLineChart, renderMultiLineChart, type MultiLineSeries } from "../charts";
import { toSnapshotDate } from "../contribution-workflow";
import { MONTHS, type ContributionMetricRow, type InvestmentSubTab, type SnapshotKind, type State, type Transaction } from "../types";
import { escapeAttr, escapeHtml, formatPercent, round2 } from "../utils";

interface InvestmentRenderersDeps {
  getState: () => State;
  ui: any;
  el: any;
  formatMoney: (value: number) => string;
  formatMoneyCompact: (value: number) => string;
  getWealthByMonth: (month: number) => { investment: number };
  getWealthSeries: () => Array<{ liquidity: number; investment: number; liabilities: number; net: number }>;
  getLatestDataMonth: () => number;
  computeInvestedCapital: (month: number) => number;
  computeInvestmentValue: (assetId: string, month: number) => number;
  computeAccountBalance: (accountId: string, month: number) => number;
  computeLiabilityValue: (liabilityId: string, month: number) => number;
  matchesInvestmentAsset: (category: string, asset: any) => boolean;
  getAccountName: (accountId: string) => string;
  syncInvestmentMovementComputedAmount: () => void;
  renderInvestmentEditingTransactionRow: (item: Transaction) => string;
  renderSnapshotRows: (items: any[], kind: SnapshotKind, month: number, computeFn: (itemId: string) => number) => string;
  renderContributionsTable: () => void;
  getContributionEntriesFromSnapshots: () => any[];
}

export function setupInvestmentRenderers(deps: InvestmentRenderersDeps) {
  const { ui, el } = deps;

  function isInvestmentSubTab(value: string): value is InvestmentSubTab {
    return ["dashboard", "movements", "contributions"].includes(value);
  }

  function renderWealth() {
    const state = deps.getState();
    const month = ui.snapshotMonth;
    el.snapshotAccounts.innerHTML = deps.renderSnapshotRows(state.accounts, "accounts", month, (itemId: string) => deps.computeAccountBalance(itemId, month));
    el.snapshotInvestments.innerHTML = deps.renderSnapshotRows(state.investmentAssets, "investments", month, (itemId: string) => deps.computeInvestmentValue(itemId, month));
    el.snapshotLiabilities.innerHTML = deps.renderSnapshotRows(state.liabilities, "liabilities", month, (itemId: string) => deps.computeLiabilityValue(itemId, month));

    const wealthSeries = deps.getWealthSeries();
    const latestDataMonth = deps.getLatestDataMonth();
    const chartMonths = MONTHS.slice(0, latestDataMonth + 1);
    const chartWealthSeries = wealthSeries.slice(0, latestDataMonth + 1);
    renderLineChart(el.chartWealth, chartWealthSeries.map((entry: any) => entry.net), {
      color: "#1f6feb",
      fill: "rgba(37, 99, 235, 0.13)",
      labels: chartMonths,
      formatValue: deps.formatMoney,
      formatAxisValue: deps.formatMoneyCompact,
    });

    el.wealthTimelineBody.innerHTML = wealthSeries
      .map((entry: any, monthIndex: number) => `<tr><td>${MONTHS[monthIndex]}</td><td>${deps.formatMoney(entry.liquidity)}</td><td>${deps.formatMoney(entry.investment)}</td><td>${deps.formatMoney(entry.liabilities)}</td><td><strong>${deps.formatMoney(entry.net)}</strong></td></tr>`)
      .join("");
  }

  function renderInvestment() {
    renderInvestmentYearFilterOptions();
    deps.syncInvestmentMovementComputedAmount();
    renderInvestmentTabState();
    renderInvestmentReturnModeToggle();
    renderInvestmentDashboard();
    renderInvestmentTransactionsTable();
    deps.renderContributionsTable();
  }

  function renderInvestmentYearFilterOptions() {
    const state = deps.getState();
    const years = Array.from(new Set(state.transactions.filter((item: any) => item.type === "investment").map((item: any) => parseTransactionYear(item.date)).filter((year): year is number => typeof year === "number" && Number.isInteger(year)).concat(state.year))).sort((a, b) => b - a);
    if (!years.length) years.push(state.year);
    if (!years.includes(ui.investmentYearFilter)) ui.investmentYearFilter = years[0];
    el.investmentYearFilter.innerHTML = years.map((year) => `<option value="${year}">${year}</option>`).join("");
    el.investmentYearFilter.value = String(ui.investmentYearFilter);
  }

  function renderInvestmentTabState() {
    el.investmentSubtabButtons.forEach((button: HTMLButtonElement) => {
      const tabId = String(button.dataset.investmentTab || "");
      const isActive = tabId === ui.investmentTab;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    el.investmentSubtabPanels.forEach((panel: HTMLElement) => {
      const tabId = String(panel.dataset.investmentTabPanel || "");
      const isActive = tabId === ui.investmentTab;
      panel.classList.toggle("is-active", isActive);
      panel.hidden = !isActive;
    });
  }

  function renderInvestmentReturnModeToggle() {
    el.investmentReturnModeButtons.forEach((button: HTMLButtonElement) => {
      const mode = String(button.dataset.returnMode || "");
      const isActive = mode === ui.investmentReturnMode;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function renderInvestmentDashboard() {
    const state = deps.getState();
    const month = ui.investmentMonth;
    const wealth = deps.getWealthByMonth(month);
    const investedCapital = deps.computeInvestedCapital(month);
    const isTWR = ui.investmentReturnMode === "twr";
    const twrEntries = isTWR ? deps.getContributionEntriesFromSnapshots() : [];
    const twrMetrics = isTWR ? (computeContributionMetricsCore(twrEntries) as ContributionMetricRow[]) : [];
    const twrByDate = new Map<string, number>();
    twrMetrics.forEach((m) => twrByDate.set(m.date, (m.cumulativeReturn ?? 0) * 100));

    const simpleReturn = investedCapital <= 0 ? 0 : ((wealth.investment - investedCapital) / investedCapital) * 100;
    const lastTWR = twrMetrics.length > 0 ? (twrMetrics[twrMetrics.length - 1].cumulativeReturn ?? 0) * 100 : 0;
    const displayReturn = isTWR ? lastTWR : simpleReturn;

    el.invTotalValue.textContent = deps.formatMoney(wealth.investment);
    el.invCapital.textContent = deps.formatMoney(investedCapital);
    el.invReturn.textContent = formatPercent(displayReturn);
    el.invReturn.className = displayReturn >= 0 ? "text-good" : "text-bad";
    el.invReturnLabel.textContent = isTWR ? "Rentabilidad TWR" : "Rentabilidad estimada";

    const COLORS = ["#0d8476", "#2563eb", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6", "#84cc16", "#ec4899", "#64748b"];
    const toGainPercent = (value: number, investedCapitalValue: number) => (investedCapitalValue <= 0 ? 0 : ((value - investedCapitalValue) / investedCapitalValue) * 100);

    const computeInvestedCapitalByAsset = (assetId: string, targetMonth: number): number => {
      const asset = state.investmentAssets.find((item: any) => item.id === assetId);
      if (!asset) return 0;
      const openingCapital = Number(asset.openingBalance || 0);
      const contributions = state.transactions.reduce((sum: number, item: any) => {
        if (item.type !== "investment") return sum;
        if (Number(item.month) > targetMonth) return sum;
        if (!deps.matchesInvestmentAsset(item.category, asset)) return sum;
        return sum + Number(item.amount || 0);
      }, 0);
      return round2(openingCapital + contributions);
    };

    const computeInvestedCapitalTotal = (targetMonth: number): number => round2(state.investmentAssets.reduce((sum: number, asset: any) => sum + computeInvestedCapitalByAsset(asset.id, targetMonth), 0));

    const monthIndexes = Array.from({ length: month + 1 }, (_, i) => i);
    const chartPoints = [-1, ...monthIndexes];
    const monthLabels = ["01/01", ...monthIndexes.map((m) => MONTHS[m])];
    const portfolioTotalValues = chartPoints.map((m) => deps.getWealthByMonth(m).investment);
    const portfolioInvestedCapital = chartPoints.map((m) => computeInvestedCapitalTotal(m));
    const portfolioPercentages = isTWR
      ? chartPoints.map((m) => {
          if (m < 0) return 0;
          const date = toSnapshotDate(state.year, m);
          return twrByDate.get(date) ?? 0;
        })
      : portfolioTotalValues.map((value, idx) => toGainPercent(value, portfolioInvestedCapital[idx]));

    renderMultiLineChart(el.investmentPortfolioChart, [{ name: isTWR ? "Cartera Total (TWR)" : "Cartera Total", color: COLORS[0], values: portfolioPercentages }], { labels: monthLabels, formatValue: (v) => formatPercent(v), forceZeroTick: true });

    const assetsSeries: MultiLineSeries[] = state.investmentAssets
      .filter((asset: any) => deps.computeInvestmentValue(asset.id, month) > 0)
      .map((asset: any, idx: number) => {
        const values = chartPoints.map((m) => deps.computeInvestmentValue(asset.id, m));
        const investedCapitalValues = chartPoints.map((m) => computeInvestedCapitalByAsset(asset.id, m));
        return { name: asset.name, color: COLORS[idx % COLORS.length], values: values.map((value, valueIdx) => toGainPercent(value, investedCapitalValues[valueIdx])) };
      });
    renderMultiLineChart(el.investmentAssetsChart, assetsSeries, { labels: monthLabels, formatValue: (v) => formatPercent(v), forceZeroTick: true });

    const allocation = state.investmentAssets
      .map((asset: any, idx: number) => ({ label: asset.name, color: COLORS[idx % COLORS.length], value: deps.computeInvestmentValue(asset.id, month) }))
      .filter((item) => item.value > 0);
    renderDonutChart(el.investmentAllocation, allocation, deps.formatMoney);
  }

  function renderInvestmentTransactionsTable() {
    const state = deps.getState();
    const rows = state.transactions
      .filter((item: any): item is Transaction => item.type === "investment")
      .filter((item) => {
        const year = parseTransactionYear(item.date);
        if (year === null || year !== ui.investmentYearFilter) return false;
        if (ui.investmentOnlyUndeclared && item.declared) return false;
        return true;
      })
      .sort((a, b) => {
        const byDate = String(b.date).localeCompare(String(a.date));
        if (byDate !== 0) return byDate;
        return String(b.time || "").localeCompare(String(a.time || ""));
      });

    if (!rows.length) {
      el.investmentTxBody.innerHTML = "<tr><td colspan='12'>Sin movimientos de inversión para este filtro.</td></tr>";
      return;
    }

    el.investmentTxBody.innerHTML = rows
      .map((item) => {
        if (ui.investmentTxEditingId === item.id) return deps.renderInvestmentEditingTransactionRow(item);
        const account = deps.getAccountName(item.accountId);
        const sideLabel = item.side === "sell" ? "Venta" : "Compra";
        const declaredLabel = item.declared ? "Sí" : "No";
        const declaredClass = item.declared ? "text-good" : "text-bad";
        return `<tr><td>${escapeHtml(String(item.date))}</td><td>${escapeHtml(item.time || "--:--")}</td><td>${escapeHtml(sideLabel)}</td><td>${escapeHtml(item.symbol || item.category || "-")}</td><td>${Number.isFinite(item.unitPrice) ? Number(item.unitPrice).toFixed(4) : "-"}</td><td>${Number.isFinite(item.units) ? Number(item.units).toFixed(4) : "-"}</td><td>${Number.isFinite(item.fee) ? Number(item.fee).toFixed(2) : "0.00"}</td><td>${deps.formatMoney(item.amount)}</td><td>${escapeHtml(item.movementCurrency || state.currency || "EUR")}</td><td>${escapeHtml(account)}</td><td><button type="button" class="secondary-btn" data-action="toggle-investment-declared" data-id="${escapeAttr(item.id)}" aria-label="Cambiar declarado"><span class="${declaredClass}">${escapeHtml(declaredLabel)}</span></button></td><td><div class="inline-actions"><button class="edit-btn icon-action-btn" data-action="edit-investment-tx" data-id="${escapeAttr(item.id)}" aria-label="Editar movimiento del ${escapeAttr(String(item.date))}"><svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 17.25V21h3.75L18.81 8.94l-3.75-3.75L3 17.25z"></path><path d="M20.71 7.04a1 1 0 0 0 0-1.41L18.37 3.29a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"></path></svg></button><button class="delete-btn icon-action-btn" data-delete-id="${escapeAttr(item.id)}" aria-label="Eliminar movimiento del ${escapeAttr(String(item.date))}"><svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 7h12l-1 14H7L6 7z"></path><path d="M9 4h6l1 2H8l1-2z"></path></svg></button></div></td></tr>`;
      })
      .join("");
  }

  return { isInvestmentSubTab, renderWealth, renderInvestment, renderInvestmentYearFilterOptions, renderInvestmentTabState, renderInvestmentReturnModeToggle, renderInvestmentDashboard, renderInvestmentTransactionsTable };
}
