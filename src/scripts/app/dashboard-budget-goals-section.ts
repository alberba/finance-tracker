import {
  MONTHS,
  ROUTE_SECTION_MAP,
  SECTION_ROUTE_MAP,
  isGoalField,
  isGoalKey,
  isSectionId,
  type BudgetType,
  type Goal,
  type GoalKey,
  type MonthTotals,
  type SectionId,
  type State,
} from "../types";
import { renderGroupedBarChart, renderLineChart } from "../charts";
import { decorateCategoryLabel } from "../category-emoji";
import { escapeAttr, escapeHtml, formatPercent, monthFromISO, parseFloatSafe, parseIntSafe, round2, todayISO } from "../utils";

interface DashboardBudgetGoalsUi {
  activeSection: SectionId;
  month: number;
  budgetType: BudgetType;
  budgetMonth: number;
  txFilterMonth: number;
  snapshotMonth: number;
  investmentMonth: number;
  investmentOnlyUndeclared: boolean;
  contributionWorkflowMonth: number;
  contributionWorkflowDate: string;
}

interface DashboardBudgetGoalsElements {
  navTabs: HTMLElement;
  panels: HTMLElement[];
  yearDisplay: HTMLInputElement;
  dashboardMonth: HTMLSelectElement;
  txMonthFilter: HTMLSelectElement;
  txForm: HTMLFormElement & { elements: HTMLFormControlsCollection & { date: HTMLInputElement; month: HTMLSelectElement } };
  budgetBody: HTMLElement;
  budgetPlanned: HTMLElement;
  budgetActual: HTMLElement;
  budgetDiff: HTMLElement;
  snapshotMonth: HTMLSelectElement;
  investmentMonth: HTMLSelectElement;
  investmentMovementDate: HTMLInputElement;
  investmentMovementTime: HTMLInputElement;
  investmentMovementCurrency: HTMLInputElement;
  investmentOnlyUndeclared: HTMLInputElement;
  contributionWorkflowMonth: HTMLSelectElement;
  contributionWorkflowDate: HTMLInputElement;
  goalsProgress: HTMLElement;
  kpiIncome: HTMLElement;
  kpiExpense: HTMLElement;
  kpiInvestment: HTMLElement;
  kpiNetWorth: HTMLElement;
  kpiNetWorthChange: HTMLElement;
  kpiAnnualSavings: HTMLElement;
  chartNetWorth: HTMLCanvasElement;
  chartCashflow: HTMLCanvasElement;
  topExpenseList: HTMLElement;
  investmentProgressList: HTMLElement;
  settingsYear: HTMLInputElement;
}

interface DashboardBudgetGoalsDeps {
  getState: () => State;
  ui: DashboardBudgetGoalsUi;
  el: DashboardBudgetGoalsElements;
  saveState: () => void;
  renderAll: () => void;
  getMonthTotals: (month: number) => MonthTotals;
  getYearTotals: () => MonthTotals;
  getWealthSeries: () => Array<{ liquidity: number; investment: number; liabilities: number; net: number }>;
  getLatestDataMonth: () => number;
  getMonthlyCashflowSeries: () => { income: number[]; expense: number[]; investment: number[] };
  getCategoryActuals: (type: BudgetType, month: number) => Record<string, number>;
  getBudgetValue: (type: BudgetType, category: string, month: number) => number;
  ensureBudgetCategory: (type: BudgetType, category: string) => void;
  getCategoriesForType: (type: BudgetType) => string[];
  getWealthByMonth: (month: number) => { liquidity: number; investment: number; liabilities: number; net: number };
  computeInvestmentValue: (assetId: string, month: number) => number;
  formatMoney: (value: number) => string;
  formatMoneyCompact: (value: number) => string;
}

const MONTHS_PER_YEAR = 12;

export function setupDashboardBudgetGoalsSection(deps: DashboardBudgetGoalsDeps) {
  const { ui, el } = deps;
  const budgetTypes: BudgetType[] = ["income", "expense", "investment"];
  const budgetTypeMeta: Record<BudgetType, { title: string; description: string }> = {
    income: { title: "Ingresos", description: "Planifica cuánto esperas ingresar cada mes." },
    expense: { title: "Gastos", description: "Controla el gasto previsto y el real acumulado por categoría." },
    investment: { title: "Inversión", description: "Ajusta las aportaciones mensuales y compara la ejecución real." },
  };

  function bindNavigationEvents() {
    el.navTabs.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const button = target?.closest<HTMLButtonElement>("button[data-section]");
      const section = button?.dataset.section;
      if (!section) {
        return;
      }
      switchSection(section);
    });

    window.addEventListener("popstate", () => {
      const sectionId = getSectionFromPath(window.location.pathname);
      switchSection(sectionId, { updateHistory: false });
    });

    el.yearDisplay.addEventListener("change", () => {
      const state = deps.getState();
      state.year = parseIntSafe(el.yearDisplay.value, state.year);
      el.settingsYear.value = String(state.year);
      deps.saveState();
      deps.renderAll();
    });

    el.dashboardMonth.addEventListener("change", () => {
      ui.month = parseIntSafe(el.dashboardMonth.value, ui.month);
      renderDashboard();
    });
  }

  function bindBudgetEvents() {
    el.budgetBody.addEventListener("input", (event) => {
      const target = event.target;
      const rawType = target instanceof HTMLInputElement ? target.dataset.type : "";
      const rawMonth = target instanceof HTMLInputElement ? target.dataset.month : "";
      if (!(target instanceof HTMLInputElement) || !target.dataset.category || !rawType) {
        return;
      }
      const type = rawType === "expense" || rawType === "investment" ? rawType : "income";
      const month = parseIntSafe(rawMonth, 0);
      const state = deps.getState();
      const category = target.dataset.category;
      deps.ensureBudgetCategory(type, category);
      state.budget[type][category][month] = round2(parseFloatSafe(target.value, 0));
      deps.saveState();
      renderBudget();
    });
  }

  function bindGoalEvents() {
    document.querySelectorAll<HTMLInputElement>("[data-goal][data-field]").forEach((input) => {
      input.addEventListener("change", () => {
        const key = String(input.dataset.goal || "");
        const field = String(input.dataset.field || "");
        if (!isGoalKey(key) || !isGoalField(field)) {
          return;
        }
        const state = deps.getState();
        let value: string | number = input.value;
        if (field === "targetYear") {
          value = parseIntSafe(value, state.year);
        }
        if (field === "targetAmount") {
          value = round2(parseFloatSafe(value, 0));
        }
        state.goals[key][field] = value as never;
        deps.saveState();
        renderGoals();
      });
    });
  }

  function switchSection(sectionId: SectionId | string, options: { updateHistory?: boolean } = {}) {
    const { updateHistory = true } = options;
    const normalizedSectionId = normalizeSectionId(sectionId);
    ui.activeSection = normalizedSectionId;
    el.panels.forEach((panel) => {
      const isActive = panel.id === normalizedSectionId;
      panel.classList.toggle("is-active", isActive);
      panel.setAttribute("aria-hidden", String(!isActive));
    });

    Array.from(el.navTabs.querySelectorAll(".nav-btn")).forEach((button) => {
      const isActive = (button as HTMLElement).dataset.section === normalizedSectionId;
      button.classList.toggle("is-active", isActive);
      if (isActive) {
        button.setAttribute("aria-current", "page");
      } else {
        button.removeAttribute("aria-current");
      }
    });

    if (updateHistory) {
      const nextPath = getPathFromSection(normalizedSectionId);
      if (window.location.pathname !== nextPath) {
        window.history.pushState(null, "", nextPath);
      }
    }
  }

  function getSectionFromPath(pathname: string): SectionId {
    const normalizedPath = normalizePath(pathname);
    if (normalizedPath === "/") {
      return "dashboard";
    }
    return ROUTE_SECTION_MAP[normalizedPath] || "dashboard";
  }

  function populateMonthSelects() {
    const state = deps.getState();
    const monthSelects = [
      el.dashboardMonth,
      el.txMonthFilter,
      el.txForm.elements.month,
      el.snapshotMonth,
      el.investmentMonth,
      el.contributionWorkflowMonth,
    ];

    monthSelects.forEach((select) => {
      const current = String(select.value || "");
      select.innerHTML = MONTHS.map((name, index) => `<option value="${index}">${name}</option>`).join("");
      if (current && Number.isFinite(Number(current))) {
        select.value = current;
      }
    });

    el.yearDisplay.value = String(state.year);
    if (!MONTHS[ui.month]) ui.month = 0;
    if (!MONTHS[ui.txFilterMonth]) ui.txFilterMonth = ui.month;
    if (!MONTHS[ui.snapshotMonth]) ui.snapshotMonth = ui.month;
    if (!MONTHS[ui.investmentMonth]) ui.investmentMonth = ui.month;
    if (!MONTHS[ui.contributionWorkflowMonth]) ui.contributionWorkflowMonth = ui.investmentMonth;

    el.dashboardMonth.value = String(ui.month);
    el.txMonthFilter.value = String(ui.txFilterMonth);
    el.txForm.elements.month.value = String(ui.txFilterMonth);
    if (!el.txForm.elements.date.value) el.txForm.elements.date.value = todayISO();
    if (!el.investmentMovementDate.value) el.investmentMovementDate.value = todayISO();
    if (!el.investmentMovementTime.value) {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      el.investmentMovementTime.value = `${hh}:${mm}`;
    }
    if (!el.investmentMovementCurrency.value) {
      el.investmentMovementCurrency.value = String(state.currency || "EUR").toUpperCase();
    }
    if (!ui.contributionWorkflowDate) {
      ui.contributionWorkflowDate = todayISO();
      const contributionMonthFromToday = monthFromISO(ui.contributionWorkflowDate);
      if (contributionMonthFromToday !== null) {
        ui.contributionWorkflowMonth = contributionMonthFromToday;
      }
    }
    el.contributionWorkflowDate.value = ui.contributionWorkflowDate;
    el.investmentOnlyUndeclared.checked = ui.investmentOnlyUndeclared;
    el.snapshotMonth.value = String(ui.snapshotMonth);
    el.investmentMonth.value = String(ui.investmentMonth);
    el.contributionWorkflowMonth.value = String(ui.contributionWorkflowMonth);
  }

  function renderDashboard() {
    const month = ui.month;
    const monthTotals = deps.getMonthTotals(month);
    const yearTotals = deps.getYearTotals();
    const wealthSeries = deps.getWealthSeries();
    const latestDataMonth = deps.getLatestDataMonth();
    const chartMonths = MONTHS.slice(0, latestDataMonth + 1);
    const dashboardWealthSeries = wealthSeries.slice(0, latestDataMonth + 1);
    const currentWealth = wealthSeries[month] || { liquidity: 0, investment: 0, liabilities: 0, net: 0 };
    const previousYearIndex = month - MONTHS_PER_YEAR;
    const previousYearNet = previousYearIndex >= 0 ? (wealthSeries[previousYearIndex]?.net ?? 0) : 0;
    const hasPreviousYearData = previousYearNet !== 0;
    const netWorthChange = hasPreviousYearData ? ((currentWealth.net - previousYearNet) / Math.abs(previousYearNet)) * 100 : null;

    el.kpiIncome.textContent = deps.formatMoney(monthTotals.income);
    el.kpiExpense.textContent = deps.formatMoney(monthTotals.expense);
    el.kpiInvestment.textContent = deps.formatMoney(monthTotals.investment);
    el.kpiNetWorth.textContent = deps.formatMoney(currentWealth.net);
    el.kpiNetWorthChange.textContent = netWorthChange === null ? "--" : formatPercent(netWorthChange);
    el.kpiNetWorthChange.className = `kpi-networth-change ${netWorthChange === null ? "" : netWorthChange >= 0 ? "text-good" : "text-bad"}`;
    el.kpiAnnualSavings.textContent = deps.formatMoney(yearTotals.income - yearTotals.expense - yearTotals.investment);

    renderLineChart(el.chartNetWorth, dashboardWealthSeries.map((item) => item.net), {
      color: "#0d8476",
      fill: "rgba(13, 132, 118, 0.12)",
      labels: chartMonths,
      formatValue: deps.formatMoney,
      formatAxisValue: deps.formatMoneyCompact,
      includeZeroBaseline: false,
      yPaddingRatio: 0.12,
    });

    const cashflowSeries = deps.getMonthlyCashflowSeries();
    const dashboardCashflowSeries = {
      income: cashflowSeries.income.slice(0, latestDataMonth + 1),
      expense: cashflowSeries.expense.slice(0, latestDataMonth + 1),
      investment: cashflowSeries.investment.slice(0, latestDataMonth + 1),
    };
    renderGroupedBarChart(
      el.chartCashflow,
      chartMonths,
      [
        { name: "Ingresos", color: "#059669", values: dashboardCashflowSeries.income },
        { name: "Gastos", color: "#ef4444", values: dashboardCashflowSeries.expense },
        { name: "Inversión", color: "#2563eb", values: dashboardCashflowSeries.investment },
      ],
      deps.formatMoney
    );

    const topExpenses = Object.entries(deps.getCategoryActuals("expense", month))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    if (!topExpenses.length) {
      el.topExpenseList.innerHTML = "<p class='list-item'><small>Sin gastos en este mes.</small></p>";
    } else {
      el.topExpenseList.innerHTML = topExpenses
        .map(
          ([category, amount]) =>
            `<div class='list-item'><span>${escapeHtml(category)}</span><strong>${deps.formatMoney(amount)}</strong></div>`
        )
        .join("");
    }

    const investmentGoals = Object.entries(deps.getCategoryActuals("investment", month))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    if (!investmentGoals.length) {
      el.investmentProgressList.innerHTML = "<p class='list-item'><small>Sin inversión registrada en este mes.</small></p>";
      return;
    }

    el.investmentProgressList.innerHTML = investmentGoals
      .map(([category, actual]) => {
        const planned = round2(deps.getBudgetValue("investment", category, month));
        const diff = round2(actual - planned);
        const progress = calculateInvestmentCompletionPercent(actual, planned);
        return `
          <article data-investment-progress-item class="grid gap-1 rounded-[10px] border border-[var(--line)] bg-[var(--bg-card)] p-2">
            <div class="flex items-baseline justify-between gap-2">
              <span>${escapeHtml(decorateCategoryLabel("investment", category))}</span>
              <small class="text-right text-[0.8rem] leading-tight tracking-tight text-[var(--text-main)]">${deps.formatMoney(actual)} / ${deps.formatMoney(planned)} (${progress.toFixed(0)}%)</small>
            </div>
            <div class="grid gap-1">
              <div
                data-investment-progress-track
                class="progress-track relative h-2 overflow-hidden rounded-full"
                role="progressbar"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow="${Math.round(progress)}"
              >
                <div
                  data-investment-progress-fill
                  class="progress-fill h-full rounded-[inherit]"
                  style="width:${progress.toFixed(2)}%"
                ></div>
              </div>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function calculateInvestmentCompletionPercent(actual: number, planned: number) {
    if (planned <= 0) {
      return actual > 0 ? 100 : 0;
    }
    return Math.min((actual / planned) * 100, 100);
  }

  function renderBudget() {
    let annualPlanned = 0;
    let annualActual = 0;

    el.budgetBody.innerHTML = budgetTypes
      .map((type) => {
        const categories = deps.getCategoriesForType(type);
        if (!categories.length) {
          return `
            <article class="budget-block" data-budget-type="${escapeAttr(type)}">
              <header class="budget-block-head">
                <div>
                  <h3>${budgetTypeMeta[type].title}</h3>
                  <p>${budgetTypeMeta[type].description}</p>
                </div>
              </header>
              <p class="budget-empty">No hay categorías para este bloque.</p>
            </article>
          `;
        }

        let blockPlanned = 0;
        let blockActual = 0;

        const rows = categories
          .map((category) => {
            const monthlyCells = MONTHS.map((monthName, monthIndex) => {
              const planned = deps.getBudgetValue(type, category, monthIndex);
              const actual = round2(deps.getCategoryActuals(type, monthIndex)[category] || 0);
              const diff = round2(actual - planned);
              const diffClass =
                type === "income" ? (diff >= 0 ? "text-good" : "text-bad") : diff > 0 ? "text-bad" : "text-good";
              blockPlanned += planned;
              blockActual += actual;
              return `
                <td class="budget-month-cell" data-month="${monthIndex}">
                  <label class="budget-cell-input">
                    <span class="sr-only">${monthName} para ${escapeHtml(category)}</span>
                    <input
                      type="number"
                      name="budget-${escapeAttr(type)}-${escapeAttr(category)}-${monthIndex}"
                      autocomplete="off"
                      step="0.01"
                      min="0"
                      data-category="${escapeAttr(category)}"
                      data-type="${escapeAttr(type)}"
                      data-month="${monthIndex}"
                      value="${planned}"
                      aria-label="Presupuesto ${monthName} para ${escapeAttr(category)}"
                    />
                  </label>
                  <div class="budget-cell-meta">
                    <span class="budget-cell-actual">${deps.formatMoney(actual)}</span>
                    <span class="${diffClass}">${deps.formatMoney(diff)}</span>
                  </div>
                </td>
              `;
            }).join("");

            const categoryPlanned = round2(MONTHS.reduce((sum, _item, monthIndex) => sum + deps.getBudgetValue(type, category, monthIndex), 0));
            const categoryActual = round2(
              MONTHS.reduce((sum, _item, monthIndex) => sum + round2(deps.getCategoryActuals(type, monthIndex)[category] || 0), 0)
            );
            const categoryDiff = round2(categoryActual - categoryPlanned);
            const categoryDiffClass =
              type === "income"
                ? categoryDiff >= 0
                  ? "text-good"
                  : "text-bad"
                : categoryDiff > 0
                  ? "text-bad"
                  : "text-good";

            return `
              <tr>
                <th scope="row">${escapeHtml(decorateCategoryLabel(type, category))}</th>
                ${monthlyCells}
                <td class="budget-total-cell">
                  <strong>${deps.formatMoney(categoryPlanned)}</strong>
                  <div class="budget-cell-meta">
                    <span class="budget-cell-actual">${deps.formatMoney(categoryActual)}</span>
                    <span class="${categoryDiffClass}">${deps.formatMoney(categoryDiff)}</span>
                  </div>
                </td>
              </tr>
            `;
          })
          .join("");

        annualPlanned += blockPlanned;
        annualActual += blockActual;

        const blockDiff = round2(blockActual - blockPlanned);
        const blockDiffClass =
          type === "income" ? (blockDiff >= 0 ? "text-good" : "text-bad") : blockDiff > 0 ? "text-bad" : "text-good";

        return `
          <article class="budget-block" data-budget-type="${escapeAttr(type)}">
            <header class="budget-block-head">
              <div>
                <h3>${budgetTypeMeta[type].title}</h3>
                <p>${budgetTypeMeta[type].description}</p>
              </div>
              <dl class="budget-block-totals">
                <div>
                  <dt>Presupuestado</dt>
                  <dd>${deps.formatMoney(blockPlanned)}</dd>
                </div>
                <div>
                  <dt>Real</dt>
                  <dd>${deps.formatMoney(blockActual)}</dd>
                </div>
                <div>
                  <dt>Diferencia</dt>
                  <dd class="${blockDiffClass}">${deps.formatMoney(blockDiff)}</dd>
                </div>
              </dl>
            </header>
            <div class="table-wrap budget-table-wrap">
              <table class="budget-table">
                <thead>
                  <tr>
                    <th>Categoría</th>
                    ${MONTHS.map((monthName) => `<th>${monthName.slice(0, 3)}</th>`).join("")}
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows}
                </tbody>
              </table>
            </div>
          </article>
        `;
      })
      .join("");

    const annualDiff = round2(annualActual - annualPlanned);
    const annualDiffClass = annualDiff > 0 ? "text-bad" : "text-good";
    el.budgetPlanned.textContent = deps.formatMoney(annualPlanned);
    el.budgetActual.textContent = deps.formatMoney(annualActual);
    el.budgetDiff.textContent = deps.formatMoney(annualDiff);
    el.budgetDiff.className = annualDiffClass;
  }

  function renderGoals() {
    const state = deps.getState();
    const month = ui.investmentMonth;
    const wealth = deps.getWealthByMonth(month);
    const fundsValue = state.investmentAssets
      .filter((asset) => /fond|index/i.test(asset.name))
      .reduce((sum, asset) => sum + deps.computeInvestmentValue(asset.id, month), 0);
    const cryptoValue = state.investmentAssets
      .filter((asset) => /crypto|btc|eth/i.test(asset.name))
      .reduce((sum, asset) => sum + deps.computeInvestmentValue(asset.id, month), 0);

    const currentMap = {
      short: wealth.net,
      medium: wealth.net,
      long: wealth.net,
      investmentTotal: wealth.investment,
      investmentFunds: fundsValue,
      investmentCrypto: cryptoValue,
    };

    document.querySelectorAll("[data-goal][data-field]").forEach((input) => {
      const goalInput = input as HTMLInputElement;
      const key = String(goalInput.dataset.goal || "");
      const field = String(goalInput.dataset.field || "");
      if (!isGoalKey(key) || !isGoalField(field)) {
        return;
      }
      const goal = state.goals[key];
      goalInput.value = String(goal[field] ?? "");
    });

    el.goalsProgress.innerHTML = (Object.entries(state.goals) as Array<[GoalKey, Goal]>)
      .map(([key, goal]) => {
        const current = round2(currentMap[key] || 0);
        const target = Math.max(round2(goal.targetAmount || 0), 0);
        const progress = target <= 0 ? 0 : Math.min((current / target) * 100, 100);
        const remaining = round2(target - current);
        const monthsLeft = monthsUntilGoal(goal.targetYear);
        const monthlyNeeded = monthsLeft <= 0 ? remaining : round2(remaining / monthsLeft);
        return `
          <article class="goal-progress-item">
            <strong>${escapeHtml(goal.name || key)}</strong>
            <small>${goal.targetYear}</small>
            <div class="progress-track"><div class="progress-fill" style="width:${progress.toFixed(2)}%"></div></div>
            <div class="list-item"><span>Actual</span><strong>${deps.formatMoney(current)}</strong></div>
            <div class="list-item"><span>Objetivo</span><strong>${deps.formatMoney(target)}</strong></div>
            <div class="list-item"><span>Progreso</span><strong>${progress.toFixed(2)}%</strong></div>
            <div class="list-item"><span>Faltan</span><strong class="${remaining <= 0 ? "text-good" : "text-bad"}">${deps.formatMoney(remaining)}</strong></div>
            <div class="list-item"><span>Necesitas/mes</span><strong>${deps.formatMoney(monthlyNeeded)}</strong></div>
          </article>
        `;
      })
      .join("");
  }

  function normalizeSectionId(sectionId: unknown): SectionId {
    if (typeof sectionId === "string" && isSectionId(sectionId)) {
      return sectionId;
    }
    return "dashboard";
  }

  function getPathFromSection(sectionId: SectionId | string) {
    return SECTION_ROUTE_MAP[normalizeSectionId(sectionId)] || "/dashboard";
  }

  function normalizePath(pathname: unknown) {
    if (typeof pathname !== "string" || pathname.length === 0) {
      return "/";
    }
    const trimmed = pathname.replace(/\/+$/, "");
    return trimmed || "/";
  }

  function monthsUntilGoal(targetYear: number) {
    const safeYear = parseIntSafe(targetYear, deps.getState().year);
    const now = new Date();
    const end = new Date(safeYear, 11, 31);
    const diffMonths = (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth());
    return Math.max(diffMonths, 1);
  }

  return {
    bindNavigationEvents,
    bindBudgetEvents,
    bindGoalEvents,
    switchSection,
    getSectionFromPath,
    populateMonthSelects,
    renderDashboard,
    renderBudget,
    renderGoals,
  };
}
