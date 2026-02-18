import {
  MONTHS,
  ROUTE_SECTION_MAP,
  SECTION_ROUTE_MAP,
  isBudgetType,
  isCategoryKey,
  isEntityKey,
  isGoalField,
  isGoalKey,
  isSectionId,
  isSnapshotKind,
  isTransactionType,
  type BudgetType,
  type CategoryKey,
  type Contribution,
  type ContributionMetricRow,
  type EntityKey,
  type Goal,
  type GoalKey,
  type MonthTotals,
  type SectionId,
  type SnapshotKind,
  type SortDirection,
  type State,
  type TransactionType,
  type TxSortColumn,
} from "./types";
import {
  buildAccountFilterOptions,
  filterAndSortTransactions,
  type TransactionFilters,
} from "./transactions";
import {
  renderDonutChart,
  renderGroupedBarChart,
  renderHorizontalBarChart,
  renderLineChart,
} from "./charts";
import {
  clone,
  escapeAttr,
  escapeHtml,
  formatPercent,
  monthFromISO,
  parseFloatSafe,
  parseIntSafe,
  round2,
  slug,
  todayISO,
  uid,
} from "./utils";
import {
  BASE_SEED,
  loadPersistedState,
  normalizeState,
  persistState,
  sortContributionsInState,
  sortTransactionsInState,
} from "./state";

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
    txSelectedIds: string[];
    txFilters: TransactionFilters;
    txEditingId: string;
    snapshotMonth: number;
    investmentMonth: number;
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

  type ContributionForm = HTMLFormElement;

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

  let state: State = normalizeState(loadPersistedState() || clone(BASE_SEED));
  let toastTimer: number | undefined;

  const ui: UiState = {
    activeSection: "dashboard",
    month: Math.min(new Date().getMonth(), 11),
    budgetType: "income",
    budgetMonth: Math.min(new Date().getMonth(), 11),
    txFilterMonth: Math.min(new Date().getMonth(), 11),
    txSort: { column: "date", direction: "desc" },
    txSelectedIds: [],
    txFilters: {
      date: "",
      accountId: "",
      type: "",
      category: "",
      description: "",
      amountMin: "",
      amountMax: "",
    },
    txEditingId: "",
    snapshotMonth: Math.min(new Date().getMonth(), 11),
    investmentMonth: Math.min(new Date().getMonth(), 11),
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
    kpiAnnualSavings: getRequiredElement<HTMLElement>("kpi-annual-savings"),
    kpiGrowth: getRequiredElement<HTMLElement>("kpi-growth"),
    chartNetWorth: getRequiredElement<SVGSVGElement>("chart-networth"),
    chartCashflow: getRequiredElement<SVGSVGElement>("chart-cashflow"),
    chartDistribution: getRequiredElement<SVGSVGElement>("chart-distribution"),
    topExpenseList: getRequiredElement<HTMLElement>("top-expense-list"),

    txMonthFilter: getRequiredElement<HTMLSelectElement>("tx-month-filter"),
    txForm: getRequiredElement<TxForm>("tx-form"),
    txBody: getRequiredElement<HTMLElement>("tx-table-body"),
    txFilterDate: getRequiredElement<HTMLInputElement>("tx-filter-date"),
    txFilterAccount: getRequiredElement<HTMLSelectElement>("tx-filter-account"),
    txFilterType: getRequiredElement<HTMLSelectElement>("tx-filter-type"),
    txFilterCategory: getRequiredElement<HTMLInputElement>("tx-filter-category"),
    txFilterDescription: getRequiredElement<HTMLInputElement>("tx-filter-description"),
    txFilterAmountMin: getRequiredElement<HTMLInputElement>("tx-filter-amount-min"),
    txFilterAmountMax: getRequiredElement<HTMLInputElement>("tx-filter-amount-max"),
    txClearFilters: getRequiredElement<HTMLButtonElement>("tx-clear-filters"),
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

    budgetType: getRequiredElement<HTMLSelectElement>("budget-type"),
    budgetMonth: getRequiredElement<HTMLSelectElement>("budget-month"),
    budgetBody: getRequiredElement<HTMLElement>("budget-table-body"),
    budgetPlanned: getRequiredElement<HTMLElement>("budget-total-planned"),
    budgetActual: getRequiredElement<HTMLElement>("budget-total-actual"),
    budgetDiff: getRequiredElement<HTMLElement>("budget-total-diff"),

    snapshotMonth: getRequiredElement<HTMLSelectElement>("snapshot-month"),
    saveSnapshot: getRequiredElement<HTMLButtonElement>("save-snapshot"),
    snapshotAccounts: getRequiredElement<HTMLElement>("snapshot-accounts"),
    snapshotInvestments: getRequiredElement<HTMLElement>("snapshot-investments"),
    snapshotLiabilities: getRequiredElement<HTMLElement>("snapshot-liabilities"),
    wealthTimelineBody: getRequiredElement<HTMLElement>("wealth-timeline-body"),
    chartWealth: getRequiredElement<SVGSVGElement>("chart-wealth"),

    investmentMonth: getRequiredElement<HTMLSelectElement>("investment-month"),
    invTotalValue: getRequiredElement<HTMLElement>("inv-total-value"),
    invCapital: getRequiredElement<HTMLElement>("inv-capital"),
    invReturn: getRequiredElement<HTMLElement>("inv-return"),
    investmentAllocation: getRequiredElement<SVGSVGElement>("investment-allocation"),
    contributionForm: getRequiredElement<ContributionForm>("contribution-form"),
    contributionBody: getRequiredElement<HTMLElement>("contribution-body"),

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
  } as const;

  init();

  function init() {
    ui.activeSection = getSectionFromPath(window.location.pathname);
    populateMonthSelects();
    bindEvents();
    renderAll();
    switchSection(ui.activeSection, { updateHistory: false });
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
  }

  function bindNavigationEvents() {
    el.navTabs.addEventListener("click", (event) => {
      const target = getEventElement(event.target);
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
      state.year = parseIntSafe(el.yearDisplay.value, state.year);
      el.settingsYear.value = String(state.year);
      saveState();
      renderAll();
    });

    el.dashboardMonth.addEventListener("change", () => {
      ui.month = parseIntSafe(el.dashboardMonth.value, ui.month);
      renderDashboard();
    });
  }

  function bindTransactionEvents() {
    el.txMonthFilter.addEventListener("change", () => {
      ui.txFilterMonth = parseIntSafe(el.txMonthFilter.value, ui.txFilterMonth);
      ui.txSelectedIds = [];
      ui.txEditingId = "";
      renderTransactions();
    });

    el.txOpenModal.addEventListener("click", openTransactionModal);
    el.txCloseModal.addEventListener("click", closeTransactionModal);
    el.txDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeTransactionModal();
    });

    [el.txFilterDate, el.txFilterAccount, el.txFilterType, el.txFilterCategory, el.txFilterDescription, el.txFilterAmountMin, el.txFilterAmountMax]
      .forEach((input) => {
        input.addEventListener("input", syncTransactionFiltersFromUI);
        input.addEventListener("change", syncTransactionFiltersFromUI);
      });

    el.txClearFilters.addEventListener("click", () => {
      ui.txFilters = {
        date: "",
        accountId: "",
        type: "",
        category: "",
        description: "",
        amountMin: "",
        amountMax: "",
      };
      ui.txEditingId = "";
      ui.txSelectedIds = [];
      syncTransactionFilterUI();
      renderTransactions();
    });

    document.querySelectorAll<HTMLButtonElement>(".tx-sort-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const column = button.dataset.column;
        if (!column) {
          return;
        }
        if (ui.txSort.column === column) {
          ui.txSort.direction = ui.txSort.direction === "asc" ? "desc" : "asc";
        } else {
          ui.txSort.column = column as TxSortColumn;
          ui.txSort.direction = column === "date" || column === "amount" ? "desc" : "asc";
        }
        renderTransactions();
      });
    });

    el.txForm.elements.type.addEventListener("change", populateTransactionCategoryOptions);
    el.txForm.elements.date.addEventListener("change", () => {
      const month = monthFromISO(el.txForm.elements.date.value);
      if (month !== null) {
        el.txForm.elements.month.value = String(month);
      }
    });

    el.txForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(el.txForm);
      const amount = parseFloatSafe(form.get("amount"), 0);
      const month = parseIntSafe(form.get("month"), 0);
      const rawType = String(form.get("type") || "expense");
      const txType: TransactionType = isTransactionType(rawType) ? rawType : "expense";
      const submitter = (event as SubmitEvent).submitter;
      const keepOpen = submitter === el.txSubmitMore;

      if (amount <= 0) {
        showToast("El importe debe ser mayor que 0.");
        return;
      }

      state.transactions.push({
        id: uid("tx"),
        date: String(form.get("date") || todayISO()),
        month,
        type: txType,
        accountId: String(form.get("accountId") || ""),
        category: String(form.get("category") || "Sin categoría"),
        description: String(form.get("description") || "").trim(),
        amount: round2(amount),
      });

      sortTransactions();
      saveState();
      const persistedValues = {
        month: String(form.get("month") || ui.txFilterMonth),
        type: String(form.get("type") || "income"),
        accountId: String(form.get("accountId") || ""),
        category: String(form.get("category") || ""),
      };

      el.txForm.reset();
      el.txForm.elements.month.value = persistedValues.month;
      el.txForm.elements.type.value = persistedValues.type;
      populateTransactionFormOptions();
      el.txForm.elements.accountId.value = persistedValues.accountId;
      if (persistedValues.category) {
        el.txForm.elements.category.value = persistedValues.category;
      }
      el.txForm.elements.date.value = todayISO();
      el.txForm.elements.amount.value = "";
      el.txForm.elements.description.value = "";

      if (!keepOpen) {
        closeTransactionModal();
      }

      renderAll();
      showToast(keepOpen ? "Guardado. Puedes añadir otro." : "Movimiento guardado.");
    });

    el.txBody.addEventListener("click", (event) => {
      const target = getEventElement(event.target);
      const actionButton = target?.closest<HTMLButtonElement>("button[data-action]");
      if (actionButton) {
        const action = actionButton.dataset.action;
        const id = actionButton.dataset.id;
        if (!id) {
          return;
        }

        if (action === "edit-tx") {
          ui.txEditingId = id;
          ui.txSelectedIds = [];
          renderTransactions();
          return;
        }
        if (action === "cancel-edit-tx") {
          ui.txEditingId = "";
          renderTransactions();
          return;
        }
        if (action === "save-edit-tx") {
          saveEditedTransactionRow(id);
          return;
        }
      }

      const deleteButton = target?.closest<HTMLButtonElement>("button[data-delete-id]");
      if (!deleteButton) {
        return;
      }
      const id = deleteButton.dataset.deleteId;
      state.transactions = state.transactions.filter((item: any) => item.id !== id);
      ui.txSelectedIds = ui.txSelectedIds.filter((itemId: any) => itemId !== id);
      saveState();
      renderAll();
      showToast("Movimiento eliminado.");
    });

    el.txBody.addEventListener("change", (event) => {
      const target = getEventElement(event.target);
      const input = target?.closest<HTMLInputElement>('input[data-select-tx-id]');
      if (!input) {
        return;
      }
      const id = String(input.dataset.selectTxId || "");
      if (!id) {
        return;
      }
      const selected = new Set(ui.txSelectedIds);
      if (input.checked) {
        selected.add(id);
      } else {
        selected.delete(id);
      }
      ui.txSelectedIds = Array.from(selected);
      renderTransactions();
    });

    el.txSelectAll.addEventListener("change", () => {
      const visibleIds = getFilteredAndSortedTransactions().map((item: any) => item.id);
      if (!visibleIds.length) {
        ui.txSelectedIds = [];
        renderTransactions();
        return;
      }
      ui.txSelectedIds = el.txSelectAll.checked ? visibleIds : [];
      renderTransactions();
    });

    el.txBulkApply.addEventListener("click", applyBulkTransactionChanges);
    el.txBulkDelete.addEventListener("click", deleteSelectedTransactions);
  }

  function bindBudgetEvents() {
    el.budgetType.addEventListener("change", () => {
      ui.budgetType = isBudgetType(el.budgetType.value) ? el.budgetType.value : "income";
      renderBudget();
    });

    el.budgetMonth.addEventListener("change", () => {
      ui.budgetMonth = parseIntSafe(el.budgetMonth.value, ui.budgetMonth);
      renderBudget();
    });

    el.budgetBody.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || !target.dataset.category) {
        return;
      }
      const category = target.dataset.category;
      const type = ui.budgetType;
      ensureBudgetCategory(type, category);
      state.budget[type][category][ui.budgetMonth] = round2(parseFloatSafe(target.value, 0));
      saveState();
      renderBudget();
    });
  }

  function bindWealthEvents() {
    el.snapshotMonth.addEventListener("change", () => {
      ui.snapshotMonth = parseIntSafe(el.snapshotMonth.value, ui.snapshotMonth);
      renderWealth();
    });
    el.saveSnapshot.addEventListener("click", saveSnapshotFromTable);
  }

  function bindInvestmentEvents() {
    el.investmentMonth.addEventListener("change", () => {
      ui.investmentMonth = parseIntSafe(el.investmentMonth.value, ui.investmentMonth);
      renderInvestment();
      renderGoals();
    });

    el.contributionForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(el.contributionForm);
      const date = String(form.get("date") || "");
      const amount = round2(parseFloatSafe(form.get("amount"), 0));
      const portfolioValue = round2(parseFloatSafe(form.get("portfolioValue"), 0));
      const flow = round2(parseFloatSafe(form.get("flow"), amount));

      if (!date || portfolioValue <= 0) {
        showToast("Completa fecha y valor de cartera.");
        return;
      }

      state.contributions.push({
        id: uid("contrib"),
        date,
        amount,
        portfolioDate: date,
        portfolioValue,
        flow,
      });

      sortContributions();
      saveState();
      el.contributionForm.reset();
      renderAll();
      showToast("Aporte agregado.");
    });

    el.contributionBody.addEventListener("click", (event) => {
      const target = getEventElement(event.target);
      const button = target?.closest<HTMLButtonElement>("button[data-delete-contrib]");
      if (!button) {
        return;
      }
      const id = button.dataset.deleteContrib;
      state.contributions = state.contributions.filter((item: any) => item.id !== id);
      saveState();
      renderAll();
      showToast("Aporte eliminado.");
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

        let value: string | number = input.value;
        if (field === "targetYear") {
          value = parseIntSafe(value, state.year);
        }
        if (field === "targetAmount") {
          value = round2(parseFloatSafe(value, 0));
        }

        state.goals[key][field] = value as never;
        saveState();
        renderGoals();
      });
    });
  }

  function bindSettingsEvents() {
    el.saveSettingsMain.addEventListener("click", () => {
      state.year = parseIntSafe(el.settingsYear.value, state.year);
      state.currency = String(el.settingsCurrency.value || state.currency || "EUR").toUpperCase().slice(0, 3);
      el.yearDisplay.value = String(state.year);
      saveState();
      renderAll();
      showToast("Configuración general guardada.");
    });

    el.addAccountForm.addEventListener("submit", (event) => {
      event.preventDefault();
      addEntityFromForm(event.currentTarget as HTMLFormElement, "accounts");
    });
    el.addInvestmentForm.addEventListener("submit", (event) => {
      event.preventDefault();
      addEntityFromForm(event.currentTarget as HTMLFormElement, "investmentAssets");
      syncInvestmentCategoriesWithAssets();
    });
    el.addLiabilityForm.addEventListener("submit", (event) => {
      event.preventDefault();
      addEntityFromForm(event.currentTarget as HTMLFormElement, "liabilities");
    });

    bindCategoryAddForm(el.addIncomeCategory, "incomeCategories");
    bindCategoryAddForm(el.addExpenseCategory, "expenseCategories");
    bindCategoryAddForm(el.addInvestmentCategory, "investmentCategories");

    [el.settingsAccounts, el.settingsInvestments, el.settingsLiabilities].forEach((container) => {
      container.addEventListener("change", onEntityEditorInput);
      container.addEventListener("click", onEntityEditorDelete);
    });
    [el.incomeTags, el.expenseTags, el.investmentTags].forEach((container) => {
      container.addEventListener("click", onCategoryDelete);
    });
  }

  function bindDataEvents() {
    el.exportJson.addEventListener("click", exportStateAsJson);
    el.importJson.addEventListener("change", importStateFromJson);
    el.exportTransactionsCsv.addEventListener("click", exportTransactionsCsv);

    el.resetSeed.addEventListener("click", () => {
      const confirmed = window.confirm("Se reiniciará todo y se cargará el seed original. ¿Continuar?");
      if (!confirmed) {
        return;
      }
      state = normalizeState(clone(BASE_SEED));
      saveState();
      renderAll();
      showToast("Tracker reiniciado con datos semilla.");
    });
  }

  function renderAll() {
    populateMonthSelects();
    populateTransactionFormOptions();
    renderDashboard();
    renderTransactions();
    renderBudget();
    renderWealth();
    renderInvestment();
    renderGoals();
    renderSettings();
    renderDataTab();
  }

  function switchSection(sectionId: SectionId | string, options: { updateHistory?: boolean } = {}) {
    const { updateHistory = true } = options;
    const normalizedSectionId = normalizeSectionId(sectionId);
    ui.activeSection = normalizedSectionId;
    el.panels.forEach((panel: any) => {
      const isActive = panel.id === normalizedSectionId;
      panel.classList.toggle("is-active", isActive);
      panel.setAttribute("aria-hidden", String(!isActive));
    });

    Array.from(el.navTabs.querySelectorAll(".nav-btn")).forEach((button: any) => {
      const isActive = button.dataset.section === normalizedSectionId;
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

  function normalizeSectionId(sectionId: unknown): SectionId {
    if (typeof sectionId === "string" && isSectionId(sectionId)) {
      return sectionId;
    }
    return "dashboard";
  }

  function getPathFromSection(sectionId: SectionId | string) {
    return SECTION_ROUTE_MAP[normalizeSectionId(sectionId)] || "/dashboard";
  }

  function getSectionFromPath(pathname: string) {
    const normalizedPath = normalizePath(pathname);
    if (normalizedPath === "/") {
      return "dashboard";
    }
    return ROUTE_SECTION_MAP[normalizedPath] || "dashboard";
  }

  function normalizePath(pathname: unknown) {
    if (typeof pathname !== "string" || pathname.length === 0) {
      return "/";
    }
    const trimmed = pathname.replace(/\/+$/, "");
    return trimmed || "/";
  }

  function populateMonthSelects() {
    const monthSelects = [
      el.dashboardMonth,
      el.txMonthFilter,
      el.txForm.elements.month,
      el.budgetMonth,
      el.snapshotMonth,
      el.investmentMonth,
    ];

    monthSelects.forEach((select: any) => {
      if (!select) {
        return;
      }

      const current = String(select.value || "");
      select.innerHTML = MONTHS.map((name: any, index: any) => `<option value="${index}">${name}</option>`).join("");
      if (current && Number.isFinite(Number(current))) {
        select.value = current;
      }
    });

    el.yearDisplay.value = String(state.year);

    if (!MONTHS[ui.month]) {
      ui.month = 0;
    }
    if (!MONTHS[ui.txFilterMonth]) {
      ui.txFilterMonth = ui.month;
    }
    if (!MONTHS[ui.budgetMonth]) {
      ui.budgetMonth = ui.month;
    }
    if (!MONTHS[ui.snapshotMonth]) {
      ui.snapshotMonth = ui.month;
    }
    if (!MONTHS[ui.investmentMonth]) {
      ui.investmentMonth = ui.month;
    }

    el.dashboardMonth.value = String(ui.month);
    el.txMonthFilter.value = String(ui.txFilterMonth);
    el.txForm.elements.month.value = String(ui.txFilterMonth);
    if (!el.txForm.elements.date.value) {
      el.txForm.elements.date.value = todayISO();
    }
    el.budgetType.value = ui.budgetType;
    el.budgetMonth.value = String(ui.budgetMonth);
    el.snapshotMonth.value = String(ui.snapshotMonth);
    el.investmentMonth.value = String(ui.investmentMonth);
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
  }

  function populateTransactionCategoryOptions() {
    const rawType = String(el.txForm.elements.type.value || "income");
    const type: BudgetType = isBudgetType(rawType) ? rawType : "income";
    const categories = getCategoriesForType(type);
    const categorySelect = el.txForm.elements.category;

    categorySelect.innerHTML = categories
      .map((name: any) => `<option value="${escapeAttr(name)}">${escapeHtml(name)}</option>`)
      .join("");

    if (!categories.length) {
      categorySelect.innerHTML = '<option value="Sin categoría">Sin categoría</option>';
    }
  }

  function renderDashboard() {
    const month = ui.month;
    const monthTotals = getMonthTotals(month);
    const yearTotals = getYearTotals();
    const wealthSeries = getWealthSeries();
    const currentWealth = wealthSeries[month] || { liquidity: 0, investment: 0, liabilities: 0, net: 0 };
    const firstNet = wealthSeries[0] ? wealthSeries[0].net : 0;
    const growth = firstNet === 0 ? 0 : ((currentWealth.net - firstNet) / Math.abs(firstNet)) * 100;

    el.kpiIncome.textContent = formatMoney(monthTotals.income);
    el.kpiExpense.textContent = formatMoney(monthTotals.expense);
    el.kpiInvestment.textContent = formatMoney(monthTotals.investment);
    el.kpiNetWorth.textContent = formatMoney(currentWealth.net);
    el.kpiAnnualSavings.textContent = formatMoney(yearTotals.income - yearTotals.expense - yearTotals.investment);
    el.kpiGrowth.textContent = formatPercent(growth);

    renderLineChart(
      el.chartNetWorth,
      wealthSeries.map((item: any) => item.net),
      {
        color: "#0d8476",
        fill: "rgba(13, 132, 118, 0.12)",
        labels: MONTHS,
        formatValue: formatMoney,
      }
    );

    const cashflowSeries = getMonthlyCashflowSeries();
    renderGroupedBarChart(el.chartCashflow, MONTHS, [
      { name: "Ingresos", color: "#059669", values: cashflowSeries.income },
      { name: "Gastos", color: "#ef4444", values: cashflowSeries.expense },
      { name: "Inversión", color: "#2563eb", values: cashflowSeries.investment },
    ]);

    renderDonutChart(
      el.chartDistribution,
      [
        { label: "Liquidez", color: "#0d8476", value: currentWealth.liquidity },
        { label: "Inversión", color: "#2563eb", value: currentWealth.investment },
        { label: "Deuda", color: "#ef4444", value: currentWealth.liabilities },
      ],
      formatMoney
    );

    const topExpenses = Object.entries(getCategoryActuals("expense", month))
      .sort((a: any, b: any) => b[1] - a[1])
      .slice(0, 8);

    if (!topExpenses.length) {
      el.topExpenseList.innerHTML = "<p class='list-item'><small>Sin gastos en este mes.</small></p>";
    } else {
      el.topExpenseList.innerHTML = topExpenses
        .map(
          ([category, amount]) =>
            `<div class='list-item'><span>${escapeHtml(category)}</span><strong>${formatMoney(amount)}</strong></div>`
        )
        .join("");
    }
  }

  function renderTransactions() {
    syncTransactionFilterUI();
    syncTransactionFilterOptions();
    renderTransactionSortState();

    const tx = getFilteredAndSortedTransactions();
    const visibleIdSet = new Set(tx.map((item: any) => item.id));
    ui.txSelectedIds = ui.txSelectedIds.filter((id: any) => visibleIdSet.has(id));
    renderTransactionSelectionState(tx);
    if (!tx.length) {
      el.txBody.innerHTML = "<tr><td colspan='8'>Sin movimientos para este mes.</td></tr>";
      return;
    }

    el.txBody.innerHTML = tx
      .map((item: any) => {
        if (ui.txEditingId === item.id) {
          return renderEditingTransactionRow(item);
        }

        const typeLabel = item.type === "income" ? "Ingreso" : item.type === "expense" ? "Gasto" : "Inversión";
        const typeClass = item.type === "income" ? "badge-income" : item.type === "expense" ? "badge-expense" : "badge-investment";
        const account = getAccountName(item.accountId);

        return `
          <tr class="${ui.txSelectedIds.includes(item.id) ? "row-selected" : ""}">
            <td>
              <input type="checkbox" data-select-tx-id="${escapeAttr(item.id)}" ${ui.txSelectedIds.includes(item.id) ? "checked" : ""} aria-label="Seleccionar movimiento del ${escapeAttr(String(item.date))}" />
            </td>
            <td>${escapeHtml(String(item.date))}</td>
            <td>${escapeHtml(account)}</td>
            <td><span class="badge ${typeClass}">${typeLabel}</span></td>
            <td>${escapeHtml(item.category || "-")}</td>
            <td>${escapeHtml(item.description || "-")}</td>
            <td>${formatMoney(item.amount)}</td>
            <td>
              <div class="inline-actions">
                <button class="edit-btn" data-action="edit-tx" data-id="${escapeAttr(item.id)}" aria-label="Editar movimiento del ${escapeAttr(String(item.date))}">Editar</button>
                <button class="delete-btn" data-delete-id="${escapeAttr(item.id)}" aria-label="Eliminar movimiento del ${escapeAttr(String(item.date))}">Eliminar</button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function renderTransactionSelectionState(tx: any) {
    const selectedVisible = tx.filter((item: any) => ui.txSelectedIds.includes(item.id)).length;
    const allVisibleSelected = tx.length > 0 && selectedVisible === tx.length;

    el.txSelectAll.checked = allVisibleSelected;
    el.txSelectedCount.textContent = `${selectedVisible} seleccionadas`;
    el.txBulkApply.disabled = selectedVisible === 0;
    el.txBulkDelete.disabled = selectedVisible === 0;
  }

  function syncTransactionFilterUI() {
    el.txFilterDate.value = ui.txFilters.date;
    el.txFilterAccount.value = ui.txFilters.accountId;
    el.txFilterType.value = ui.txFilters.type;
    el.txFilterCategory.value = ui.txFilters.category;
    el.txFilterDescription.value = ui.txFilters.description;
    el.txFilterAmountMin.value = ui.txFilters.amountMin;
    el.txFilterAmountMax.value = ui.txFilters.amountMax;
  }

  function syncTransactionFiltersFromUI() {
    ui.txFilters = {
      date: String(el.txFilterDate.value || "").trim(),
      accountId: String(el.txFilterAccount.value || "").trim(),
      type: String(el.txFilterType.value || "").trim(),
      category: String(el.txFilterCategory.value || "").trim(),
      description: String(el.txFilterDescription.value || "").trim(),
      amountMin: String(el.txFilterAmountMin.value || "").trim(),
      amountMax: String(el.txFilterAmountMax.value || "").trim(),
    };
    ui.txEditingId = "";
    ui.txSelectedIds = [];
    renderTransactions();
  }

  function syncTransactionFilterOptions() {
    const allAccounts = buildAccountFilterOptions({
      transactions: state.transactions,
      month: ui.txFilterMonth,
      getAccountName,
    });
    const current = ui.txFilters.accountId;
    const options = ['<option value="">Todas</option>'].concat(
      allAccounts
        .map((item) => `<option value="${escapeAttr(item.value)}">${escapeHtml(item.label)}</option>`)
    );
    el.txFilterAccount.innerHTML = options.join("");
    if (current) {
      el.txFilterAccount.value = current;
    }
  }

  function renderTransactionSortState() {
    document.querySelectorAll(".tx-sort-btn").forEach((button: any) => {
      const column = button.dataset.column;
      const isActive = column === ui.txSort.column;
      button.classList.toggle("active", isActive);
      if (!isActive) {
        button.textContent = "↕";
      } else {
        button.textContent = ui.txSort.direction === "asc" ? "↑" : "↓";
      }
    });
  }

  function getFilteredAndSortedTransactions() {
    return filterAndSortTransactions({
      transactions: state.transactions,
      month: ui.txFilterMonth,
      filters: ui.txFilters,
      sort: ui.txSort,
      getAccountName,
    });
  }

  function renderEditingTransactionRow(item: any) {
    const accountsOptions = state.accounts
      .map((entry: any) => {
        const selected = entry.id === item.accountId ? "selected" : "";
        return `<option value="${escapeAttr(entry.id)}" ${selected}>${escapeHtml(entry.name)}</option>`;
      })
      .join("");

    const typeOptions = ["income", "expense", "investment"]
      .map((typeValue: any) => {
        const label = typeValue === "income" ? "Ingreso" : typeValue === "expense" ? "Gasto" : "Inversión";
        const selected = typeValue === item.type ? "selected" : "";
        return `<option value="${typeValue}" ${selected}>${label}</option>`;
      })
      .join("");

    return `
      <tr data-editing-id="${escapeAttr(item.id)}">
        <td></td>
        <td><input type="date" data-edit-field="date" value="${escapeAttr(String(item.date))}" /></td>
        <td><select data-edit-field="accountId">${accountsOptions}</select></td>
        <td><select data-edit-field="type">${typeOptions}</select></td>
        <td><input type="text" data-edit-field="category" value="${escapeAttr(item.category || "")}" /></td>
        <td><input type="text" data-edit-field="description" value="${escapeAttr(item.description || "")}" /></td>
        <td><input type="number" step="0.01" min="0" data-edit-field="amount" value="${Number(item.amount || 0)}" /></td>
        <td>
          <div class="inline-actions">
            <button type="button" class="primary-btn" data-action="save-edit-tx" data-id="${escapeAttr(item.id)}">Guardar</button>
            <button type="button" class="secondary-btn" data-action="cancel-edit-tx" data-id="${escapeAttr(item.id)}">Cancelar</button>
          </div>
        </td>
      </tr>
    `;
  }

  function saveEditedTransactionRow(id: any) {
    const row = el.txBody.querySelector(`tr[data-editing-id="${id}"]`);
    if (!row) {
      return;
    }

    const tx = state.transactions.find((item: any) => item.id === id);
    if (!tx) {
      return;
    }

    const dateInput = row.querySelector<HTMLInputElement>('[data-edit-field="date"]');
    const accountInput = row.querySelector<HTMLSelectElement>('[data-edit-field="accountId"]');
    const typeInput = row.querySelector<HTMLSelectElement>('[data-edit-field="type"]');
    const categoryInput = row.querySelector<HTMLInputElement>('[data-edit-field="category"]');
    const descriptionInput = row.querySelector<HTMLInputElement>('[data-edit-field="description"]');
    const amountInput = row.querySelector<HTMLInputElement>('[data-edit-field="amount"]');
    if (!dateInput || !accountInput || !typeInput || !categoryInput || !descriptionInput || !amountInput) {
      return;
    }

    const date = String(dateInput.value || "").trim();
    const accountId = String(accountInput.value || "").trim();
    const type = String(typeInput.value || "").trim();
    const category = String(categoryInput.value || "").trim();
    const description = String(descriptionInput.value || "").trim();
    const amount = parseFloatSafe(amountInput.value, 0);

    if (!date || !accountId || !type || !category || amount <= 0 || !isTransactionType(type)) {
      showToast("Completa fecha, cuenta, tipo, categoría e importe válido.");
      return;
    }

    tx.date = date;
    tx.month = monthFromISO(date) ?? tx.month;
    tx.accountId = accountId;
    tx.type = type;
    tx.category = category;
    tx.description = description;
    tx.amount = round2(amount);

    ui.txEditingId = "";
    sortTransactions();
    saveState();
    renderAll();
    showToast("Movimiento actualizado.");
  }

  function openTransactionModal() {
    ui.txEditingId = "";
    el.txForm.elements.month.value = String(ui.txFilterMonth);
    if (!el.txForm.elements.date.value) {
      el.txForm.elements.date.value = todayISO();
    }
    populateTransactionFormOptions();
    if (typeof el.txDialog.showModal === "function") {
      el.txDialog.showModal();
    }
  }

  function closeTransactionModal() {
    if (typeof el.txDialog.close === "function" && el.txDialog.open) {
      el.txDialog.close();
    }
  }

  function getSelectedTransactions() {
    const selectedSet = new Set(ui.txSelectedIds);
    return state.transactions.filter((item: any) => selectedSet.has(item.id));
  }

  function applyBulkTransactionChanges() {
    const selected = getSelectedTransactions();
    if (!selected.length) {
      showToast("Selecciona al menos una fila.");
      return;
    }

    const newType = String(el.txBulkType.value || "").trim();
    const newAccountId = String(el.txBulkAccount.value || "").trim();
    const newCategory = String(el.txBulkCategory.value || "").trim();

    if (!newType && !newAccountId && !newCategory) {
      showToast("Define al menos un cambio de lote.");
      return;
    }

    if (newType && !isTransactionType(newType)) {
      showToast("Tipo de movimiento no válido.");
      return;
    }

    selected.forEach((item: any) => {
      if (newType && isTransactionType(newType)) {
        item.type = newType;
      }
      if (newAccountId) {
        item.accountId = newAccountId;
      }
      if (newCategory) {
        item.category = newCategory;
      }
    });

    sortTransactions();
    saveState();
    renderAll();
    showToast(`Actualizadas ${selected.length} filas.`);
  }

  function deleteSelectedTransactions() {
    const selected = getSelectedTransactions();
    if (!selected.length) {
      showToast("Selecciona al menos una fila.");
      return;
    }

    const selectedSet = new Set(ui.txSelectedIds);
    state.transactions = state.transactions.filter((item: any) => !selectedSet.has(item.id));
    ui.txSelectedIds = [];
    saveState();
    renderAll();
    showToast(`Eliminadas ${selected.length} filas.`);
  }

  function renderBudget() {
    const month = ui.budgetMonth;
    const type = ui.budgetType;
    const categories = getCategoriesForType(type);
    const actuals = getCategoryActuals(type, month);

    let totalPlanned = 0;
    let totalActual = 0;

    if (!categories.length) {
      el.budgetBody.innerHTML = "<tr><td colspan='4'>No hay categorías para este bloque.</td></tr>";
      el.budgetPlanned.textContent = formatMoney(0);
      el.budgetActual.textContent = formatMoney(0);
      el.budgetDiff.textContent = formatMoney(0);
      return;
    }

    el.budgetBody.innerHTML = categories
      .map((category: any) => {
        const planned = getBudgetValue(type, category, month);
        const actual = round2(actuals[category] || 0);
        const diff = round2(actual - planned);

        totalPlanned += planned;
        totalActual += actual;

        const diffClass =
          type === "income"
            ? diff >= 0
              ? "text-good"
              : "text-bad"
            : diff > 0
              ? "text-bad"
              : "text-good";

        return `
          <tr>
            <td>${escapeHtml(category)}</td>
            <td><input type="number" step="0.01" min="0" data-category="${escapeAttr(category)}" value="${planned}" aria-label="Presupuesto para ${escapeAttr(category)}" /></td>
            <td>${formatMoney(actual)}</td>
            <td class="${diffClass}">${formatMoney(diff)}</td>
          </tr>
        `;
      })
      .join("");

    const totalDiff = round2(totalActual - totalPlanned);
    const totalDiffClass =
      type === "income"
        ? totalDiff >= 0
          ? "text-good"
          : "text-bad"
        : totalDiff > 0
          ? "text-bad"
          : "text-good";
    el.budgetPlanned.textContent = formatMoney(totalPlanned);
    el.budgetActual.textContent = formatMoney(totalActual);
    el.budgetDiff.textContent = formatMoney(totalDiff);
    el.budgetDiff.className = totalDiffClass;
  }

  function renderWealth() {
    const month = ui.snapshotMonth;

    el.snapshotAccounts.innerHTML = renderSnapshotRows(
      state.accounts,
      "accounts",
      month,
      (itemId: any) => computeAccountBalance(itemId, month)
    );

    el.snapshotInvestments.innerHTML = renderSnapshotRows(
      state.investmentAssets,
      "investments",
      month,
      (itemId: any) => computeInvestmentValue(itemId, month)
    );

    el.snapshotLiabilities.innerHTML = renderSnapshotRows(
      state.liabilities,
      "liabilities",
      month,
      (itemId: any) => computeLiabilityValue(itemId, month)
    );

    const wealthSeries = getWealthSeries();
    renderLineChart(
      el.chartWealth,
      wealthSeries.map((entry: any) => entry.net),
      {
        color: "#1f6feb",
        fill: "rgba(37, 99, 235, 0.13)",
        labels: MONTHS,
        formatValue: formatMoney,
      }
    );

    el.wealthTimelineBody.innerHTML = wealthSeries
      .map(
        (entry: any, monthIndex: any) => `
          <tr>
            <td>${MONTHS[monthIndex]}</td>
            <td>${formatMoney(entry.liquidity)}</td>
            <td>${formatMoney(entry.investment)}</td>
            <td>${formatMoney(entry.liabilities)}</td>
            <td><strong>${formatMoney(entry.net)}</strong></td>
          </tr>
        `
      )
      .join("");
  }

  function renderSnapshotRows(items: any, kind: any, month: any, computeFn: any) {
    if (!items.length) {
      return "<tr><td colspan='4'>No hay elementos configurados.</td></tr>";
    }

    return items
      .map((item: any) => {
        const opening = round2(item.openingBalance || 0);
        const calculated = round2(computeFn(item.id));
        const currentSnapshot = getSnapshotValue(kind, month, item.id);

        return `
          <tr>
            <td>${escapeHtml(item.name)}</td>
            <td>${formatMoney(opening)}</td>
            <td>${formatMoney(calculated)}</td>
            <td>
              <input
                type="number"
                step="0.01"
                data-snapshot-kind="${escapeAttr(kind)}"
                data-snapshot-id="${escapeAttr(item.id)}"
                value="${currentSnapshot ?? ""}"
                placeholder="Auto"
                aria-label="Snapshot de ${escapeAttr(item.name)}"
              />
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function saveSnapshotFromTable() {
    const month = ui.snapshotMonth;
    const rows = document.querySelectorAll("[data-snapshot-kind]");

    if (!state.snapshots[String(month)]) {
      state.snapshots[String(month)] = {
        month,
        accounts: {},
        investments: {},
        liabilities: {},
      };
    }

    const snapshot = state.snapshots[String(month)];

    rows.forEach((input: any) => {
      const kind = input.dataset.snapshotKind;
      const itemId = input.dataset.snapshotId;
      const numeric = parseFloatSafe(input.value, NaN);

      if (!kind || !itemId || !isSnapshotKind(kind)) {
        return;
      }

      if (Number.isNaN(numeric)) {
        delete snapshot[kind][itemId];
      } else {
        snapshot[kind][itemId] = round2(numeric);
      }
    });

    saveState();
    renderAll();
    showToast("Snapshot guardado.");
  }

  function renderInvestment() {
    const month = ui.investmentMonth;
    const wealth = getWealthByMonth(month);
    const investedCapital = computeInvestedCapital(month);
    const estimatedReturn = investedCapital <= 0 ? 0 : ((wealth.investment - investedCapital) / investedCapital) * 100;

    el.invTotalValue.textContent = formatMoney(wealth.investment);
    el.invCapital.textContent = formatMoney(investedCapital);
    el.invReturn.textContent = formatPercent(estimatedReturn);
    el.invReturn.className = estimatedReturn >= 0 ? "text-good" : "text-bad";

    const allocation = state.investmentAssets.map((asset: any) => ({
      label: asset.name,
      value: computeInvestmentValue(asset.id, month),
    }));

    renderHorizontalBarChart(
      el.investmentAllocation,
      allocation,
      ["#0d8476", "#2563eb", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6", "#84cc16", "#ec4899", "#64748b"],
      formatMoney
    );

    renderContributionsTable();
  }

  function renderContributionsTable() {
    const rows = computeContributionMetrics(state.contributions);

    if (!rows.length) {
      el.contributionBody.innerHTML = "<tr><td colspan='7'>Sin aportes registrados.</td></tr>";
      return;
    }

    el.contributionBody.innerHTML = rows
      .map(
        (row: any) => `
          <tr>
            <td>${escapeHtml(row.date)}</td>
            <td>${formatMoney(row.amount)}</td>
            <td>${formatMoney(row.portfolioValue)}</td>
            <td>${formatMoney(row.flow)}</td>
            <td>${row.nav.toFixed(2)}</td>
            <td class="${row.cumulativeReturn >= 0 ? "text-good" : "text-bad"}">${formatPercent(row.cumulativeReturn * 100)}</td>
            <td><button class="delete-btn" data-delete-contrib="${escapeAttr(row.id)}" aria-label="Eliminar aporte del ${escapeAttr(row.date)}">Eliminar</button></td>
          </tr>
        `
      )
      .join("");
  }

  function renderGoals() {
    const month = ui.investmentMonth;
    const wealth = getWealthByMonth(month);
    const fundsValue = state.investmentAssets
      .filter((asset: any) => /fond|index/i.test(asset.name))
      .reduce((sum: any, asset: any) => sum + computeInvestmentValue(asset.id, month), 0);
    const cryptoValue = state.investmentAssets
      .filter((asset: any) => /crypto|btc|eth/i.test(asset.name))
      .reduce((sum: any, asset: any) => sum + computeInvestmentValue(asset.id, month), 0);

    const currentMap = {
      short: wealth.net,
      medium: wealth.net,
      long: wealth.net,
      investmentTotal: wealth.investment,
      investmentFunds: fundsValue,
      investmentCrypto: cryptoValue,
    };

    document.querySelectorAll("[data-goal][data-field]").forEach((input: any) => {
      const key = String(input.dataset.goal || "");
      const field = String(input.dataset.field || "");
      if (!isGoalKey(key) || !isGoalField(field)) {
        return;
      }
      const goal = state.goals[key];
      input.value = String(goal[field] ?? "");
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
            <div class="list-item"><span>Actual</span><strong>${formatMoney(current)}</strong></div>
            <div class="list-item"><span>Objetivo</span><strong>${formatMoney(target)}</strong></div>
            <div class="list-item"><span>Progreso</span><strong>${progress.toFixed(2)}%</strong></div>
            <div class="list-item"><span>Faltan</span><strong class="${remaining <= 0 ? "text-good" : "text-bad"}">${formatMoney(remaining)}</strong></div>
            <div class="list-item"><span>Necesitas/mes</span><strong>${formatMoney(monthlyNeeded)}</strong></div>
          </article>
        `;
      })
      .join("");
  }

  function renderSettings() {
    el.settingsYear.value = String(state.year);
    el.settingsCurrency.value = String(state.currency || "EUR");

    renderEntityEditor("accounts", el.settingsAccounts);
    renderEntityEditor("investmentAssets", el.settingsInvestments);
    renderEntityEditor("liabilities", el.settingsLiabilities);

    el.incomeTags.innerHTML = renderCategoryTags("incomeCategories");
    el.expenseTags.innerHTML = renderCategoryTags("expenseCategories");
    el.investmentTags.innerHTML = renderCategoryTags("investmentCategories");
  }

  function renderEntityEditor(key: EntityKey, container: HTMLElement) {
    const list = state[key];
    if (!list.length) {
      container.innerHTML = "<p class='list-item'><small>Sin elementos.</small></p>";
      return;
    }

    container.innerHTML = list
      .map(
        (item: any) => `
          <div class="list-item" data-entity="${escapeAttr(key)}" data-id="${escapeAttr(item.id)}">
            <input type="text" data-field="name" value="${escapeAttr(item.name)}" aria-label="Nombre ${escapeAttr(item.name)}" />
            <input type="number" data-field="openingBalance" step="0.01" value="${Number(item.openingBalance || 0)}" aria-label="Saldo inicial de ${escapeAttr(item.name)}" />
            <button class="delete-btn" data-action="remove-entity" data-entity="${escapeAttr(key)}" data-id="${escapeAttr(item.id)}" aria-label="Eliminar ${escapeAttr(item.name)}">Eliminar</button>
          </div>
        `
      )
      .join("");
  }

  function renderCategoryTags(key: CategoryKey) {
    const list = state[key] || [];
    if (!list.length) {
      return "<small>Sin categorías.</small>";
    }

    return list
      .map(
        (item: any) => `
          <span class="tag">
            ${escapeHtml(item)}
            <button class="icon-btn" data-action="remove-category" data-target="${escapeAttr(key)}" data-name="${escapeAttr(item)}" aria-label="Eliminar categoría ${escapeAttr(item)}">×</button>
          </span>
        `
      )
      .join("");
  }

  function renderDataTab() {
    el.dataTotalTransactions.textContent = String(state.transactions.length);
    el.dataTotalSnapshots.textContent = String(Object.keys(state.snapshots || {}).length);
    el.dataTotalContributions.textContent = String(state.contributions.length);

    const source = state.meta?.source || "desconocido";
    const generated = state.meta?.generatedAt || "";
    const savedAt = state.meta?.savedAt || "";

    el.dataMeta.textContent = `Origen: ${source} | Seed: ${generated} | Último guardado local: ${savedAt || "-"}`;
  }

  function getCategoriesForType(type: BudgetType): string[] {
    if (type === "income") {
      return state.incomeCategories;
    }
    if (type === "expense") {
      return state.expenseCategories;
    }
    return state.investmentCategories;
  }

  function getMonthTotals(month: number): MonthTotals {
    return state.transactions
      .filter((item: any) => Number(item.month) === month)
      .reduce(
        (acc: any, item: any) => {
          if (item.type === "income") {
            acc.income += Number(item.amount || 0);
          }
          if (item.type === "expense") {
            acc.expense += Number(item.amount || 0);
          }
          if (item.type === "investment") {
            acc.investment += Number(item.amount || 0);
          }
          return acc;
        },
        { income: 0, expense: 0, investment: 0 }
      );
  }

  function getYearTotals(): MonthTotals {
    return MONTHS.map((_: any, month: any) => getMonthTotals(month)).reduce(
      (acc: any, item: any) => {
        acc.income += item.income;
        acc.expense += item.expense;
        acc.investment += item.investment;
        return acc;
      },
      { income: 0, expense: 0, investment: 0 }
    );
  }

  function getMonthlyCashflowSeries() {
    const income: number[] = [];
    const expense: number[] = [];
    const investment: number[] = [];

    MONTHS.forEach((_: any, month: any) => {
      const total = getMonthTotals(month);
      income.push(round2(total.income));
      expense.push(round2(total.expense));
      investment.push(round2(total.investment));
    });

    return { income, expense, investment };
  }

  function getCategoryActuals(type: BudgetType, month: number): Record<string, number> {
    const map: Record<string, number> = {};

    getCategoriesForType(type).forEach((category: any) => {
      map[category] = 0;
    });

    state.transactions
      .filter((item: any) => Number(item.month) === month && item.type === type)
      .forEach((item: any) => {
        if (!map[item.category]) {
          map[item.category] = 0;
        }
        map[item.category] += Number(item.amount || 0);
      });

    Object.keys(map).forEach((key: any) => {
      map[key] = round2(map[key]);
    });

    return map;
  }

  function getBudgetValue(type: BudgetType, category: string, month: number) {
    ensureBudgetCategory(type, category);
    return round2(state.budget[type][category][month] || 0);
  }

  function ensureBudgetCategory(type: BudgetType, category: string) {
    if (!state.budget[type]) {
      state.budget[type] = {};
    }
    if (!state.budget[type][category]) {
      state.budget[type][category] = Array.from({ length: 12 }, () => 0);
    }
    if (state.budget[type][category].length < 12) {
      const missing = 12 - state.budget[type][category].length;
      state.budget[type][category].push(...Array.from({ length: missing }, () => 0));
    }
  }

  function getSnapshotValue(kind: SnapshotKind, month: number, itemId: string) {
    const snapshot = state.snapshots[String(month)];
    if (!snapshot || !snapshot[kind]) {
      return null;
    }
    const raw = snapshot[kind][itemId];
    return Number.isFinite(Number(raw)) ? Number(raw) : null;
  }

  function getLatestSnapshotValue(kind: SnapshotKind, itemId: string, month: number) {
    for (let m = month; m >= 0; m -= 1) {
      const value = getSnapshotValue(kind, m, itemId);
      if (value !== null) {
        return { month: m, value };
      }
    }
    return null;
  }

  function getAccountName(accountId: any) {
    const account = state.accounts.find((item: any) => item.id === accountId);
    return account ? account.name : accountId || "-";
  }

  function computeAccountBalance(accountId: any, month: any) {
    const account = state.accounts.find((item: any) => item.id === accountId);
    if (!account) {
      return 0;
    }

    const latestSnapshot = getLatestSnapshotValue("accounts", accountId, month);
    let startMonth = -1;
    let balance = Number(account.openingBalance || 0);

    if (latestSnapshot) {
      startMonth = latestSnapshot.month;
      balance = latestSnapshot.value;
    }

    state.transactions.forEach((item: any) => {
      if (item.accountId !== accountId) {
        return;
      }
      const txMonth = Number(item.month);
      if (txMonth <= startMonth || txMonth > month) {
        return;
      }
      const amount = Number(item.amount || 0);
      if (item.type === "income") {
        balance += amount;
      } else if (item.type === "expense" || item.type === "investment") {
        balance -= amount;
      }
    });

    return round2(balance);
  }

  function computeInvestmentValue(assetId: any, month: any) {
    const asset = state.investmentAssets.find((item: any) => item.id === assetId);
    if (!asset) {
      return 0;
    }

    const latestSnapshot = getLatestSnapshotValue("investments", assetId, month);
    let startMonth = -1;
    let value = Number(asset.openingBalance || 0);

    if (latestSnapshot) {
      startMonth = latestSnapshot.month;
      value = latestSnapshot.value;
    }

    state.transactions.forEach((item: any) => {
      if (item.type !== "investment") {
        return;
      }
      const txMonth = Number(item.month);
      if (txMonth <= startMonth || txMonth > month) {
        return;
      }
      if (!matchesInvestmentAsset(item.category, asset)) {
        return;
      }
      value += Number(item.amount || 0);
    });

    return round2(value);
  }

  function computeLiabilityValue(liabilityId: any, month: any) {
    const liability = state.liabilities.find((item: any) => item.id === liabilityId);
    if (!liability) {
      return 0;
    }

    const latestSnapshot = getLatestSnapshotValue("liabilities", liabilityId, month);
    if (latestSnapshot) {
      return round2(latestSnapshot.value);
    }

    return round2(Number(liability.openingBalance || 0));
  }

  function matchesInvestmentAsset(category: any, asset: any) {
    if (!category || !asset) {
      return false;
    }
    const catSlug = slug(category);
    return catSlug === asset.id || category.toLowerCase() === String(asset.name || "").toLowerCase();
  }

  function getWealthByMonth(month: any) {
    const liquidity = state.accounts.reduce((sum: any, item: any) => sum + computeAccountBalance(item.id, month), 0);
    const investment = state.investmentAssets.reduce((sum: any, item: any) => sum + computeInvestmentValue(item.id, month), 0);
    const liabilities = state.liabilities.reduce((sum: any, item: any) => sum + computeLiabilityValue(item.id, month), 0);
    const net = liquidity + investment - liabilities;

    return {
      liquidity: round2(liquidity),
      investment: round2(investment),
      liabilities: round2(liabilities),
      net: round2(net),
    };
  }

  function getWealthSeries() {
    return MONTHS.map((_: any, month: any) => getWealthByMonth(month));
  }

  function computeInvestedCapital(month: any) {
    const openingCapital = state.investmentAssets.reduce((sum: any, item: any) => sum + Number(item.openingBalance || 0), 0);
    const contributions = state.transactions
      .filter((item: any) => item.type === "investment" && Number(item.month) <= month)
      .reduce((sum: any, item: any) => sum + Number(item.amount || 0), 0);

    return round2(openingCapital + contributions);
  }

  function computeContributionMetrics(entries: Contribution[]): ContributionMetricRow[] {
    const sorted = [...entries].sort((a: any, b: any) => String(a.portfolioDate || a.date).localeCompare(String(b.portfolioDate || b.date)));
    if (!sorted.length) {
      return [];
    }

    const rows: ContributionMetricRow[] = [];
    let baseNav = 100;
    let prevNav = 100;
    let prevUnits = 0;

    sorted.forEach((item: any, index: any) => {
      const portfolioValue = Number(item.portfolioValue || 0);
      const flow = Number.isFinite(Number(item.flow)) ? Number(item.flow) : Number(item.amount || 0);
      const amount = Number(item.amount || 0);

      let nav;
      let unitsBefore;
      let unitsAfter;
      let periodReturn;

      if (index === 0) {
        nav = baseNav;
        unitsBefore = portfolioValue > 0 ? portfolioValue / nav : 0;
        unitsAfter = nav > 0 ? unitsBefore + flow / nav : unitsBefore;
        periodReturn = 0;
      } else {
        unitsBefore = prevUnits;
        nav = unitsBefore > 0 ? portfolioValue / unitsBefore : prevNav;
        if (!Number.isFinite(nav) || nav <= 0) {
          nav = prevNav;
        }
        unitsAfter = nav > 0 ? unitsBefore + flow / nav : unitsBefore;
        periodReturn = prevNav > 0 ? nav / prevNav - 1 : 0;
      }

      if (!Number.isFinite(unitsAfter)) {
        unitsAfter = unitsBefore;
      }

      const cumulativeReturn = baseNav > 0 ? nav / baseNav - 1 : 0;

      rows.push({
        id: item.id,
        date: item.portfolioDate || item.date,
        amount: round2(amount),
        portfolioValue: round2(portfolioValue),
        flow: round2(flow),
        nav,
        periodReturn,
        cumulativeReturn,
      });

      prevNav = nav;
      prevUnits = unitsAfter;
    });

    return rows;
  }

  function monthsUntilGoal(targetYear: any) {
    const safeYear = parseIntSafe(targetYear, state.year);
    const now = new Date();
    const end = new Date(safeYear, 11, 31);
    const diffMonths = (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth());
    return Math.max(diffMonths, 1);
  }

  function addEntityFromForm(formElement: HTMLFormElement, targetKey: EntityKey) {
    const form = new FormData(formElement);
    const name = String(form.get("name") || "").trim();
    const openingBalance = round2(parseFloatSafe(form.get("openingBalance"), 0));

    if (!name) {
      showToast("Indica un nombre.");
      return;
    }

    const id = slug(name);
    const exists = state[targetKey].some((item: any) => item.id === id);
    if (exists) {
      showToast("Ese elemento ya existe.");
      return;
    }

    state[targetKey].push({ id, name, openingBalance });
    formElement.reset();
    saveState();
    renderAll();
    showToast("Elemento agregado.");
  }

  function onEntityEditorInput(event: Event) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }

    const row = input.closest<HTMLElement>("[data-entity][data-id]");
    if (!row) {
      return;
    }

    const entity = row.dataset.entity;
    const id = row.dataset.id;
    const field = input.dataset.field;

    if (!entity || !id || !field || !isEntityKey(entity)) {
      return;
    }

    const list = state[entity];
    const item = list.find((entry: any) => entry.id === id);
    if (!item) {
      return;
    }

    if (field === "name") {
      item.name = input.value;
    }

    if (field === "openingBalance") {
      item.openingBalance = round2(parseFloatSafe(input.value, 0));
    }

    if (entity === "investmentAssets") {
      syncInvestmentCategoriesWithAssets();
    }

    saveState();
    renderAll();
  }

  function onEntityEditorDelete(event: Event) {
    const target = getEventElement(event.target);
    const button = target?.closest<HTMLElement>("button[data-action='remove-entity']");
    if (!button) {
      return;
    }

    const entity = button.dataset.entity;
    const id = button.dataset.id;

    if (!entity || !id || !isEntityKey(entity)) {
      return;
    }

    const list = state[entity];
    state[entity] = list.filter((item: any) => item.id !== id);

    if (entity === "accounts") {
      state.transactions = state.transactions.filter((tx: any) => tx.accountId !== id);
    }

    if (entity === "investmentAssets") {
      syncInvestmentCategoriesWithAssets();
    }

    saveState();
    renderAll();
    showToast("Elemento eliminado.");
  }

  function bindCategoryAddForm(formElement: HTMLFormElement, key: CategoryKey) {
    formElement.addEventListener("submit", (event: any) => {
      event.preventDefault();
      const form = new FormData(formElement);
      const name = String(form.get("name") || "").trim();

      if (!name) {
        return;
      }

      if (!state[key].includes(name)) {
        state[key].push(name);
      }

      formElement.reset();
      saveState();
      renderAll();
      showToast("Categoría agregada.");
    });
  }

  function onCategoryDelete(event: Event) {
    const target = getEventElement(event.target);
    const button = target?.closest<HTMLElement>("button[data-action='remove-category']");
    if (!button) {
      return;
    }

    const key = button.dataset.target;
    const name = button.dataset.name;

    if (!key || !name || !isCategoryKey(key)) {
      return;
    }

    state[key] = state[key].filter((item: any) => item !== name);

    if (key === "investmentCategories") {
      // no-op
    }

    saveState();
    renderAll();
    showToast("Categoría eliminada.");
  }

  function syncInvestmentCategoriesWithAssets() {
    const assetNames = state.investmentAssets.map((item: any) => item.name);
    const merged = Array.from(new Set([...(state.investmentCategories || []), ...assetNames]));
    state.investmentCategories = merged;
  }

  function exportStateAsJson() {
    const payload = JSON.stringify(state, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    downloadUrl(url, `finance-tracker-${state.year}.json`);
    URL.revokeObjectURL(url);
    showToast("JSON exportado.");
  }

  function importStateFromJson(event: any) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || "{}"));
        state = normalizeState(data);
        saveState();
        renderAll();
        showToast("JSON importado correctamente.");
      } catch (error) {
        showToast("No se pudo importar el archivo.");
      } finally {
        el.importJson.value = "";
      }
    };

    reader.readAsText(file, "utf-8");
  }

  function exportTransactionsCsv() {
    const header = ["id", "date", "month", "type", "accountId", "category", "description", "amount"];
    const rows = state.transactions.map((item: any) => [
      item.id,
      item.date,
      item.month,
      item.type,
      item.accountId,
      item.category,
      item.description,
      item.amount,
    ]);

    const csv = [header, ...rows]
      .map((row: any) => row.map((field: any) => `"${String(field ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    downloadUrl(url, `movimientos-${state.year}.csv`);
    URL.revokeObjectURL(url);
    showToast("CSV exportado.");
  }

  function downloadUrl(url: any, filename: any) {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
  }

  function saveState() {
    persistState(state);
    const time = new Date(state.meta.savedAt || Date.now());
    const hh = String(time.getHours()).padStart(2, "0");
    const mm = String(time.getMinutes()).padStart(2, "0");
    el.saveStatus.textContent = `Guardado ${hh}:${mm}`;
  }

  function sortTransactions() {
    sortTransactionsInState(state);
  }

  function sortContributions() {
    sortContributionsInState(state);
  }

  function showToast(message: any) {
    el.toast.textContent = message;
    el.toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      el.toast.classList.remove("show");
    }, 2200);
  }

  function formatMoney(value: any) {
    const currency = (state.currency || "EUR").toUpperCase();
    try {
      return new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(Number(value || 0));
    } catch (_) {
      return `${Number(value || 0).toFixed(2)} ${currency}`;
    }
  }
})();
