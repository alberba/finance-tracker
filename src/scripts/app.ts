import {
  isBudgetType,
  isSnapshotKind,
  type BudgetType,
  type Contribution,
  type Entity,
  type InvestmentSubTab,
  type SnapshotKind,
  type Transaction,
  type State,
} from "./types";
import { setupTransactionSection } from "./app/transactions-section";
import { setupContributionWorkflowSection } from "./app/contribution-workflow-modal";
import { setupInvestmentSnapshotHelpers } from "./app/investment-snapshot-helpers";
import { setupInvestmentRenderers } from "./app/investment-renderers";
import { setupInvestmentEventBindings } from "./app/investment-event-bindings";
import { setupSettingsDataSection } from "./app/settings-data-section";
import { setupAppCalculationHelpers } from "./app/calculation-helpers";
import { setupAppStateFormatHelpers } from "./app/state-format-helpers";
import { setupDashboardBudgetGoalsSection } from "./app/dashboard-budget-goals-section";
import {
  getEventElement,
  hasSelectionWithin,
} from "./app/dom-helpers";
import { getAppElements } from "./app/elements";
import { type UiState } from "./app/ui-state";
import { clone, escapeAttr, escapeHtml, parseFloatSafe } from "./utils";
import { decorateCategoryLabel } from "./category-emoji";
import {
  BASE_SEED,
  loadPersistedState,
  loadServerState,
  normalizeState,
  persistState,
  persistServerState,
  sortContributionsInState,
  sortTransactionsInState,
} from "./state";
import {
  computeInvestmentMovement,
  normalizeInvestmentSide,
  normalizeInvestmentSymbol,
} from "./investment-movements";

(() => {
  "use strict";

  let state: State = normalizeState(clone(BASE_SEED));

  const ui: UiState = {
    activeSection: "dashboard",
    month: Math.min(new Date().getMonth(), 11),
    budgetType: "income",
    budgetMonth: Math.min(new Date().getMonth(), 11),
    txFilterMonth: Math.min(new Date().getMonth(), 11),
    txSort: { column: "date", direction: "desc" },
    txOpenHeaderFilter: "",
    txSelectedIds: [],
    txFilters: {
      date: "",
      accountIds: [],
      types: [],
      category: "",
      description: "",
      amountMin: "",
      amountMax: "",
    },
    txEditingId: "",
    snapshotMonth: Math.min(new Date().getMonth(), 11),
    investmentMonth: Math.min(new Date().getMonth(), 11),
    wealthCalcTargetId: "",
    wealthCalcTargetName: "",
    investmentTab: "dashboard",
    investmentTxEditingId: "",
    investmentYearFilter: new Date().getFullYear(),
    investmentOnlyUndeclared: false,
    investmentReturnMode: "simple",
    contributionWorkflowStep: 1,
    contributionWorkflowMonth: Math.min(new Date().getMonth(), 11),
    contributionWorkflowDate: "",
    contributionWorkflowAmount: 0,
    contributionCalcTargetKind: "",
    contributionCalcTargetId: "",
    contributionCalcTargetName: "",
  };

  const el = getAppElements();

  const appCalculationHelpers = setupAppCalculationHelpers({
    getState: () => state,
    getFallbackMonth: () => ui.month,
  });

  const appStateFormatHelpers = setupAppStateFormatHelpers({
    getState: () => state,
    saveStatusEl: el.saveStatus,
    toastEl: el.toast,
    persistState,
    persistServerState,
    sortTransactionsInState,
    sortContributionsInState,
  });

  const {
    getCategoriesForType,
    getOrderedCategoriesForType,
    getMonthTotals,
    getYearTotals,
    getMonthlyCashflowSeries,
    getCategoryActuals,
    getBudgetValue,
    ensureBudgetCategory,
    getSnapshotValue,
    getAccountName,
    isBitvavoBrokerAccount,
    resolveInvestmentCategory,
    computeAccountBalance,
    computeInvestmentValue,
    computeLiabilityValue,
    matchesInvestmentAsset,
    getWealthByMonth,
    getWealthSeries,
    computeInvestmentPortfolioValueForReturnMode,
    getLatestDataMonth,
    computeInvestedCapital,
  } = appCalculationHelpers;
  const {
    saveState,
    sortTransactions,
    sortContributions,
    showToast,
    formatMoney,
    formatMoneyCompact,
  } = appStateFormatHelpers;

  const transactionSection = setupTransactionSection({
    getState: () => state,
    ui,
    el,
    getEventElement,
    hasSelectionWithin,
    populateTransactionFormOptions,
    populateTransactionCategoryOptions,
    sortTransactions,
    saveState,
    renderAll,
    showToast,
    getAccountName,
    formatMoney,
  });

  const contributionWorkflowSection = setupContributionWorkflowSection({
    getState: () => state,
    ui,
    el,
    formatMoney,
    showToast,
    saveState,
    renderAll,
    sortContributions,
    isSnapshotKind,
  });

  const renderContributionsTable = () =>
    contributionWorkflowSection.renderContributionsTable();
  const getContributionEntriesFromSnapshots = (): Contribution[] =>
    contributionWorkflowSection.getContributionEntriesFromSnapshots();
  const openContributionWorkflowModal = () =>
    contributionWorkflowSection.openContributionWorkflowModal();
  const closeContributionWorkflowModal = () =>
    contributionWorkflowSection.closeContributionWorkflowModal();
  const renderContributionWorkflowModal = () =>
    contributionWorkflowSection.renderContributionWorkflowModal();
  const renderContributionWorkflowStepState = () =>
    contributionWorkflowSection.renderContributionWorkflowStepState();
  const openContributionCalcModal = (
    kind: SnapshotKind,
    targetId: string,
    targetName: string,
  ) =>
    contributionWorkflowSection.openContributionCalcModal(
      kind,
      targetId,
      targetName,
    );
  const closeContributionCalcModal = () =>
    contributionWorkflowSection.closeContributionCalcModal();
  const applyContributionCalcModalResult = () =>
    contributionWorkflowSection.applyContributionCalcModalResult();
  const renderContributionWorkflowModalWarnings = () =>
    contributionWorkflowSection.renderContributionWorkflowModalWarnings();
  const saveContributionFromWorkflowModal = () =>
    contributionWorkflowSection.saveContributionFromWorkflowModal();
  const upsertContributionFlowForDate = (date: string, flow: number) =>
    contributionWorkflowSection.upsertContributionFlowForDate(date, flow);
  const isManualContributionDate = (date: string) =>
    contributionWorkflowSection.isManualContributionDate(date);

  const dashboardBudgetGoalsSection = setupDashboardBudgetGoalsSection({
    getState: () => state,
    ui,
    el,
    saveState,
    renderAll,
    getMonthTotals,
    getYearTotals,
    getWealthSeries,
    getLatestDataMonth,
    getMonthlyCashflowSeries,
    getCategoryActuals,
    getBudgetValue,
    ensureBudgetCategory,
    getCategoriesForType,
    getWealthByMonth,
    computeInvestmentValue,
    formatMoney,
  });
  const renderGoals = () => dashboardBudgetGoalsSection.renderGoals();

  const investmentSnapshotHelpers = setupInvestmentSnapshotHelpers({
    getState: () => state,
    ui,
    el,
    getEventElement,
    getSnapshotValue,
    resolveInvestmentCategory,
    sortTransactions,
    saveState,
    renderAll,
    showToast,
    formatMoney,
    isSnapshotKind,
  });
  const renderSnapshotRows = (
    items: Entity[],
    kind: SnapshotKind,
    month: number,
    computeFn: (itemId: string) => number,
  ) =>
    investmentSnapshotHelpers.renderSnapshotRows(items, kind, month, computeFn);
  const renderInvestmentEditingTransactionRow = (item: Transaction) =>
    investmentSnapshotHelpers.renderInvestmentEditingTransactionRow(item);
  const saveEditedInvestmentTransactionRow = (id: string) =>
    investmentSnapshotHelpers.saveEditedInvestmentTransactionRow(id);
  const onOpenInvestmentSnapshotCalcModal = (event: Event) =>
    investmentSnapshotHelpers.onOpenInvestmentSnapshotCalcModal(event);
  const closeWealthCalcModal = () =>
    investmentSnapshotHelpers.closeWealthCalcModal();
  const applyWealthCalcModalResult = () =>
    investmentSnapshotHelpers.applyWealthCalcModalResult();
  const saveSnapshotFromTable = () =>
    investmentSnapshotHelpers.saveSnapshotFromTable();

  const investmentRenderers = setupInvestmentRenderers({
    getState: () => state,
    ui,
    el,
    formatMoney,
    formatMoneyCompact,
    getWealthByMonth,
    getWealthSeries,
    computeInvestmentPortfolioValueForReturnMode,
    getLatestDataMonth,
    computeInvestedCapital,
    computeInvestmentValue,
    computeAccountBalance,
    computeLiabilityValue,
    matchesInvestmentAsset,
    getAccountName,
    syncInvestmentMovementComputedAmount,
    renderInvestmentEditingTransactionRow,
    renderSnapshotRows,
    renderContributionsTable,
    getContributionEntriesFromSnapshots,
  });
  const renderWealth = () => investmentRenderers.renderWealth();
  const renderInvestment = () => investmentRenderers.renderInvestment();
  const renderInvestmentTabState = () =>
    investmentRenderers.renderInvestmentTabState();
  const renderInvestmentReturnModeToggle = () =>
    investmentRenderers.renderInvestmentReturnModeToggle();
  const renderInvestmentDashboard = () =>
    investmentRenderers.renderInvestmentDashboard();
  const renderInvestmentTransactionsTable = () =>
    investmentRenderers.renderInvestmentTransactionsTable();

  const investmentEventBindings = setupInvestmentEventBindings({
    getState: () => state,
    ui,
    el,
    getEventElement,
    isSnapshotKind,
    isInvestmentSubTab,
    renderWealth,
    saveSnapshotFromTable,
    onOpenInvestmentSnapshotCalcModal,
    closeWealthCalcModal,
    applyWealthCalcModalResult,
    renderInvestmentTabState,
    renderInvestmentReturnModeToggle,
    renderInvestmentDashboard,
    renderInvestment,
    renderGoals,
    renderInvestmentTransactionsTable,
    syncInvestmentMovementComputedAmount,
    normalizeInvestmentMovementSymbolField,
    syncInvestmentMovementCategoryField,
    resolveInvestmentCategory,
    sortTransactions,
    saveState,
    renderAll,
    showToast,
    saveEditedInvestmentTransactionRow,
    renderContributionsTable,
    upsertContributionFlowForDate,
    openContributionWorkflowModal,
    closeContributionWorkflowModal,
    renderContributionWorkflowModal,
    renderContributionWorkflowStepState,
    renderContributionWorkflowModalWarnings,
    openContributionCalcModal,
    closeContributionCalcModal,
    applyContributionCalcModalResult,
    saveContributionFromWorkflowModal,
    isManualContributionDate,
  });

  const settingsDataSection = setupSettingsDataSection({
    getState: () => state,
    setState: (nextState: State) => {
      state = nextState;
    },
    el,
    saveState,
    renderAll,
    showToast,
    getEventElement,
    normalizeState,
    clone,
    baseSeed: BASE_SEED as State,
  });

  void init();

  async function init() {
    await hydrateState();
    ui.activeSection = dashboardBudgetGoalsSection.getSectionFromPath(
      window.location.pathname,
    );
    dashboardBudgetGoalsSection.populateMonthSelects();
    bindEvents();
    renderAll();
    dashboardBudgetGoalsSection.switchSection(ui.activeSection, {
      updateHistory: false,
    });
    // Expose a re-render hook so the theme toggle can repaint charts with
    // the active theme's colors (charts read CSS variables at render time).
    (window as typeof window & { __ftRenderAll?: () => void }).__ftRenderAll =
      renderAll;
  }

  async function hydrateState() {
    const localState = loadPersistedState();
    const serverState = await loadServerState();
    const preferredState =
      pickMostRecentState(localState, serverState) || clone(BASE_SEED);
    state = normalizeState(preferredState);
    persistState(state);
  }

  function pickMostRecentState(
    localState: unknown,
    serverState: unknown,
  ): unknown | null {
    if (!localState && !serverState) {
      return null;
    }
    if (localState && !serverState) {
      return localState;
    }
    if (!localState && serverState) {
      return serverState;
    }

    const localSavedAt = extractStateTimestamp(localState);
    const serverSavedAt = extractStateTimestamp(serverState);
    return localSavedAt >= serverSavedAt ? localState : serverState;
  }

  function extractStateTimestamp(candidate: unknown): number {
    const rawMeta = (
      candidate as { meta?: { savedAt?: string; generatedAt?: string } } | null
    )?.meta;
    const timestamp = String(rawMeta?.savedAt || rawMeta?.generatedAt || "");
    const value = Date.parse(timestamp);
    return Number.isFinite(value) ? value : 0;
  }

  function bindEvents() {
    bindNavigationEvents();
    bindTransactionEvents();
    bindBudgetEvents();
    bindWealthEvents();
    bindInvestmentEvents();
    bindGoalEvents();
    bindSettingsEvents();
    bindDataEvents();
    bindChartTooltipEvents();
  }

  function bindNavigationEvents() {
    dashboardBudgetGoalsSection.bindNavigationEvents();
  }

  function bindTransactionEvents() {
    transactionSection.bindTransactionEvents();
  }

  function bindBudgetEvents() {
    dashboardBudgetGoalsSection.bindBudgetEvents();
  }

  function bindWealthEvents() {
    investmentEventBindings.bindWealthEvents();
  }

  function bindInvestmentEvents() {
    investmentEventBindings.bindInvestmentEvents();
  }

  function bindGoalEvents() {
    dashboardBudgetGoalsSection.bindGoalEvents();
  }

  function bindSettingsEvents() {
    settingsDataSection.bindSettingsEvents();
  }

  function bindDataEvents() {
    settingsDataSection.bindDataEvents();
  }

  function bindChartTooltipEvents() {
    const hideTooltip = () => {
      el.chartTooltip.classList.remove("is-visible");
      el.chartTooltip.setAttribute("aria-hidden", "true");
    };

    const showTooltip = (message: string, x: number, y: number) => {
      el.chartTooltip.textContent = message;
      el.chartTooltip.classList.add("is-visible");
      el.chartTooltip.setAttribute("aria-hidden", "false");

      const offset = 14;
      const maxLeft = window.innerWidth - el.chartTooltip.offsetWidth - 8;
      const maxTop = window.innerHeight - el.chartTooltip.offsetHeight - 8;
      const left = Math.min(Math.max(8, x + offset), Math.max(8, maxLeft));
      const top = Math.min(Math.max(8, y + offset), Math.max(8, maxTop));
      el.chartTooltip.style.left = `${left}px`;
      el.chartTooltip.style.top = `${top}px`;
    };

    document.addEventListener("pointermove", (event) => {
      const target = getEventElement(event.target);
      const withTooltip = target?.closest<SVGElement>("[data-chart-tooltip]");
      if (!withTooltip) {
        const insideChart = target?.closest("svg") || target?.closest("canvas");
        if (insideChart) {
          return;
        }
        hideTooltip();
        return;
      }
      const message = withTooltip.getAttribute("data-chart-tooltip");
      if (!message) {
        hideTooltip();
        return;
      }
      showTooltip(message, event.clientX, event.clientY);
    });

    document.addEventListener("pointerdown", hideTooltip);
    window.addEventListener("blur", hideTooltip);
  }

  function renderAll() {
    dashboardBudgetGoalsSection.populateMonthSelects();
    populateTransactionFormOptions();
    dashboardBudgetGoalsSection.publishDashboard();
    renderTransactions();
    dashboardBudgetGoalsSection.renderBudget();
    renderWealth();
    renderInvestment();
    dashboardBudgetGoalsSection.renderGoals();
    renderSettings();
    renderDataTab();
  }

  function populateTransactionFormOptions() {
    const accountSelect = el.txForm.elements.accountId;
    accountSelect.innerHTML = state.accounts
      .map(
        (item) =>
          `<option value="${escapeAttr(item.id)}">${escapeHtml(item.name)}</option>`,
      )
      .join("");

    if (!state.accounts.length) {
      accountSelect.innerHTML = '<option value="">Sin cuentas</option>';
    }

    const currentBulkAccount = String(el.txBulkAccount.value || "");
    el.txBulkAccount.innerHTML = ['<option value="">Sin cambio</option>']
      .concat(
        state.accounts.map(
          (item) =>
            `<option value="${escapeAttr(item.id)}">${escapeHtml(item.name)}</option>`,
        ),
      )
      .join("");
    if (currentBulkAccount) {
      el.txBulkAccount.value = currentBulkAccount;
    }

    populateTransactionCategoryOptions();
    populateInvestmentMovementCategoryOptions();
    populateInvestmentMovementBrokerOptions();
  }

  function populateInvestmentMovementCategoryOptions() {
    const categorySelect = el.investmentMovementCategory;
    const currentValue = String(categorySelect.value || "").trim();
    const categories = getOrderedCategoriesForType("investment");

    categorySelect.innerHTML = categories
      .map(
        (name: string) =>
          `<option value="${escapeAttr(name)}">${escapeHtml(name)}</option>`,
      )
      .join("");

    if (!categories.length) {
      categorySelect.innerHTML =
        '<option value="Sin categoría">Sin categoría</option>';
      return;
    }

    if (currentValue && categories.includes(currentValue)) {
      categorySelect.value = currentValue;
      return;
    }

    categorySelect.value = categories[0];
  }

  function populateInvestmentMovementBrokerOptions() {
    const brokerSelect = el.investmentMovementBroker;
    const currentValue = String(brokerSelect.value || "").trim();

    brokerSelect.innerHTML = state.accounts
      .map(
        (item) =>
          `<option value="${escapeAttr(item.id)}">${escapeHtml(item.name)}</option>`,
      )
      .join("");

    if (!state.accounts.length) {
      brokerSelect.innerHTML = '<option value="">Sin brokers</option>';
      return;
    }

    if (
      currentValue &&
      state.accounts.some((item) => item.id === currentValue)
    ) {
      brokerSelect.value = currentValue;
    } else {
      brokerSelect.value = state.accounts[0].id;
    }

    syncInvestmentMovementCategoryField();
  }

  function syncInvestmentMovementComputedAmount() {
    const side = normalizeInvestmentSide(el.investmentMovementSide.value);
    const computed = computeInvestmentMovement({
      side,
      symbol: el.investmentMovementSymbol.value,
      units: parseFloatSafe(el.investmentMovementUnits.value, 0),
      unitPrice: parseFloatSafe(el.investmentMovementUnitPrice.value, 0),
      fee: parseFloatSafe(el.investmentMovementFee.value, 0),
    });
    el.investmentMovementTotal.value = String(computed.signedAmount);
  }

  function normalizeInvestmentMovementSymbolField() {
    el.investmentMovementSymbol.value = normalizeInvestmentSymbol(
      el.investmentMovementSymbol.value,
    );
  }

  function syncInvestmentMovementCategoryField() {
    const isBitvavo = isBitvavoBrokerAccount(el.investmentMovementBroker.value);
    const categorySelect = el.investmentMovementCategory;

    if (isBitvavo) {
      const hasCryptoOption = Array.from(categorySelect.options).some(
        (option) => option.value === "Crypto",
      );
      if (!hasCryptoOption) {
        categorySelect.insertAdjacentHTML(
          "afterbegin",
          '<option value="Crypto" data-temporary-bitvavo-option="true">Crypto</option>',
        );
      }
      categorySelect.value = "Crypto";
      categorySelect.disabled = true;
      categorySelect.setAttribute("aria-disabled", "true");
      return;
    }

    const wasDisabled = categorySelect.disabled;
    const temporaryCryptoOption =
      categorySelect.querySelector<HTMLOptionElement>(
        'option[data-temporary-bitvavo-option="true"]',
      );
    if (temporaryCryptoOption) {
      temporaryCryptoOption.remove();
    }
    categorySelect.disabled = false;
    categorySelect.removeAttribute("aria-disabled");
    if (wasDisabled && categorySelect.value === "Crypto") {
      const firstOption = categorySelect.options[0];
      if (firstOption) {
        categorySelect.value = firstOption.value;
      }
    }
  }

  function populateTransactionCategoryOptions() {
    const rawType = String(el.txForm.elements.type.value || "expense");
    const type: BudgetType = isBudgetType(rawType) ? rawType : "expense";
    const categories = getOrderedCategoriesForType(type);
    const categorySelect = el.txForm.elements.category;
    const currentValue = String(categorySelect.value || "").trim();

    categorySelect.innerHTML = categories
      .map(
        (name) =>
          `<option value="${escapeAttr(name)}">${escapeHtml(decorateCategoryLabel(type, name))}</option>`,
      )
      .join("");

    if (!categories.length) {
      categorySelect.innerHTML =
        '<option value="Sin categoría">Sin categoría</option>';
      return;
    }

    if (currentValue && categories.includes(currentValue)) {
      categorySelect.value = currentValue;
      return;
    }

    categorySelect.value = categories[0];
  }

  function renderTransactions() {
    transactionSection.renderTransactions();
  }

  function isInvestmentSubTab(value: string): value is InvestmentSubTab {
    return investmentRenderers.isInvestmentSubTab(value);
  }

  function renderSettings() {
    settingsDataSection.renderSettings();
  }

  function renderDataTab() {
    settingsDataSection.renderDataTab();
  }
})();
