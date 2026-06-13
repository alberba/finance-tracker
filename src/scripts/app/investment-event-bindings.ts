import { type InvestmentSubTab, type SnapshotKind, type State } from "../types";
import {
  computeInvestmentMovement,
  normalizeInvestmentSide,
  normalizeInvestmentSymbol,
} from "../investment-movements";
import { monthFromISO } from "../utils";
import { parseFloatSafe, parseIntSafe, round2, todayISO, uid } from "../utils";
import { toSnapshotDate } from "../contribution-workflow";
import { type UiState } from "./ui-state";

interface InvestmentEventElements {
  snapshotMonth: HTMLSelectElement;
  saveSnapshot: HTMLButtonElement;
  snapshotInvestments: HTMLElement;
  wealthCalcClose: HTMLButtonElement;
  wealthCalcDialog: HTMLDialogElement;
  wealthCalcForm: HTMLFormElement;
  investmentSubtabButtons: HTMLButtonElement[];
  investmentReturnModeButtons: HTMLButtonElement[];
  investmentMonth: HTMLSelectElement;
  investmentYearFilter: HTMLSelectElement;
  investmentOnlyUndeclared: HTMLInputElement;
  investmentMovementSide: HTMLSelectElement;
  investmentMovementCategory: HTMLSelectElement;
  investmentMovementUnitPrice: HTMLInputElement;
  investmentMovementUnits: HTMLInputElement;
  investmentMovementFee: HTMLInputElement;
  investmentMovementSymbol: HTMLInputElement;
  investmentMovementBroker: HTMLSelectElement;
  investmentMovementForm: HTMLFormElement;
  investmentMovementDate: HTMLInputElement;
  investmentMovementTime: HTMLInputElement;
  investmentMovementCurrency: HTMLInputElement;
  investmentMovementDeclared: HTMLInputElement;
  investmentTxBody: HTMLElement;
  openContributionWorkflow: HTMLButtonElement;
  contributionWorkflowDialog: HTMLDialogElement;
  contributionWorkflowClose: HTMLButtonElement;
  contributionWorkflowForm: HTMLFormElement;
  contributionWorkflowMonth: HTMLSelectElement;
  contributionWorkflowDate: HTMLInputElement;
  contributionWorkflowTotal: HTMLInputElement;
  contributionWorkflowNext: HTMLButtonElement;
  contributionWorkflowPrev: HTMLButtonElement;
  contributionCalcDialog: HTMLDialogElement;
  contributionCalcClose: HTMLButtonElement;
  contributionCalcForm: HTMLFormElement;
  contributionBody: HTMLElement;
  contributionDeleteMessage: HTMLElement;
  contributionDeleteDialog: HTMLDialogElement;
  contributionDeleteClose: HTMLButtonElement;
  contributionDeleteCancel: HTMLButtonElement;
  contributionDeleteForm: HTMLFormElement;
}

interface InvestmentEventBindingsDeps {
  getState: () => State;
  ui: UiState;
  el: InvestmentEventElements;
  getEventElement: (target: EventTarget | null) => Element | null;
  isSnapshotKind: (value: string) => value is SnapshotKind;
  isInvestmentSubTab: (value: string) => value is InvestmentSubTab;
  renderWealth: () => void;
  saveSnapshotFromTable: () => void;
  onOpenInvestmentSnapshotCalcModal: (event: Event) => void;
  closeWealthCalcModal: () => void;
  applyWealthCalcModalResult: () => void;
  renderInvestmentTabState: () => void;
  renderInvestmentReturnModeToggle: () => void;
  renderInvestmentDashboard: () => void;
  renderInvestment: () => void;
  renderInvestmentTransactionsTable: () => void;
  syncInvestmentMovementComputedAmount: () => void;
  normalizeInvestmentMovementSymbolField: () => void;
  syncInvestmentMovementCategoryField: () => void;
  resolveInvestmentCategory: (
    accountId: string,
    rawCategory: string,
    fallbackCategory: string,
  ) => string;
  sortTransactions: () => void;
  saveState: () => void;
  renderAll: () => void;
  showToast: (message: string) => void;
  saveEditedInvestmentTransactionRow: (id: string) => void;
  renderContributionsTable: () => void;
  upsertContributionFlowForDate: (date: string, flow: number) => void;
  openContributionWorkflowModal: () => void;
  closeContributionWorkflowModal: () => void;
  renderContributionWorkflowModal: () => void;
  renderContributionWorkflowStepState: () => void;
  renderContributionWorkflowModalWarnings: () => void;
  openContributionCalcModal: (
    kind: SnapshotKind,
    itemId: string,
    itemName: string,
  ) => void;
  closeContributionCalcModal: () => void;
  applyContributionCalcModalResult: () => void;
  saveContributionFromWorkflowModal: () => void;
  isManualContributionDate: (date: string) => boolean;
}

export function setupInvestmentEventBindings(
  deps: InvestmentEventBindingsDeps,
) {
  const { ui, el } = deps;
  let pendingContributionDeleteDate = "";

  function openContributionDeleteDialog(date: string) {
    pendingContributionDeleteDate = date;
    el.contributionDeleteMessage.textContent = `¿Seguro que quieres eliminar el aporte manual del ${date}?`;
    el.contributionDeleteDialog.showModal();
  }

  function closeContributionDeleteDialog() {
    pendingContributionDeleteDate = "";
    if (el.contributionDeleteDialog.open) {
      el.contributionDeleteDialog.close();
    }
  }

  function confirmContributionDelete() {
    const state = deps.getState();
    const date = String(pendingContributionDeleteDate || "").trim();
    if (!date || !deps.isManualContributionDate(date)) {
      closeContributionDeleteDialog();
      return;
    }

    state.contributions = state.contributions.filter((item) => {
      const itemDate = String(item.portfolioDate || item.date || "").trim();
      return itemDate !== date;
    });
    deps.saveState();
    closeContributionDeleteDialog();
    deps.renderAll();
    deps.showToast("Aporte manual eliminado.");
  }

  function bindWealthEvents() {
    el.snapshotMonth.addEventListener("change", () => {
      ui.snapshotMonth = parseIntSafe(el.snapshotMonth.value, ui.snapshotMonth);
      deps.renderWealth();
    });
    el.saveSnapshot.addEventListener("click", deps.saveSnapshotFromTable);
    el.snapshotInvestments.addEventListener(
      "click",
      deps.onOpenInvestmentSnapshotCalcModal,
    );
    el.wealthCalcClose.addEventListener("click", deps.closeWealthCalcModal);
    el.wealthCalcDialog.addEventListener("cancel", (event: Event) => {
      event.preventDefault();
      deps.closeWealthCalcModal();
    });
    el.wealthCalcForm.addEventListener("submit", (event: Event) => {
      event.preventDefault();
      deps.applyWealthCalcModalResult();
    });
  }

  function bindInvestmentEvents() {
    el.investmentSubtabButtons.forEach((button: HTMLButtonElement) => {
      button.addEventListener("click", () => {
        const nextTab = String(button.dataset.investmentTab || "");
        if (!deps.isInvestmentSubTab(nextTab)) return;
        ui.investmentTab = nextTab;
        deps.renderInvestmentTabState();
      });
    });

    el.investmentReturnModeButtons.forEach((button: HTMLButtonElement) => {
      button.addEventListener("click", () => {
        const mode = String(button.dataset.returnMode || "");
        if (mode !== "simple" && mode !== "twr") return;
        ui.investmentReturnMode = mode;
        deps.renderInvestmentReturnModeToggle();
        deps.renderInvestmentDashboard();
      });
    });

    el.investmentMonth.addEventListener("change", () => {
      ui.investmentMonth = parseIntSafe(
        el.investmentMonth.value,
        ui.investmentMonth,
      );
      deps.renderInvestment();
    });

    el.investmentYearFilter.addEventListener("change", () => {
      const state = deps.getState();
      ui.investmentYearFilter = parseIntSafe(
        el.investmentYearFilter.value,
        state.year,
      );
      ui.investmentTxEditingId = "";
      deps.renderInvestmentTransactionsTable();
    });

    el.investmentOnlyUndeclared.addEventListener("change", () => {
      ui.investmentOnlyUndeclared = Boolean(
        el.investmentOnlyUndeclared.checked,
      );
      ui.investmentTxEditingId = "";
      deps.renderInvestmentTransactionsTable();
    });

    [
      el.investmentMovementSide,
      el.investmentMovementCategory,
      el.investmentMovementUnitPrice,
      el.investmentMovementUnits,
      el.investmentMovementFee,
    ].forEach((control: HTMLElement) => {
      control.addEventListener(
        "input",
        deps.syncInvestmentMovementComputedAmount,
      );
      control.addEventListener(
        "change",
        deps.syncInvestmentMovementComputedAmount,
      );
    });
    el.investmentMovementSymbol.addEventListener(
      "input",
      deps.syncInvestmentMovementComputedAmount,
    );
    el.investmentMovementSymbol.addEventListener(
      "change",
      deps.normalizeInvestmentMovementSymbolField,
    );
    el.investmentMovementSymbol.addEventListener(
      "blur",
      deps.normalizeInvestmentMovementSymbolField,
    );

    el.investmentMovementBroker.addEventListener("change", () => {
      deps.syncInvestmentMovementCategoryField();
      deps.syncInvestmentMovementComputedAmount();
    });

    el.investmentMovementForm.addEventListener("submit", (event: Event) => {
      event.preventDefault();
      const state = deps.getState();
      const form = new FormData(el.investmentMovementForm);
      const side = normalizeInvestmentSide(form.get("side"));
      const symbol = normalizeInvestmentSymbol(form.get("symbol"));
      const rawCategory = String(form.get("category") || "").trim();
      const date = String(form.get("date") || "").trim() || todayISO();
      const accountId = String(form.get("accountId") || "").trim();
      const time = String(form.get("time") || "").trim();
      const movementCurrency = String(
        form.get("movementCurrency") || state.currency || "EUR",
      )
        .trim()
        .toUpperCase()
        .slice(0, 3);
      const declared = Boolean(form.get("declared"));

      if (!accountId || !symbol || !time) {
        deps.showToast("Completa broker, hora y símbolo.");
        return;
      }

      const computed = computeInvestmentMovement({
        side,
        symbol,
        units: parseFloatSafe(form.get("units"), 0),
        unitPrice: parseFloatSafe(form.get("unitPrice"), 0),
        fee: parseFloatSafe(form.get("fee"), 0),
      });
      const category = deps.resolveInvestmentCategory(
        accountId,
        rawCategory,
        computed.normalizedSymbol,
      );

      if (
        computed.normalizedUnits <= 0 ||
        computed.normalizedUnitPrice <= 0 ||
        computed.signedAmount === 0
      ) {
        deps.showToast("Precio, títulos y gasto deben ser válidos.");
        return;
      }

      state.transactions.push({
        id: uid("tx"),
        date,
        month: monthFromISO(date) ?? ui.investmentMonth,
        type: "investment",
        accountId,
        category,
        description: computed.description,
        amount: computed.signedAmount,
        time,
        symbol: computed.normalizedSymbol,
        side,
        unitPrice: computed.normalizedUnitPrice,
        units: computed.normalizedUnits,
        fee: computed.normalizedFee,
        movementCurrency,
        declared,
      });

      deps.sortTransactions();
      deps.saveState();

      const selectedDate = date;
      const selectedTime = time;
      const selectedBroker = accountId;
      const selectedCurrency = movementCurrency || state.currency || "EUR";

      el.investmentMovementForm.reset();
      el.investmentMovementDate.value = selectedDate;
      el.investmentMovementTime.value = selectedTime;
      el.investmentMovementBroker.value = selectedBroker;
      el.investmentMovementCurrency.value = selectedCurrency;
      el.investmentMovementSide.value = side;
      el.investmentMovementFee.value = "0";
      el.investmentMovementDeclared.checked = false;
      deps.syncInvestmentMovementCategoryField();
      deps.syncInvestmentMovementComputedAmount();

      deps.renderAll();
      deps.showToast("Movimiento de inversión guardado.");
    });

    el.investmentTxBody.addEventListener("click", (event: Event) => {
      const state = deps.getState();
      const target = deps.getEventElement(event.target);
      const actionButton = target?.closest<HTMLButtonElement>(
        "button[data-action]",
      );
      if (actionButton) {
        const action = actionButton.dataset.action;
        const id = actionButton.dataset.id;
        if (!id) return;
        if (action === "edit-investment-tx") {
          ui.investmentTxEditingId = id;
          deps.renderInvestmentTransactionsTable();
          return;
        }
        if (action === "cancel-edit-investment-tx") {
          ui.investmentTxEditingId = "";
          deps.renderInvestmentTransactionsTable();
          return;
        }
        if (action === "save-edit-investment-tx") {
          deps.saveEditedInvestmentTransactionRow(id);
          return;
        }
        if (action === "toggle-investment-declared") {
          const tx = state.transactions.find(
            (item) => item.id === id && item.type === "investment",
          );
          if (!tx) return;
          tx.declared = !tx.declared;
          deps.saveState();
          deps.renderInvestmentTransactionsTable();
          deps.showToast(
            tx.declared
              ? "Movimiento marcado como declarado."
              : "Movimiento marcado como no declarado.",
          );
          return;
        }
      }

      const deleteButton = target?.closest<HTMLButtonElement>(
        "button[data-delete-id]",
      );
      if (!deleteButton) return;
      const id = deleteButton.dataset.deleteId;
      state.transactions = state.transactions.filter(
        (item) => item.id !== id,
      );
      ui.investmentTxEditingId = "";
      deps.saveState();
      deps.renderAll();
      deps.showToast("Movimiento eliminado.");
    });

    el.investmentTxBody.addEventListener("change", (event: Event) => {
      const target = deps.getEventElement(event.target);
      const accountSelect = target?.closest<HTMLSelectElement>(
        'select[data-edit-field="accountId"]',
      );
      if (!accountSelect) {
        return;
      }

      const row = accountSelect.closest<HTMLTableRowElement>(
        "tr[data-investment-editing-id]",
      );
      const categorySelect = row?.querySelector<HTMLSelectElement>(
        'select[data-edit-field="category"]',
      );
      if (!row || !categorySelect) {
        return;
      }

      const accountId = String(accountSelect.value || "").trim();
      const resolvedCategory = deps.resolveInvestmentCategory(
        accountId,
        categorySelect.value,
        "Sin categoría",
      );
      const isCryptoOnly = resolvedCategory === "Crypto";

      if (
        isCryptoOnly &&
        !Array.from(categorySelect.options).some(
          (option) => option.value === "Crypto",
        )
      ) {
        categorySelect.insertAdjacentHTML(
          "afterbegin",
          '<option value="Crypto">Crypto</option>',
        );
      }

      categorySelect.value = resolvedCategory;
      categorySelect.disabled = isCryptoOnly;
      if (isCryptoOnly) {
        categorySelect.setAttribute("aria-disabled", "true");
      } else {
        categorySelect.removeAttribute("aria-disabled");
      }
    });

    el.contributionBody.addEventListener("input", (event: Event) => {
      const target = deps.getEventElement(event.target);
      const input = target?.closest<HTMLInputElement>(
        "input[data-contribution-flow-date]",
      );
      if (!input) return;
      const date = String(input.dataset.contributionFlowDate || "");
      if (!date) return;
      const flow = round2(parseFloatSafe(input.value, 0));
      deps.upsertContributionFlowForDate(date, flow);
      deps.saveState();
      deps.renderContributionsTable();
    });

    el.contributionBody.addEventListener("click", (event: Event) => {
      const target = deps.getEventElement(event.target);
      const deleteButton = target?.closest<HTMLButtonElement>(
        "button[data-delete-contribution-date]",
      );
      if (!deleteButton) {
        return;
      }

      const date = String(
        deleteButton.dataset.deleteContributionDate || "",
      ).trim();
      if (!date || !deps.isManualContributionDate(date)) {
        return;
      }
      openContributionDeleteDialog(date);
    });

    el.openContributionWorkflow.addEventListener(
      "click",
      deps.openContributionWorkflowModal,
    );
    el.contributionWorkflowClose.addEventListener(
      "click",
      deps.closeContributionWorkflowModal,
    );

    el.contributionWorkflowDialog.addEventListener("cancel", (event: Event) => {
      event.preventDefault();
      deps.closeContributionWorkflowModal();
    });

    el.contributionWorkflowMonth.addEventListener("change", () => {
      const state = deps.getState();
      ui.contributionWorkflowMonth = parseIntSafe(
        el.contributionWorkflowMonth.value,
        ui.contributionWorkflowMonth,
      );
      ui.contributionWorkflowDate = toSnapshotDate(
        state.year,
        ui.contributionWorkflowMonth,
      );
      el.contributionWorkflowDate.value = ui.contributionWorkflowDate;
      deps.renderContributionWorkflowModal();
    });

    el.contributionWorkflowDate.addEventListener("change", () => {
      ui.contributionWorkflowDate = String(
        el.contributionWorkflowDate.value || "",
      ).trim();
      const month = monthFromISO(ui.contributionWorkflowDate);
      if (month !== null) {
        ui.contributionWorkflowMonth = month;
        el.contributionWorkflowMonth.value = String(month);
      }
      deps.renderContributionWorkflowModal();
    });

    el.contributionWorkflowPrev.addEventListener("click", () => {
      ui.contributionWorkflowStep = 1;
      deps.renderContributionWorkflowStepState();
      deps.renderContributionWorkflowModalWarnings();
    });

    el.contributionWorkflowNext.addEventListener("click", () => {
      ui.contributionWorkflowStep = 2;
      deps.renderContributionWorkflowStepState();
      deps.renderContributionWorkflowModalWarnings();
    });

    el.contributionWorkflowTotal.addEventListener("input", () => {
      ui.contributionWorkflowAmount = round2(
        parseFloatSafe(el.contributionWorkflowTotal.value, 0),
      );
      deps.renderContributionWorkflowModalWarnings();
    });

    el.contributionWorkflowDialog.addEventListener("input", (event: Event) => {
      const target = deps.getEventElement(event.target);
      const snapshotInput = target?.closest<HTMLInputElement>(
        "input[data-contribution-snapshot-kind]",
      );
      if (snapshotInput) {
        deps.renderContributionWorkflowModalWarnings();
        return;
      }
      const allocationInput = target?.closest<HTMLInputElement>(
        "input[data-contribution-allocation-account-id]",
      );
      if (allocationInput) deps.renderContributionWorkflowModalWarnings();
    });

    el.contributionWorkflowDialog.addEventListener("click", (event: Event) => {
      const target = deps.getEventElement(event.target);
      const calcButton = target?.closest<HTMLButtonElement>(
        'button[data-action="open-contribution-snapshot-calc"]',
      );
      if (!calcButton) return;
      const kind = String(calcButton.dataset.snapshotKind || "");
      const itemId = String(calcButton.dataset.snapshotId || "");
      const itemName = String(calcButton.dataset.itemName || "");
      if (!kind || !itemId || !itemName || !deps.isSnapshotKind(kind)) return;
      deps.openContributionCalcModal(kind, itemId, itemName);
    });

    el.contributionCalcClose.addEventListener(
      "click",
      deps.closeContributionCalcModal,
    );
    el.contributionCalcDialog.addEventListener("cancel", (event: Event) => {
      event.preventDefault();
      deps.closeContributionCalcModal();
    });
    el.contributionCalcForm.addEventListener("submit", (event: Event) => {
      event.preventDefault();
      deps.applyContributionCalcModalResult();
    });
    el.contributionWorkflowForm.addEventListener("submit", (event: Event) => {
      event.preventDefault();
      if (ui.contributionWorkflowStep !== 2) {
        return;
      }
      deps.saveContributionFromWorkflowModal();
    });
    el.contributionDeleteClose.addEventListener(
      "click",
      closeContributionDeleteDialog,
    );
    el.contributionDeleteCancel.addEventListener(
      "click",
      closeContributionDeleteDialog,
    );
    el.contributionDeleteDialog.addEventListener("cancel", (event: Event) => {
      event.preventDefault();
      closeContributionDeleteDialog();
    });
    el.contributionDeleteForm.addEventListener("submit", (event: Event) => {
      event.preventDefault();
      confirmContributionDelete();
    });
  }

  return { bindWealthEvents, bindInvestmentEvents };
}
