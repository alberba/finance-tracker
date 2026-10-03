import type { UiState } from "./ui-state";
import { type Entity, type InvestmentSide, type SnapshotKind, type State, type Transaction } from "../types";
import { computeInvestmentMovement, normalizeInvestmentSide, normalizeInvestmentSymbol } from "../investment-movements";
import { evaluateNumericExpression } from "../math-expression";
import { escapeAttr, escapeHtml, monthFromISO, parseFloatSafe, round2 } from "../utils";

interface InvestmentSnapshotHelpersElements {
  investmentTxBody: HTMLElement;
  snapshotInvestments: HTMLElement;
  wealthCalcDialog: HTMLDialogElement;
  wealthCalcExpression: HTMLInputElement;
  wealthCalcTitle: HTMLElement;
}

interface InvestmentSnapshotHelpersDeps {
  getState: () => State;
  ui: UiState;
  el: InvestmentSnapshotHelpersElements;
  getEventElement: (target: EventTarget | null) => Element | null;
  getSnapshotValue: (kind: SnapshotKind, month: number, itemId: string) => number | null;
  resolveInvestmentCategory: (accountId: string, rawCategory: string, fallbackCategory: string) => string;
  sortTransactions: () => void;
  saveState: () => void;
  renderAll: () => void;
  showToast: (message: string) => void;
  formatMoney: (value: number) => string;
  isSnapshotKind: (value: string) => value is SnapshotKind;
}

export function setupInvestmentSnapshotHelpers(deps: InvestmentSnapshotHelpersDeps) {
  const { ui, el } = deps;

  function saveEditedInvestmentTransactionRow(id: string) {
    const state = deps.getState();
    const row = el.investmentTxBody.querySelector(`tr[data-investment-editing-id="${id}"]`);
    if (!row) return;

    const tx = state.transactions.find((item): item is Transaction => item.id === id && item.type === "investment");
    if (!tx) return;

    const dateInput = row.querySelector<HTMLInputElement>('[data-edit-field="date"]');
    const timeInput = row.querySelector<HTMLInputElement>('[data-edit-field="time"]');
    const sideInput = row.querySelector<HTMLSelectElement>('[data-edit-field="side"]');
    const symbolInput = row.querySelector<HTMLInputElement>('[data-edit-field="symbol"]');
    const categoryInput = row.querySelector<HTMLSelectElement>('[data-edit-field="category"]');
    const unitPriceInput = row.querySelector<HTMLInputElement>('[data-edit-field="unitPrice"]');
    const unitsInput = row.querySelector<HTMLInputElement>('[data-edit-field="units"]');
    const feeInput = row.querySelector<HTMLInputElement>('[data-edit-field="fee"]');
    const currencyInput = row.querySelector<HTMLInputElement>('[data-edit-field="movementCurrency"]');
    const accountInput = row.querySelector<HTMLSelectElement>('[data-edit-field="accountId"]');
    const declaredInput = row.querySelector<HTMLInputElement>('[data-edit-field="declared"]');

    if (!dateInput || !timeInput || !sideInput || !symbolInput || !categoryInput || !unitPriceInput || !unitsInput || !feeInput || !currencyInput || !accountInput || !declaredInput) {
      return;
    }

    const date = String(dateInput.value || "").trim();
    const time = String(timeInput.value || "").trim();
    const side: InvestmentSide = normalizeInvestmentSide(sideInput.value);
    const symbol = normalizeInvestmentSymbol(symbolInput.value);
    const movementCurrency = String(currencyInput.value || state.currency || "EUR").trim().toUpperCase().slice(0, 3);
    const accountId = String(accountInput.value || "").trim();
    const rawCategory = String(categoryInput.value || "").trim();
    const declared = Boolean(declaredInput.checked);

    if (!date || !time || !symbol || !accountId) {
      deps.showToast("Completa fecha, hora, símbolo y broker.");
      return;
    }

    const computed = computeInvestmentMovement({
      side,
      symbol,
      units: parseFloatSafe(unitsInput.value, 0),
      unitPrice: parseFloatSafe(unitPriceInput.value, 0),
      fee: parseFloatSafe(feeInput.value, 0),
    });

    if (computed.normalizedUnits <= 0 || computed.normalizedUnitPrice <= 0 || computed.signedAmount === 0) {
      deps.showToast("Precio, títulos y gasto deben ser válidos.");
      return;
    }

    tx.date = date;
    tx.month = monthFromISO(date) ?? tx.month;
    tx.time = time;
    tx.accountId = accountId;
    tx.side = side;
    tx.symbol = computed.normalizedSymbol;
    tx.category = deps.resolveInvestmentCategory(accountId, rawCategory, computed.normalizedSymbol);
    tx.unitPrice = computed.normalizedUnitPrice;
    tx.units = computed.normalizedUnits;
    tx.fee = computed.normalizedFee;
    tx.movementCurrency = movementCurrency;
    tx.description = computed.description;
    tx.amount = computed.signedAmount;
    tx.declared = declared;

    ui.investmentTxEditingId = "";
    deps.sortTransactions();
    deps.saveState();
    deps.renderAll();
    deps.showToast("Movimiento de inversión actualizado.");
  }

  function renderInvestmentEditingTransactionRow(item: Transaction) {
    const state = deps.getState();
    const selectedAccount = state.accounts.find((account) => account.id === item.accountId);
    const isBitvavoBroker = String(selectedAccount?.name || "").trim().toLowerCase() === "bitvavo";
    const accountOptions = state.accounts
      .map((account) => {
        const selected = account.id === item.accountId ? "selected" : "";
        return `<option value="${escapeAttr(account.id)}" ${selected}>${escapeHtml(account.name)}</option>`;
      })
      .join("");
    const availableCategories = Array.from(new Set([...state.investmentCategories, item.category || "Sin categoría", "Crypto"])).filter(Boolean);
    const categoryOptions = availableCategories.map((category) => {
      const selected = category === item.category ? "selected" : "";
      return `<option value="${escapeAttr(category)}" ${selected}>${escapeHtml(category)}</option>`;
    }).join("");

    const side = item.side === "sell" ? "sell" : "buy";
    const symbol = item.symbol || item.category || "";
    const unitPrice = Number.isFinite(item.unitPrice) ? Number(item.unitPrice) : 0;
    const units = Number.isFinite(item.units) ? Number(item.units) : 0;
    const fee = Number.isFinite(item.fee) ? Number(item.fee) : 0;
    const movementCurrency = String(item.movementCurrency || state.currency || "EUR").toUpperCase().slice(0, 3);
    const declared = Boolean(item.declared);

    return `
      <tr data-investment-editing-id="${escapeAttr(item.id)}">
        <td><input type="date" name="editInvestmentDate" data-edit-field="date" value="${escapeAttr(item.date)}" /></td>
        <td><input type="time" name="editInvestmentTime" data-edit-field="time" value="${escapeAttr(item.time || "00:00")}" /></td>
        <td><select name="editInvestmentSide" data-edit-field="side"><option value="buy" ${side === "buy" ? "selected" : ""}>Compra</option><option value="sell" ${side === "sell" ? "selected" : ""}>Venta</option></select></td>
        <td><input type="text" name="editInvestmentSymbol" data-edit-field="symbol" value="${escapeAttr(symbol)}" /></td>
        <td><select name="editInvestmentCategory" data-edit-field="category" ${isBitvavoBroker ? 'disabled aria-disabled="true"' : ""}>${categoryOptions}</select></td>
        <td><input type="number" name="editInvestmentUnitPrice" step="0.0001" min="0" data-edit-field="unitPrice" value="${unitPrice}" /></td>
        <td><input type="number" name="editInvestmentUnits" step="0.00000001" min="0" data-edit-field="units" value="${units}" /></td>
        <td><input type="number" name="editInvestmentFee" step="0.01" min="0" data-edit-field="fee" value="${fee}" /></td>
        <td><input type="number" name="editInvestmentAmount" step="0.01" data-edit-field="amount" value="${item.amount}" readonly /></td>
        <td><input type="text" name="editInvestmentCurrency" maxlength="3" data-edit-field="movementCurrency" value="${escapeAttr(movementCurrency)}" /></td>
        <td><select name="editInvestmentBroker" data-edit-field="accountId">${accountOptions}</select></td>
        <td><input type="checkbox" name="editInvestmentDeclared" data-edit-field="declared" ${declared ? "checked" : ""} aria-label="Movimiento declarado" /></td>
        <td><div class="inline-actions"><button type="button" class="inline-save-btn icon-action-btn" data-action="save-edit-investment-tx" data-id="${escapeAttr(item.id)}" aria-label="Guardar"><svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"></path></svg></button><button type="button" class="inline-cancel-btn icon-action-btn" data-action="cancel-edit-investment-tx" data-id="${escapeAttr(item.id)}" aria-label="Cancelar"><svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z"></path></svg></button></div></td>
      </tr>
    `;
  }

  function renderSnapshotRows(items: Entity[], kind: SnapshotKind, month: number, computeFn: (itemId: string) => number) {
    if (!items.length) return "<tr><td colspan='4'>No hay elementos configurados.</td></tr>";
    return items
      .map((item) => {
        const opening = round2(item.openingBalance || 0);
        const calculated = round2(computeFn(item.id));
        const currentSnapshot = deps.getSnapshotValue(kind, month, item.id);
        return `
          <tr>
            <td>${escapeHtml(item.name)}</td>
            <td>${deps.formatMoney(opening)}</td>
            <td>${deps.formatMoney(calculated)}</td>
            <td>
              <div class="snapshot-field-stack">
                <input type="number" name="snapshot-${escapeAttr(kind)}-${escapeAttr(item.id)}" autocomplete="off" step="0.01" data-snapshot-kind="${escapeAttr(kind)}" data-snapshot-id="${escapeAttr(item.id)}" value="${currentSnapshot ?? ""}" placeholder="Auto" aria-label="Snapshot de ${escapeAttr(item.name)}" />
                ${renderInvestmentSnapshotCalcAction(kind, item.id, item.name)}
              </div>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function renderInvestmentSnapshotCalcAction(kind: SnapshotKind, itemId: string, itemName: string) {
    if (kind !== "investments") return "";
    return `<button type="button" class="tx-btn-secondary snapshot-calc-btn" data-action="open-investment-calc-modal" data-snapshot-id="${escapeAttr(itemId)}" data-item-name="${escapeAttr(itemName)}" aria-label="Abrir cálculo de ${escapeAttr(itemName)}">Calcular</button>`;
  }

  function onOpenInvestmentSnapshotCalcModal(event: Event) {
    const target = deps.getEventElement(event.target);
    const button = target?.closest<HTMLButtonElement>('button[data-action="open-investment-calc-modal"]');
    if (!button) return;
    const targetId = String(button.dataset.snapshotId || "").trim();
    const targetName = String(button.dataset.itemName || "").trim();
    if (!targetId || !targetName) return;
    ui.wealthCalcTargetId = targetId;
    ui.wealthCalcTargetName = targetName;
    el.wealthCalcTitle.textContent = `Calcular snapshot · ${targetName}`;
    el.wealthCalcExpression.value = "";
    el.wealthCalcDialog.showModal();
    window.setTimeout(() => el.wealthCalcExpression.focus(), 0);
  }

  function closeWealthCalcModal() {
    if (el.wealthCalcDialog.open) el.wealthCalcDialog.close();
    ui.wealthCalcTargetId = "";
    ui.wealthCalcTargetName = "";
    el.wealthCalcExpression.value = "";
    el.wealthCalcTitle.textContent = "Calcular snapshot";
  }

  function applyWealthCalcModalResult() {
    if (!ui.wealthCalcTargetId) {
      closeWealthCalcModal();
      return;
    }
    const evaluated = evaluateNumericExpression(el.wealthCalcExpression.value);
    if (evaluated === null) {
      deps.showToast("El cálculo no es válido.");
      el.wealthCalcExpression.focus();
      return;
    }
    const snapshotInput = el.snapshotInvestments.querySelector<HTMLInputElement>(
      `input[data-snapshot-kind="investments"][data-snapshot-id="${CSS.escape(ui.wealthCalcTargetId)}"]`
    );
    if (!snapshotInput) {
      deps.showToast("No se pudo aplicar el resultado.");
      closeWealthCalcModal();
      return;
    }
    snapshotInput.value = String(round2(evaluated));
    deps.showToast("Resultado aplicado al snapshot.");
    closeWealthCalcModal();
  }

  function saveSnapshotFromTable() {
    const state = deps.getState();
    const month = ui.snapshotMonth;
    const rows = document.querySelectorAll<HTMLInputElement>("[data-snapshot-kind]");
    if (!state.snapshots[String(month)]) {
      state.snapshots[String(month)] = { month, accounts: {}, investments: {}, liabilities: {} };
    }
    const snapshot = state.snapshots[String(month)];
    rows.forEach((input) => {
      const kind = input.dataset.snapshotKind;
      const itemId = input.dataset.snapshotId;
      const numeric = parseFloatSafe(input.value, NaN);
      if (!kind || !itemId || !deps.isSnapshotKind(kind)) return;
      if (Number.isNaN(numeric)) delete snapshot[kind][itemId];
      else snapshot[kind][itemId] = round2(numeric);
    });
    deps.saveState();
    deps.renderAll();
    deps.showToast("Snapshot guardado.");
  }

  return { saveEditedInvestmentTransactionRow, renderInvestmentEditingTransactionRow, renderSnapshotRows, onOpenInvestmentSnapshotCalcModal, closeWealthCalcModal, applyWealthCalcModalResult, saveSnapshotFromTable };
}
