import {
  isBudgetType,
  isSnapshotKind,
  type BudgetType,
  type Contribution,
  type InvestmentSubTab,
  type SectionId,
  type SnapshotKind,
  type Transaction,
  type SortDirection,
  type State,
  type TxSortColumn,
} from "./types";
import { type TransactionFilters } from "./transactions";
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
  clone,
  escapeAttr,
  escapeHtml,
  parseFloatSafe,
} from "./utils";
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
} from "./investment-movements";

(() => {
  "use strict";

  interface UiState {
    activeSection: SectionId;
    month: number;
    budgetType: BudgetType;
    budgetMonth: number;
    txFilterMonth: number;
    txSort: {
      column: TxSortColumn;
      direction: SortDirection;
    };
    txOpenHeaderFilter: TxSortColumn | "";
    txSelectedIds: string[];
    txFilters: TransactionFilters;
    txEditingId: string;
    snapshotMonth: number;
    investmentMonth: number;
    wealthCalcTargetId: string;
    wealthCalcTargetName: string;
    investmentTab: InvestmentSubTab;
    investmentTxEditingId: string;
    investmentYearFilter: number;
    investmentOnlyUndeclared: boolean;
    investmentReturnMode: "simple" | "twr";
    contributionWorkflowStep: 1 | 2;
    contributionWorkflowMonth: number;
    contributionWorkflowDate: string;
    contributionWorkflowAmount: number;
    contributionCalcTargetKind: SnapshotKind | "";
    contributionCalcTargetId: string;
    contributionCalcTargetName: string;
  }

  interface TxFormControls extends HTMLFormControlsCollection {
    date: HTMLInputElement;
    month: HTMLSelectElement;
    type: HTMLSelectElement;
    accountId: HTMLSelectElement;
    category: HTMLSelectElement;
    description: HTMLInputElement;
    amount: HTMLInputElement;
  }

  interface TxForm extends HTMLFormElement {
    elements: TxFormControls;
  }

  interface InvestmentMovementFormControls extends HTMLFormControlsCollection {
    date: HTMLInputElement;
    time: HTMLInputElement;
    side: HTMLSelectElement;
    symbol: HTMLInputElement;
    category: HTMLSelectElement;
    unitPrice: HTMLInputElement;
    units: HTMLInputElement;
    fee: HTMLInputElement;
    total: HTMLInputElement;
    movementCurrency: HTMLInputElement;
    accountId: HTMLSelectElement;
    declared: HTMLInputElement;
  }

  interface InvestmentMovementForm extends HTMLFormElement {
    elements: InvestmentMovementFormControls;
  }

  function getRequiredElement<T extends Element>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error(`Elemento requerido no encontrado: #${id}`);
    }
    return element as unknown as T;
  }

  function getEventElement(target: EventTarget | null): Element | null {
    return target instanceof Element ? target : null;
  }

  function hasSelectionWithin(container: Element): boolean {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      const ancestor = range.commonAncestorContainer;
      if (ancestor && container.contains(ancestor)) {
        return true;
      }
    }

    const activeElement = document.activeElement;
    if (
      activeElement &&
      container.contains(activeElement) &&
      (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) &&
      typeof activeElement.selectionStart === "number" &&
      typeof activeElement.selectionEnd === "number"
    ) {
      return activeElement.selectionEnd > activeElement.selectionStart;
    }

    return false;
  }

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

  const el = {
    navTabs: getRequiredElement<HTMLElement>("nav-tabs"),
    panels: Array.from(document.querySelectorAll<HTMLElement>(".panel")),
    toast: getRequiredElement<HTMLElement>("toast"),
    saveStatus: getRequiredElement<HTMLElement>("save-status"),

    yearDisplay: getRequiredElement<HTMLInputElement>("year-display"),
    dashboardMonth: getRequiredElement<HTMLSelectElement>("dashboard-month"),
    kpiIncome: getRequiredElement<HTMLElement>("kpi-income"),
    kpiExpense: getRequiredElement<HTMLElement>("kpi-expense"),
    kpiInvestment: getRequiredElement<HTMLElement>("kpi-investment"),
    kpiNetWorth: getRequiredElement<HTMLElement>("kpi-net-worth"),
    kpiNetWorthChange: getRequiredElement<HTMLElement>("kpi-net-worth-change"),
    kpiAnnualSavings: getRequiredElement<HTMLElement>("kpi-annual-savings"),
    chartNetWorth: getRequiredElement<HTMLCanvasElement>("chart-networth"),
    chartCashflow: getRequiredElement<HTMLCanvasElement>("chart-cashflow"),
    topExpenseList: getRequiredElement<HTMLElement>("top-expense-list"),
    investmentProgressList: getRequiredElement<HTMLElement>("investment-progress-list"),

    txMonthFilter: getRequiredElement<HTMLSelectElement>("tx-month-filter"),
    txForm: getRequiredElement<TxForm>("tx-form"),
    txBody: getRequiredElement<HTMLElement>("tx-table-body"),
    txHeaderFilterDate: getRequiredElement<HTMLInputElement>("tx-header-filter-date"),
    txHeaderFilterAccount: getRequiredElement<HTMLElement>("tx-header-filter-account"),
    txHeaderFilterType: getRequiredElement<HTMLElement>("tx-header-filter-type"),
    txHeaderFilterCategory: getRequiredElement<HTMLInputElement>("tx-header-filter-category"),
    txHeaderFilterDescription: getRequiredElement<HTMLInputElement>("tx-header-filter-description"),
    txHeaderFilterAmountMin: getRequiredElement<HTMLInputElement>("tx-header-filter-amount-min"),
    txHeaderFilterAmountMax: getRequiredElement<HTMLInputElement>("tx-header-filter-amount-max"),
    txOpenModal: getRequiredElement<HTMLButtonElement>("tx-open-modal"),
    txDialog: getRequiredElement<HTMLDialogElement>("tx-dialog"),
    txCloseModal: getRequiredElement<HTMLButtonElement>("tx-close-modal"),
    txSubmitMore: getRequiredElement<HTMLButtonElement>("tx-submit-more"),
    txSelectAll: getRequiredElement<HTMLInputElement>("tx-select-all"),
    txSelectedCount: getRequiredElement<HTMLElement>("tx-selected-count"),
    txBulkType: getRequiredElement<HTMLSelectElement>("tx-bulk-type"),
    txBulkAccount: getRequiredElement<HTMLSelectElement>("tx-bulk-account"),
    txBulkCategory: getRequiredElement<HTMLInputElement>("tx-bulk-category"),
    txBulkApply: getRequiredElement<HTMLButtonElement>("tx-bulk-apply"),
    txBulkDelete: getRequiredElement<HTMLButtonElement>("tx-bulk-delete"),
    txTotalIncome: getRequiredElement<HTMLElement>("tx-total-income"),
    txTotalExpense: getRequiredElement<HTMLElement>("tx-total-expense"),
    txTotalInvestment: getRequiredElement<HTMLElement>("tx-total-investment"),
    txCategoryBreakdownBody: getRequiredElement<HTMLElement>("tx-category-breakdown-body"),

    budgetBody: getRequiredElement<HTMLElement>("budget-tables"),
    budgetPlanned: getRequiredElement<HTMLElement>("budget-total-planned"),
    budgetActual: getRequiredElement<HTMLElement>("budget-total-actual"),
    budgetDiff: getRequiredElement<HTMLElement>("budget-total-diff"),

    snapshotMonth: getRequiredElement<HTMLSelectElement>("snapshot-month"),
    saveSnapshot: getRequiredElement<HTMLButtonElement>("save-snapshot"),
    snapshotAccounts: getRequiredElement<HTMLElement>("snapshot-accounts"),
    snapshotInvestments: getRequiredElement<HTMLElement>("snapshot-investments"),
    snapshotLiabilities: getRequiredElement<HTMLElement>("snapshot-liabilities"),
    wealthTimelineBody: getRequiredElement<HTMLElement>("wealth-timeline-body"),
    chartWealth: getRequiredElement<HTMLCanvasElement>("chart-wealth"),
    wealthCalcDialog: getRequiredElement<HTMLDialogElement>("wealth-calc-dialog"),
    wealthCalcForm: getRequiredElement<HTMLFormElement>("wealth-calc-form"),
    wealthCalcTitle: getRequiredElement<HTMLElement>("wealth-calc-title"),
    wealthCalcExpression: getRequiredElement<HTMLInputElement>("wealth-calc-expression"),
    wealthCalcClose: getRequiredElement<HTMLButtonElement>("wealth-calc-close"),

    investmentMonth: getRequiredElement<HTMLSelectElement>("investment-month"),
    investmentSubtabButtons: Array.from(document.querySelectorAll<HTMLButtonElement>("[data-investment-tab]")),
    investmentSubtabPanels: Array.from(document.querySelectorAll<HTMLElement>("[data-investment-tab-panel]")),
    investmentReturnModeButtons: Array.from(document.querySelectorAll<HTMLButtonElement>("[data-return-mode]")),
    invTotalValue: getRequiredElement<HTMLElement>("inv-total-value"),
    invCapital: getRequiredElement<HTMLElement>("inv-capital"),
    invReturn: getRequiredElement<HTMLElement>("inv-return"),
    invReturnLabel: getRequiredElement<HTMLElement>("inv-return-label"),
    investmentPortfolioChart: getRequiredElement<HTMLCanvasElement>("investment-portfolio-chart"),
    investmentAssetsChart: getRequiredElement<HTMLCanvasElement>("investment-assets-chart"),
    investmentAllocation: getRequiredElement<HTMLCanvasElement>("investment-allocation"),
    investmentYearFilter: getRequiredElement<HTMLSelectElement>("investment-year-filter"),
    investmentOnlyUndeclared: getRequiredElement<HTMLInputElement>("investment-only-undeclared"),
    investmentMovementForm: getRequiredElement<InvestmentMovementForm>("investment-movement-form"),
    investmentTxBody: getRequiredElement<HTMLElement>("investment-tx-table-body"),
    investmentMovementDate: getRequiredElement<HTMLInputElement>("investment-movement-date"),
    investmentMovementTime: getRequiredElement<HTMLInputElement>("investment-movement-time"),
    investmentMovementSide: getRequiredElement<HTMLSelectElement>("investment-movement-side"),
    investmentMovementSymbol: getRequiredElement<HTMLInputElement>("investment-movement-symbol"),
    investmentMovementCategory: getRequiredElement<HTMLSelectElement>("investment-movement-category"),
    investmentMovementUnitPrice: getRequiredElement<HTMLInputElement>("investment-movement-unit-price"),
    investmentMovementUnits: getRequiredElement<HTMLInputElement>("investment-movement-units"),
    investmentMovementFee: getRequiredElement<HTMLInputElement>("investment-movement-fee"),
    investmentMovementTotal: getRequiredElement<HTMLInputElement>("investment-movement-total"),
    investmentMovementCurrency: getRequiredElement<HTMLInputElement>("investment-movement-currency"),
    investmentMovementBroker: getRequiredElement<HTMLSelectElement>("investment-movement-broker"),
    investmentMovementDeclared: getRequiredElement<HTMLInputElement>("investment-movement-declared"),
    contributionBody: getRequiredElement<HTMLElement>("contribution-body"),
    openContributionWorkflow: getRequiredElement<HTMLButtonElement>("open-contribution-workflow"),
    contributionWorkflowDialog: getRequiredElement<HTMLDialogElement>("contribution-workflow-dialog"),
    contributionWorkflowForm: getRequiredElement<HTMLFormElement>("contribution-workflow-form"),
    contributionWorkflowClose: getRequiredElement<HTMLButtonElement>("contribution-workflow-close"),
    contributionWorkflowMonth: getRequiredElement<HTMLSelectElement>("contribution-workflow-month"),
    contributionWorkflowDate: getRequiredElement<HTMLInputElement>("contribution-workflow-date"),
    contributionWorkflowStepSnapshot: getRequiredElement<HTMLElement>("contribution-workflow-step-snapshot"),
    contributionWorkflowStepAllocation: getRequiredElement<HTMLElement>("contribution-workflow-step-allocation"),
    contributionWorkflowInvestmentsBody: getRequiredElement<HTMLElement>("contribution-workflow-investments-body"),
    contributionWorkflowLiquidityBody: getRequiredElement<HTMLElement>("contribution-workflow-liquidity-body"),
    contributionWorkflowAllocationBody: getRequiredElement<HTMLElement>("contribution-workflow-allocation-body"),
    contributionWorkflowTotal: getRequiredElement<HTMLInputElement>("contribution-workflow-total"),
    contributionWorkflowSnapshotWarning: getRequiredElement<HTMLElement>("contribution-workflow-snapshot-warning"),
    contributionWorkflowAllocationWarning: getRequiredElement<HTMLElement>("contribution-workflow-allocation-warning"),
    contributionWorkflowPrev: getRequiredElement<HTMLButtonElement>("contribution-workflow-prev"),
    contributionWorkflowNext: getRequiredElement<HTMLButtonElement>("contribution-workflow-next"),
    contributionWorkflowSave: getRequiredElement<HTMLButtonElement>("contribution-workflow-save"),
    contributionDeleteDialog: getRequiredElement<HTMLDialogElement>("contribution-delete-dialog"),
    contributionDeleteForm: getRequiredElement<HTMLFormElement>("contribution-delete-form"),
    contributionDeleteTitle: getRequiredElement<HTMLElement>("contribution-delete-title"),
    contributionDeleteMessage: getRequiredElement<HTMLElement>("contribution-delete-message"),
    contributionDeleteClose: getRequiredElement<HTMLButtonElement>("contribution-delete-close"),
    contributionDeleteCancel: getRequiredElement<HTMLButtonElement>("contribution-delete-cancel"),
    contributionDeleteConfirm: getRequiredElement<HTMLButtonElement>("contribution-delete-confirm"),
    contributionCalcDialog: getRequiredElement<HTMLDialogElement>("contribution-calc-dialog"),
    contributionCalcForm: getRequiredElement<HTMLFormElement>("contribution-calc-form"),
    contributionCalcTitle: getRequiredElement<HTMLElement>("contribution-calc-title"),
    contributionCalcClose: getRequiredElement<HTMLButtonElement>("contribution-calc-close"),
    contributionCalcExpression: getRequiredElement<HTMLInputElement>("contribution-calc-expression"),

    goalsProgress: getRequiredElement<HTMLElement>("goals-progress"),

    settingsYear: getRequiredElement<HTMLInputElement>("settings-year"),
    settingsCurrency: getRequiredElement<HTMLInputElement>("settings-currency"),
    saveSettingsMain: getRequiredElement<HTMLButtonElement>("save-settings-main"),

    addAccountForm: getRequiredElement<HTMLFormElement>("add-account-form"),
    addInvestmentForm: getRequiredElement<HTMLFormElement>("add-investment-form"),
    addLiabilityForm: getRequiredElement<HTMLFormElement>("add-liability-form"),

    settingsAccounts: getRequiredElement<HTMLElement>("settings-accounts"),
    settingsInvestments: getRequiredElement<HTMLElement>("settings-investments"),
    settingsLiabilities: getRequiredElement<HTMLElement>("settings-liabilities"),
    settingsTwrLiquidity: getRequiredElement<HTMLElement>("settings-twr-liquidity"),

    addIncomeCategory: getRequiredElement<HTMLFormElement>("add-income-category"),
    addExpenseCategory: getRequiredElement<HTMLFormElement>("add-expense-category"),
    addInvestmentCategory: getRequiredElement<HTMLFormElement>("add-investment-category"),

    incomeTags: getRequiredElement<HTMLElement>("settings-income-categories"),
    expenseTags: getRequiredElement<HTMLElement>("settings-expense-categories"),
    investmentTags: getRequiredElement<HTMLElement>("settings-investment-categories"),

    dataTotalTransactions: getRequiredElement<HTMLElement>("data-total-transactions"),
    dataTotalSnapshots: getRequiredElement<HTMLElement>("data-total-snapshots"),
    dataTotalContributions: getRequiredElement<HTMLElement>("data-total-contributions"),
    dataMeta: getRequiredElement<HTMLElement>("data-meta"),
    exportJson: getRequiredElement<HTMLButtonElement>("export-json"),
    importJson: getRequiredElement<HTMLInputElement>("import-json"),
    exportTransactionsCsv: getRequiredElement<HTMLButtonElement>("export-transactions-csv"),
    resetSeed: getRequiredElement<HTMLButtonElement>("reset-seed"),
    chartTooltip: getRequiredElement<HTMLElement>("chart-tooltip"),
  } as const;

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
  const { saveState, sortTransactions, sortContributions, showToast, formatMoney, formatMoneyCompact } =
    appStateFormatHelpers;

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

  const renderContributionsTable = () => contributionWorkflowSection.renderContributionsTable();
  const getContributionEntriesFromSnapshots = (): Contribution[] =>
    contributionWorkflowSection.getContributionEntriesFromSnapshots();
  const openContributionWorkflowModal = () => contributionWorkflowSection.openContributionWorkflowModal();
  const closeContributionWorkflowModal = () => contributionWorkflowSection.closeContributionWorkflowModal();
  const renderContributionWorkflowModal = () => contributionWorkflowSection.renderContributionWorkflowModal();
  const renderContributionWorkflowStepState = () => contributionWorkflowSection.renderContributionWorkflowStepState();
  const openContributionCalcModal = (kind: SnapshotKind, targetId: string, targetName: string) =>
    contributionWorkflowSection.openContributionCalcModal(kind, targetId, targetName);
  const closeContributionCalcModal = () => contributionWorkflowSection.closeContributionCalcModal();
  const applyContributionCalcModalResult = () => contributionWorkflowSection.applyContributionCalcModalResult();
  const renderContributionWorkflowModalWarnings = () => contributionWorkflowSection.renderContributionWorkflowModalWarnings();
  const saveContributionFromWorkflowModal = () => contributionWorkflowSection.saveContributionFromWorkflowModal();
  const upsertContributionFlowForDate = (date: string, flow: number) =>
    contributionWorkflowSection.upsertContributionFlowForDate(date, flow);
  const isManualContributionDate = (date: string) => contributionWorkflowSection.isManualContributionDate(date);

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
    formatMoneyCompact,
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
  const renderSnapshotRows = (items: any, kind: any, month: any, computeFn: any) =>
    investmentSnapshotHelpers.renderSnapshotRows(items, kind, month, computeFn);
  const renderInvestmentEditingTransactionRow = (item: Transaction) =>
    investmentSnapshotHelpers.renderInvestmentEditingTransactionRow(item);
  const saveEditedInvestmentTransactionRow = (id: string) => investmentSnapshotHelpers.saveEditedInvestmentTransactionRow(id);
  const onOpenInvestmentSnapshotCalcModal = (event: Event) => investmentSnapshotHelpers.onOpenInvestmentSnapshotCalcModal(event);
  const closeWealthCalcModal = () => investmentSnapshotHelpers.closeWealthCalcModal();
  const applyWealthCalcModalResult = () => investmentSnapshotHelpers.applyWealthCalcModalResult();
  const saveSnapshotFromTable = () => investmentSnapshotHelpers.saveSnapshotFromTable();

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
  const renderInvestmentTabState = () => investmentRenderers.renderInvestmentTabState();
  const renderInvestmentReturnModeToggle = () => investmentRenderers.renderInvestmentReturnModeToggle();
  const renderInvestmentDashboard = () => investmentRenderers.renderInvestmentDashboard();
  const renderInvestmentTransactionsTable = () => investmentRenderers.renderInvestmentTransactionsTable();

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
    ui.activeSection = dashboardBudgetGoalsSection.getSectionFromPath(window.location.pathname);
    dashboardBudgetGoalsSection.populateMonthSelects();
    bindEvents();
    renderAll();
    dashboardBudgetGoalsSection.switchSection(ui.activeSection, { updateHistory: false });
    // Expose a re-render hook so the theme toggle can repaint charts with
    // the active theme's colors (charts read CSS variables at render time).
    (window as typeof window & { __ftRenderAll?: () => void }).__ftRenderAll = renderAll;
  }

  async function hydrateState() {
    const localState = loadPersistedState();
    const serverState = await loadServerState();
    const preferredState = pickMostRecentState(localState, serverState) || clone(BASE_SEED);
    state = normalizeState(preferredState);
    persistState(state);
  }

  function pickMostRecentState(localState: unknown, serverState: unknown): unknown | null {
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
    const rawMeta = (candidate as { meta?: { savedAt?: string; generatedAt?: string } } | null)?.meta;
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
    dashboardBudgetGoalsSection.renderDashboard();
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
      .map((item: any) => `<option value="${escapeAttr(item.id)}">${escapeHtml(item.name)}</option>`)
      .join("");

    if (!state.accounts.length) {
      accountSelect.innerHTML = '<option value="">Sin cuentas</option>';
    }

    const currentBulkAccount = String(el.txBulkAccount.value || "");
    el.txBulkAccount.innerHTML = ['<option value="">Sin cambio</option>']
      .concat(
        state.accounts.map((item: any) => `<option value="${escapeAttr(item.id)}">${escapeHtml(item.name)}</option>`)
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
      .map((name: string) => `<option value="${escapeAttr(name)}">${escapeHtml(name)}</option>`)
      .join("");

    if (!categories.length) {
      categorySelect.innerHTML = '<option value="Sin categoría">Sin categoría</option>';
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
      .map((item: any) => `<option value="${escapeAttr(item.id)}">${escapeHtml(item.name)}</option>`)
      .join("");

    if (!state.accounts.length) {
      brokerSelect.innerHTML = '<option value="">Sin brokers</option>';
      return;
    }

    if (currentValue && state.accounts.some((item: any) => item.id === currentValue)) {
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
    el.investmentMovementSymbol.value = computed.normalizedSymbol;
  }

  function syncInvestmentMovementCategoryField() {
    const isBitvavo = isBitvavoBrokerAccount(el.investmentMovementBroker.value);
    const categorySelect = el.investmentMovementCategory;

    if (isBitvavo) {
      const hasCryptoOption = Array.from(categorySelect.options).some((option) => option.value === "Crypto");
      if (!hasCryptoOption) {
        categorySelect.insertAdjacentHTML(
          "afterbegin",
          '<option value="Crypto" data-temporary-bitvavo-option="true">Crypto</option>'
        );
      }
      categorySelect.value = "Crypto";
      categorySelect.disabled = true;
      categorySelect.setAttribute("aria-disabled", "true");
      return;
    }

    const wasDisabled = categorySelect.disabled;
    const temporaryCryptoOption = categorySelect.querySelector<HTMLOptionElement>(
      'option[data-temporary-bitvavo-option="true"]'
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
        (name: any) =>
          `<option value="${escapeAttr(name)}">${escapeHtml(decorateCategoryLabel(type, name))}</option>`
      )
      .join("");

    if (!categories.length) {
      categorySelect.innerHTML = '<option value="Sin categoría">Sin categoría</option>';
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
