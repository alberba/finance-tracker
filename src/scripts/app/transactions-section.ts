import {
  isTransactionType,
  type SortDirection,
  type State,
  type Transaction,
  type TransactionType,
  type TxSortColumn,
} from "../types";
import {
  buildAccountFilterOptions,
  buildMonthBreakdown,
  filterAndSortTransactions,
  type TransactionFilters,
} from "../transactions";
import { decorateCategoryLabel } from "../category-emoji";
import { escapeAttr, escapeHtml, monthFromISO, parseFloatSafe, parseIntSafe, round2, todayISO, uid } from "../utils";

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

interface TransactionsUi {
  txFilterMonth: number;
  txSort: {
    column: TxSortColumn;
    direction: SortDirection;
  };
  txOpenHeaderFilter: TxSortColumn | "";
  txSelectedIds: string[];
  txFilters: TransactionFilters;
  txEditingId: string;
  investmentTxEditingId: string;
}

interface TransactionsElements {
  txMonthFilter: HTMLSelectElement;
  txForm: TxForm;
  txBody: HTMLElement;
  txHeaderFilterDate: HTMLInputElement;
  txHeaderFilterAccount: HTMLElement;
  txHeaderFilterType: HTMLElement;
  txHeaderFilterCategory: HTMLInputElement;
  txHeaderFilterDescription: HTMLInputElement;
  txHeaderFilterAmountMin: HTMLInputElement;
  txHeaderFilterAmountMax: HTMLInputElement;
  txOpenModal: HTMLButtonElement;
  txDialog: HTMLDialogElement;
  txCloseModal: HTMLButtonElement;
  txSubmitMore: HTMLButtonElement;
  txSelectAll: HTMLInputElement;
  txSelectedCount: HTMLElement;
  txBulkType: HTMLSelectElement;
  txBulkAccount: HTMLSelectElement;
  txBulkCategory: HTMLInputElement;
  txBulkApply: HTMLButtonElement;
  txBulkDelete: HTMLButtonElement;
  txTotalIncome: HTMLElement;
  txTotalExpense: HTMLElement;
  txTotalInvestment: HTMLElement;
  txCategoryBreakdownBody: HTMLElement;
}

interface TransactionsSectionDeps {
  getState: () => State;
  ui: TransactionsUi;
  el: TransactionsElements;
  getEventElement: (target: EventTarget | null) => Element | null;
  hasSelectionWithin: (container: Element) => boolean;
  populateTransactionFormOptions: () => void;
  populateTransactionCategoryOptions: () => void;
  sortTransactions: () => void;
  saveState: () => void;
  renderAll: () => void;
  showToast: (message: string) => void;
  getAccountName: (accountId: string) => string;
  formatMoney: (value: number) => string;
}

const TX_TYPE_FILTER_OPTIONS = [
  { value: "income", label: "Ingreso" },
  { value: "expense", label: "Gasto" },
  { value: "investment", label: "Inversión" },
] as const;

export function setupTransactionSection(deps: TransactionsSectionDeps) {
  const { ui, el } = deps;

  function isTxSortColumn(value: string): value is TxSortColumn {
    return ["date", "amount", "account", "type", "category", "description"].includes(value);
  }

  function getCheckedValuesFromContainer(container: HTMLElement): string[] {
    return Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-filter-value]:checked')
    )
      .map((input) => String(input.dataset.filterValue || "").trim())
      .filter(Boolean);
  }

  function getOpenTransactionHeaderFilterPopover(): HTMLElement | null {
    if (!ui.txOpenHeaderFilter) {
      return null;
    }
    const popover = document.querySelector<HTMLElement>(`.tx-filter-popover[data-column="${ui.txOpenHeaderFilter}"]`);
    if (!popover || popover.hasAttribute("hidden")) {
      return null;
    }
    return popover;
  }

  function getFilteredAndSortedTransactions() {
    const state = deps.getState();
    return filterAndSortTransactions({
      transactions: state.transactions,
      month: ui.txFilterMonth,
      filters: ui.txFilters,
      sort: ui.txSort,
      getAccountName: deps.getAccountName,
    });
  }

  function renderSummaryCategoryCell(
    type: TransactionType,
    row: { category: string; amount: number } | undefined
  ): string {
    if (!row) {
      return "<span class='tx-summary-empty'>-</span>";
    }
    return `<div class="tx-summary-item"><span>${escapeHtml(
      decorateCategoryLabel(type, row.category)
    )}</span><strong>${deps.formatMoney(row.amount)}</strong></div>`;
  }

  function renderTransactionBreakdownSummary() {
    const state = deps.getState();
    const monthBreakdown = buildMonthBreakdown({
      transactions: state.transactions,
      month: ui.txFilterMonth,
      incomeCategories: state.incomeCategories,
      expenseCategories: state.expenseCategories,
      investmentCategories: state.investmentCategories,
    });

    el.txTotalIncome.textContent = deps.formatMoney(monthBreakdown.totals.income);
    el.txTotalExpense.textContent = deps.formatMoney(monthBreakdown.totals.expense);
    el.txTotalInvestment.textContent = deps.formatMoney(monthBreakdown.totals.investment);

    const sections = [
      { type: "income", label: "INGRESOS", rows: monthBreakdown.byType.income, cssClass: "income" },
      { type: "expense", label: "GASTOS", rows: monthBreakdown.byType.expense, cssClass: "expense" },
      { type: "investment", label: "INVERSIONES", rows: monthBreakdown.byType.investment, cssClass: "investment" },
    ] as const;

    el.txCategoryBreakdownBody.innerHTML = sections
      .map(({ type, label, rows, cssClass }) => {
        const header = `<tr><td class="tx-summary-group-title tx-summary-heading tx-summary-heading--${cssClass}">${label}</td></tr>`;
        if (!rows.length) {
          return `${header}<tr><td class="tx-summary-empty">Sin movimientos</td></tr>`;
        }
        const body = rows
          .map(
            (row) => `
              <tr data-summary-type="${type}" data-summary-category="${escapeAttr(row.category)}">
                <td>${renderSummaryCategoryCell(type, row)}</td>
              </tr>
            `
          )
          .join("");
        return header + body;
      })
      .join("");
  }

  function renderTransactionSelectionState(tx: Transaction[]) {
    const selectedVisible = tx.filter((item) => ui.txSelectedIds.includes(item.id)).length;
    const allVisibleSelected = tx.length > 0 && selectedVisible === tx.length;

    el.txSelectAll.checked = allVisibleSelected;
    el.txSelectedCount.textContent = `${selectedVisible} seleccionadas`;
    el.txBulkApply.disabled = selectedVisible === 0;
    el.txBulkDelete.disabled = selectedVisible === 0;
  }

  function syncTransactionFilterUI() {
    el.txHeaderFilterDate.value = ui.txFilters.date;
    el.txHeaderFilterCategory.value = ui.txFilters.category;
    el.txHeaderFilterDescription.value = ui.txFilters.description;
    el.txHeaderFilterAmountMin.value = ui.txFilters.amountMin;
    el.txHeaderFilterAmountMax.value = ui.txFilters.amountMax;
    el.txHeaderFilterAccount
      .querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-filter-value]')
      .forEach((input) => {
        const value = String(input.dataset.filterValue || "").trim();
        input.checked = ui.txFilters.accountIds.includes(value);
      });
    el.txHeaderFilterType
      .querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-filter-value]')
      .forEach((input) => {
        const value = String(input.dataset.filterValue || "").trim();
        input.checked = ui.txFilters.types.includes(value);
      });
  }

  function syncTransactionFilterOptions() {
    const state = deps.getState();
    const allAccounts = buildAccountFilterOptions({
      transactions: state.transactions,
      month: ui.txFilterMonth,
      getAccountName: deps.getAccountName,
    });
    const current = ui.txFilters.accountIds;
    el.txHeaderFilterAccount.innerHTML = allAccounts.length
      ? allAccounts
          .map(
            (item) => `
              <label class="tx-checkbox-option">
                <input type="checkbox" data-filter-value="${escapeAttr(item.value)}" ${current.includes(item.value) ? "checked" : ""} />
                <span>${escapeHtml(item.label)}</span>
              </label>
            `
          )
          .join("")
      : "<small>Sin cuentas en este mes.</small>";

    el.txHeaderFilterType.innerHTML = TX_TYPE_FILTER_OPTIONS
      .map(
        (item) => `
          <label class="tx-checkbox-option">
            <input type="checkbox" data-filter-value="${escapeAttr(item.value)}" ${ui.txFilters.types.includes(item.value) ? "checked" : ""} />
            <span>${escapeHtml(item.label)}</span>
          </label>
        `
      )
      .join("");
  }

  function hasTransactionFilterForColumn(column: TxSortColumn): boolean {
    if (column === "date") {
      return Boolean(ui.txFilters.date);
    }
    if (column === "account") {
      return ui.txFilters.accountIds.length > 0;
    }
    if (column === "type") {
      return ui.txFilters.types.length > 0;
    }
    if (column === "category") {
      return Boolean(ui.txFilters.category);
    }
    if (column === "description") {
      return Boolean(ui.txFilters.description);
    }
    return Boolean(ui.txFilters.amountMin || ui.txFilters.amountMax);
  }

  function renderTransactionHeaderFilterState() {
    document.querySelectorAll<HTMLElement>(".tx-head--filterable").forEach((header) => {
      const column = header.dataset.filterColumn || "";
      if (!isTxSortColumn(column)) {
        return;
      }
      const isOpen = ui.txOpenHeaderFilter === column;
      const trigger = header.querySelector<HTMLButtonElement>(".tx-filter-trigger");
      const popover = header.querySelector<HTMLElement>(".tx-filter-popover");
      const isFiltered = hasTransactionFilterForColumn(column);
      header.classList.toggle("is-open", isOpen);
      header.classList.toggle("is-filtered", isFiltered);
      if (trigger) {
        trigger.setAttribute("aria-expanded", isOpen ? "true" : "false");
        trigger.classList.toggle("is-filtered", isFiltered);
      }
      if (popover) {
        popover.hidden = !isOpen;
      }
    });
  }

  function renderTransactionSortState() {
    document.querySelectorAll<HTMLButtonElement>(".tx-sort-btn").forEach((button) => {
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

  function clearTransactionFilterByColumn(column: TxSortColumn) {
    if (column === "date") {
      ui.txFilters.date = "";
    } else if (column === "account") {
      ui.txFilters.accountIds = [];
    } else if (column === "type") {
      ui.txFilters.types = [];
    } else if (column === "category") {
      ui.txFilters.category = "";
    } else if (column === "description") {
      ui.txFilters.description = "";
    } else if (column === "amount") {
      ui.txFilters.amountMin = "";
      ui.txFilters.amountMax = "";
    }
    ui.txOpenHeaderFilter = "";
    ui.txEditingId = "";
    ui.txSelectedIds = [];
    syncTransactionFilterUI();
    renderTransactions();
  }

  function syncTransactionFiltersFromHeaderUI() {
    ui.txFilters = {
      date: String(el.txHeaderFilterDate.value || "").trim(),
      accountIds: getCheckedValuesFromContainer(el.txHeaderFilterAccount),
      types: getCheckedValuesFromContainer(el.txHeaderFilterType),
      category: String(el.txHeaderFilterCategory.value || "").trim(),
      description: String(el.txHeaderFilterDescription.value || "").trim(),
      amountMin: String(el.txHeaderFilterAmountMin.value || "").trim(),
      amountMax: String(el.txHeaderFilterAmountMax.value || "").trim(),
    };
    ui.txEditingId = "";
    ui.txSelectedIds = [];
    renderTransactions();
  }

  function renderEditingTransactionRow(
    item: Transaction,
    editingRowAttr = "data-editing-id",
    actions: { saveAction: string; cancelAction: string } = {
      saveAction: "save-edit-tx",
      cancelAction: "cancel-edit-tx",
    }
  ): string {
    const state = deps.getState();
    const accountsOptions = state.accounts
      .map((entry) => {
        const selected = entry.id === item.accountId ? "selected" : "";
        return `<option value="${escapeAttr(entry.id)}" ${selected}>${escapeHtml(entry.name)}</option>`;
      })
      .join("");

    const typeOptions = ["income", "expense", "investment"]
      .map((typeValue) => {
        const label = typeValue === "income" ? "Ingreso" : typeValue === "expense" ? "Gasto" : "Inversión";
        const selected = typeValue === item.type ? "selected" : "";
        return `<option value="${typeValue}" ${selected}>${label}</option>`;
      })
      .join("");

    return `
      <tr ${editingRowAttr}="${escapeAttr(item.id)}">
        <td></td>
        <td><input type="date" name="editTxDate" autocomplete="off" data-edit-field="date" value="${escapeAttr(String(item.date))}" /></td>
        <td><input type="text" name="editTxDescription" autocomplete="off" data-edit-field="description" value="${escapeAttr(item.description || "")}" /></td>
        <td><input type="number" name="editTxAmount" autocomplete="off" step="0.01" data-edit-field="amount" value="${Number(item.amount || 0)}" /></td>
        <td><select name="editTxAccountId" data-edit-field="accountId">${accountsOptions}</select></td>
        <td><select name="editTxType" data-edit-field="type">${typeOptions}</select></td>
        <td><input type="text" name="editTxCategory" autocomplete="off" data-edit-field="category" value="${escapeAttr(item.category || "")}" /></td>
        <td>
          <div class="inline-actions">
            <button
              type="button"
              class="inline-save-btn icon-action-btn"
              data-action="${escapeAttr(actions.saveAction)}"
              data-id="${escapeAttr(item.id)}"
              aria-label="Guardar"
            >
              <svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"></path>
              </svg>
            </button>
            <button
              type="button"
              class="inline-cancel-btn icon-action-btn"
              data-action="${escapeAttr(actions.cancelAction)}"
              data-id="${escapeAttr(item.id)}"
              aria-label="Cancelar"
            >
              <svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z"></path>
              </svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }

  function saveEditedTransactionRow(id: string) {
    const state = deps.getState();
    const row = el.txBody.querySelector(`tr[data-editing-id="${id}"]`);
    if (!row) {
      return;
    }

    const tx = state.transactions.find((item): item is Transaction => item.id === id);
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

    const requiresPositiveAmount = type !== "investment";
    const invalidAmount = requiresPositiveAmount ? amount <= 0 : amount === 0;

    if (!date || !accountId || !type || !category || invalidAmount || !isTransactionType(type)) {
      deps.showToast("Completa fecha, cuenta, tipo, categoría e importe válido.");
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
    ui.investmentTxEditingId = "";
    deps.sortTransactions();
    deps.saveState();
    deps.renderAll();
    deps.showToast("Movimiento actualizado.");
  }

  function openTransactionModal() {
    ui.txEditingId = "";
    el.txForm.elements.month.value = String(ui.txFilterMonth);
    if (!el.txForm.elements.date.value) {
      el.txForm.elements.date.value = todayISO();
    }
    deps.populateTransactionFormOptions();
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
    const state = deps.getState();
    const selectedSet = new Set(ui.txSelectedIds);
    return state.transactions.filter((item) => selectedSet.has(item.id));
  }

  function applyBulkTransactionChanges() {
    const selected = getSelectedTransactions();
    if (!selected.length) {
      deps.showToast("Selecciona al menos una fila.");
      return;
    }

    const newType = String(el.txBulkType.value || "").trim();
    const newAccountId = String(el.txBulkAccount.value || "").trim();
    const newCategory = String(el.txBulkCategory.value || "").trim();

    if (!newType && !newAccountId && !newCategory) {
      deps.showToast("Define al menos un cambio de lote.");
      return;
    }

    if (newType && !isTransactionType(newType)) {
      deps.showToast("Tipo de movimiento no válido.");
      return;
    }

    selected.forEach((item) => {
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

    deps.sortTransactions();
    deps.saveState();
    deps.renderAll();
    deps.showToast(`Actualizadas ${selected.length} filas.`);
  }

  function deleteSelectedTransactions() {
    const state = deps.getState();
    const selected = getSelectedTransactions();
    if (!selected.length) {
      deps.showToast("Selecciona al menos una fila.");
      return;
    }

    const selectedSet = new Set(ui.txSelectedIds);
    state.transactions = state.transactions.filter((item) => !selectedSet.has(item.id));
    ui.txSelectedIds = [];
    deps.saveState();
    deps.renderAll();
    deps.showToast(`Eliminadas ${selected.length} filas.`);
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
      if (deps.hasSelectionWithin(el.txDialog)) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      closeTransactionModal();
    });

    [
      el.txHeaderFilterDate,
      el.txHeaderFilterCategory,
      el.txHeaderFilterDescription,
      el.txHeaderFilterAmountMin,
      el.txHeaderFilterAmountMax,
    ].forEach((input) => {
      input.addEventListener("input", syncTransactionFiltersFromHeaderUI);
      input.addEventListener("change", syncTransactionFiltersFromHeaderUI);
      input.addEventListener("click", (event) => event.stopPropagation());
    });
    [el.txHeaderFilterAccount, el.txHeaderFilterType].forEach((container) => {
      container.addEventListener("change", syncTransactionFiltersFromHeaderUI);
      container.addEventListener("click", (event) => event.stopPropagation());
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

    document.querySelectorAll<HTMLButtonElement>(".tx-filter-trigger").forEach((button) => {
      button.addEventListener("pointerdown", (event) => event.stopPropagation());
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const column = button.dataset.column || "";
        if (!isTxSortColumn(column)) {
          return;
        }
        ui.txOpenHeaderFilter = ui.txOpenHeaderFilter === column ? "" : column;
        renderTransactionHeaderFilterState();
      });
    });

    document.querySelectorAll(".tx-filter-popover").forEach((popover) => {
      popover.addEventListener("click", (event) => event.stopPropagation());
    });

    document.querySelectorAll<HTMLButtonElement>(".tx-header-clear-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const column = button.dataset.column || "";
        if (!isTxSortColumn(column)) {
          return;
        }
        clearTransactionFilterByColumn(column);
      });
    });

    document.addEventListener("pointerdown", (event) => {
      if (!ui.txOpenHeaderFilter) {
        return;
      }
      const openPopover = getOpenTransactionHeaderFilterPopover();
      const target = deps.getEventElement(event.target);
      if (openPopover && target && openPopover.contains(target)) {
        return;
      }
      if (openPopover && deps.hasSelectionWithin(openPopover)) {
        return;
      }
      ui.txOpenHeaderFilter = "";
      renderTransactionHeaderFilterState();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !ui.txOpenHeaderFilter) {
        return;
      }
      ui.txOpenHeaderFilter = "";
      renderTransactionHeaderFilterState();
    });

    el.txForm.elements.type.addEventListener("change", deps.populateTransactionCategoryOptions);
    el.txForm.elements.date.addEventListener("change", () => {
      const month = monthFromISO(el.txForm.elements.date.value);
      if (month !== null) {
        el.txForm.elements.month.value = String(month);
      }
    });

    el.txForm.addEventListener("submit", (event) => {
      const state = deps.getState();
      event.preventDefault();
      const form = new FormData(el.txForm);
      const amount = parseFloatSafe(form.get("amount"), 0);
      const month = parseIntSafe(form.get("month"), 0);
      const rawType = String(form.get("type") || "expense");
      const txType: TransactionType = isTransactionType(rawType) ? rawType : "expense";
      const submitter = (event as SubmitEvent).submitter;
      const keepOpen = submitter === el.txSubmitMore;

      if (amount <= 0) {
        deps.showToast("El importe debe ser mayor que 0.");
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

      deps.sortTransactions();
      deps.saveState();

      const persistedValues = {
        date: String(form.get("date") || todayISO()),
        month: String(form.get("month") || ui.txFilterMonth),
        type: String(form.get("type") || "expense"),
        accountId: String(form.get("accountId") || ""),
        category: String(form.get("category") || ""),
      };

      el.txForm.reset();
      el.txForm.elements.month.value = persistedValues.month;
      el.txForm.elements.type.value = persistedValues.type;
      deps.populateTransactionFormOptions();
      el.txForm.elements.accountId.value = persistedValues.accountId;
      if (persistedValues.category) {
        el.txForm.elements.category.value = persistedValues.category;
      }
      el.txForm.elements.date.value = keepOpen ? persistedValues.date : todayISO();
      el.txForm.elements.amount.value = "";
      el.txForm.elements.description.value = "";

      if (!keepOpen) {
        closeTransactionModal();
      }

      deps.renderAll();
      deps.showToast(keepOpen ? "Guardado. Puedes añadir otro." : "Movimiento guardado.");
    });

    el.txBody.addEventListener("click", (event) => {
      const state = deps.getState();
      const target = deps.getEventElement(event.target);
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
      state.transactions = state.transactions.filter((item) => item.id !== id);
      ui.txSelectedIds = ui.txSelectedIds.filter((itemId) => itemId !== id);
      deps.saveState();
      deps.renderAll();
      deps.showToast("Movimiento eliminado.");
    });

    el.txBody.addEventListener("change", (event) => {
      const target = deps.getEventElement(event.target);
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
      const visibleIds = getFilteredAndSortedTransactions().map((item) => item.id);
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

  function renderTransactions() {
    syncTransactionFilterUI();
    syncTransactionFilterOptions();
    renderTransactionSortState();
    renderTransactionHeaderFilterState();
    renderTransactionBreakdownSummary();

    const tx = getFilteredAndSortedTransactions();
    const visibleIdSet = new Set(tx.map((item) => item.id));
    ui.txSelectedIds = ui.txSelectedIds.filter((id) => visibleIdSet.has(id));
    renderTransactionSelectionState(tx);

    if (!tx.length) {
      el.txBody.innerHTML = "<tr><td colspan='8'>Sin movimientos para este mes.</td></tr>";
      return;
    }

    el.txBody.innerHTML = tx
      .map((item) => {
        if (ui.txEditingId === item.id) {
          return renderEditingTransactionRow(item);
        }

        const typeLabel = item.type === "income" ? "Ingreso" : item.type === "expense" ? "Gasto" : "Inversión";
        const typeClass = item.type === "income" ? "badge-income" : item.type === "expense" ? "badge-expense" : "badge-investment";
        const account = deps.getAccountName(item.accountId);

        return `
          <tr class="${ui.txSelectedIds.includes(item.id) ? "row-selected" : ""}">
            <td>
              <input type="checkbox" name="txSelectedIds" data-select-tx-id="${escapeAttr(item.id)}" ${ui.txSelectedIds.includes(item.id) ? "checked" : ""} aria-label="Seleccionar movimiento del ${escapeAttr(String(item.date))}" />
            </td>
            <td>${escapeHtml(String(item.date))}</td>
            <td>${escapeHtml(item.description || "-")}</td>
            <td>${deps.formatMoney(item.amount)}</td>
            <td>${escapeHtml(account)}</td>
            <td><span class="badge ${typeClass}">${typeLabel}</span></td>
            <td>${escapeHtml(decorateCategoryLabel(item.type, item.category || "Sin categoría"))}</td>
            <td>
              <div class="inline-actions">
                <button class="edit-btn icon-action-btn" data-action="edit-tx" data-id="${escapeAttr(item.id)}" aria-label="Editar movimiento del ${escapeAttr(String(item.date))}">
                  <svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M3 17.25V21h3.75L18.81 8.94l-3.75-3.75L3 17.25z"></path>
                    <path d="M20.71 7.04a1 1 0 0 0 0-1.41L18.37 3.29a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"></path>
                  </svg>
                </button>
                <button class="delete-btn icon-action-btn" data-delete-id="${escapeAttr(item.id)}" aria-label="Eliminar movimiento del ${escapeAttr(String(item.date))}">
                  <svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M6 7h12l-1 14H7L6 7z"></path>
                    <path d="M9 4h6l1 2H8l1-2z"></path>
                  </svg>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  return {
    bindTransactionEvents,
    renderTransactions,
  };
}
