import {
  isCategoryKey,
  isEntityKey,
  type BudgetType,
  type CategoryKey,
  type EntityKey,
  type State,
} from "../types";
import { decorateCategoryLabel } from "../category-emoji";
import { escapeAttr, escapeHtml, parseFloatSafe, parseIntSafe, round2, slug } from "../utils";

interface SettingsDataSectionDeps {
  getState: () => State;
  setState: (nextState: State) => void;
  el: any;
  saveState: () => void;
  renderAll: () => void;
  showToast: (message: string) => void;
  getEventElement: (target: EventTarget | null) => Element | null;
  normalizeState: (candidate: unknown) => State;
  clone: <T>(value: T) => T;
  baseSeed: State;
}

export function setupSettingsDataSection(deps: SettingsDataSectionDeps) {
  const { el } = deps;

  function bindSettingsEvents() {
    el.saveSettingsMain.addEventListener("click", () => {
      const state = deps.getState();
      state.year = parseIntSafe(el.settingsYear.value, state.year);
      state.currency = String(el.settingsCurrency.value || state.currency || "EUR")
        .toUpperCase()
        .slice(0, 3);
      el.yearDisplay.value = String(state.year);
      deps.saveState();
      deps.renderAll();
      deps.showToast("Configuración general guardada.");
    });

    el.addAccountForm.addEventListener("submit", (event: Event) => {
      event.preventDefault();
      addEntityFromForm(event.currentTarget as HTMLFormElement, "accounts");
    });
    el.addInvestmentForm.addEventListener("submit", (event: Event) => {
      event.preventDefault();
      addEntityFromForm(event.currentTarget as HTMLFormElement, "investmentAssets");
      syncInvestmentCategoriesWithAssets();
    });
    el.addLiabilityForm.addEventListener("submit", (event: Event) => {
      event.preventDefault();
      addEntityFromForm(event.currentTarget as HTMLFormElement, "liabilities");
    });

    bindCategoryAddForm(el.addIncomeCategory, "incomeCategories");
    bindCategoryAddForm(el.addExpenseCategory, "expenseCategories");
    bindCategoryAddForm(el.addInvestmentCategory, "investmentCategories");

    [el.settingsAccounts, el.settingsInvestments, el.settingsLiabilities].forEach((container: HTMLElement) => {
      container.addEventListener("change", onEntityEditorInput);
      container.addEventListener("click", onEntityEditorDelete);
    });
    [el.incomeTags, el.expenseTags, el.investmentTags].forEach((container: HTMLElement) => {
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
      deps.setState(deps.normalizeState(deps.clone(deps.baseSeed)));
      deps.saveState();
      deps.renderAll();
      deps.showToast("Tracker reiniciado con datos semilla.");
    });
  }

  function renderSettings() {
    const state = deps.getState();
    el.settingsYear.value = String(state.year);
    el.settingsCurrency.value = String(state.currency || "EUR");

    renderEntityEditor("accounts", el.settingsAccounts);
    renderEntityEditor("investmentAssets", el.settingsInvestments);
    renderEntityEditor("liabilities", el.settingsLiabilities);

    el.incomeTags.innerHTML = renderCategoryTags("incomeCategories");
    el.expenseTags.innerHTML = renderCategoryTags("expenseCategories");
    el.investmentTags.innerHTML = renderCategoryTags("investmentCategories");
  }

  function renderDataTab() {
    const state = deps.getState();
    el.dataTotalTransactions.textContent = String(state.transactions.length);
    el.dataTotalSnapshots.textContent = String(Object.keys(state.snapshots || {}).length);
    el.dataTotalContributions.textContent = String(state.contributions.length);

    const source = state.meta?.source || "desconocido";
    const generated = state.meta?.generatedAt || "";
    const savedAt = state.meta?.savedAt || "";
    el.dataMeta.textContent = `Origen: ${source} | Seed: ${generated} | Último guardado local: ${savedAt || "-"}`;
  }

  function renderEntityEditor(key: EntityKey, container: HTMLElement) {
    const state = deps.getState();
    const list = state[key];
    if (!list.length) {
      container.innerHTML = "<p class='list-item'><small>Sin elementos.</small></p>";
      return;
    }

    container.innerHTML = list
      .map(
        (item: any) => `
          <div class="list-item" data-entity="${escapeAttr(key)}" data-id="${escapeAttr(item.id)}">
            <input type="text" name="${escapeAttr(key)}-${escapeAttr(item.id)}-name" autocomplete="off" data-field="name" value="${escapeAttr(item.name)}" aria-label="Nombre ${escapeAttr(item.name)}" />
            <input type="number" name="${escapeAttr(key)}-${escapeAttr(item.id)}-openingBalance" autocomplete="off" data-field="openingBalance" step="0.01" value="${Number(item.openingBalance || 0)}" aria-label="Saldo inicial de ${escapeAttr(item.name)}" />
            <button class="delete-btn" data-action="remove-entity" data-entity="${escapeAttr(key)}" data-id="${escapeAttr(item.id)}" aria-label="Eliminar ${escapeAttr(item.name)}">Eliminar</button>
          </div>
        `
      )
      .join("");
  }

  function renderCategoryTags(key: CategoryKey) {
    const state = deps.getState();
    const list = state[key] || [];
    if (!list.length) {
      return "<small>Sin categorías.</small>";
    }

    return list
      .map(
        (item: any) => `
          <span class="tag">
            ${escapeHtml(decorateCategoryLabel(categoryKeyToType(key), item))}
            <button class="icon-btn" data-action="remove-category" data-target="${escapeAttr(key)}" data-name="${escapeAttr(item)}" aria-label="Eliminar categoría ${escapeAttr(item)}">×</button>
          </span>
        `
      )
      .join("");
  }

  function categoryKeyToType(key: CategoryKey): BudgetType {
    if (key === "incomeCategories") {
      return "income";
    }
    if (key === "expenseCategories") {
      return "expense";
    }
    return "investment";
  }

  function addEntityFromForm(formElement: HTMLFormElement, targetKey: EntityKey) {
    const state = deps.getState();
    const form = new FormData(formElement);
    const name = String(form.get("name") || "").trim();
    const openingBalance = round2(parseFloatSafe(form.get("openingBalance"), 0));

    if (!name) {
      deps.showToast("Indica un nombre.");
      return;
    }

    const id = slug(name);
    const exists = state[targetKey].some((item: any) => item.id === id);
    if (exists) {
      deps.showToast("Ese elemento ya existe.");
      return;
    }

    state[targetKey].push({ id, name, openingBalance });
    formElement.reset();
    deps.saveState();
    deps.renderAll();
    deps.showToast("Elemento agregado.");
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

    const state = deps.getState();
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

    deps.saveState();
    deps.renderAll();
  }

  function onEntityEditorDelete(event: Event) {
    const target = deps.getEventElement(event.target);
    const button = target?.closest<HTMLElement>("button[data-action='remove-entity']");
    if (!button) {
      return;
    }

    const entity = button.dataset.entity;
    const id = button.dataset.id;
    if (!entity || !id || !isEntityKey(entity)) {
      return;
    }

    const state = deps.getState();
    const list = state[entity];
    state[entity] = list.filter((item: any) => item.id !== id);

    if (entity === "accounts") {
      state.transactions = state.transactions.filter((tx: any) => tx.accountId !== id);
    }
    if (entity === "investmentAssets") {
      syncInvestmentCategoriesWithAssets();
    }

    deps.saveState();
    deps.renderAll();
    deps.showToast("Elemento eliminado.");
  }

  function bindCategoryAddForm(formElement: HTMLFormElement, key: CategoryKey) {
    formElement.addEventListener("submit", (event: Event) => {
      event.preventDefault();
      const state = deps.getState();
      const form = new FormData(formElement);
      const name = String(form.get("name") || "").trim();
      if (!name) {
        return;
      }

      if (!state[key].includes(name)) {
        state[key].push(name);
      }

      formElement.reset();
      deps.saveState();
      deps.renderAll();
      deps.showToast("Categoría agregada.");
    });
  }

  function onCategoryDelete(event: Event) {
    const target = deps.getEventElement(event.target);
    const button = target?.closest<HTMLElement>("button[data-action='remove-category']");
    if (!button) {
      return;
    }

    const key = button.dataset.target;
    const name = button.dataset.name;
    if (!key || !name || !isCategoryKey(key)) {
      return;
    }

    const state = deps.getState();
    state[key] = state[key].filter((item: any) => item !== name);
    if (key === "investmentCategories") {
      // no-op
    }

    deps.saveState();
    deps.renderAll();
    deps.showToast("Categoría eliminada.");
  }

  function syncInvestmentCategoriesWithAssets() {
    const state = deps.getState();
    const assetNames = state.investmentAssets.map((item: any) => item.name);
    const merged = Array.from(new Set([...(state.investmentCategories || []), ...assetNames]));
    state.investmentCategories = merged;
  }

  function exportStateAsJson() {
    const state = deps.getState();
    const payload = JSON.stringify(state, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    downloadUrl(url, `finance-tracker-${state.year}.json`);
    URL.revokeObjectURL(url);
    deps.showToast("JSON exportado.");
  }

  function importStateFromJson(event: Event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    const file = target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || "{}"));
        deps.setState(deps.normalizeState(data));
        deps.saveState();
        deps.renderAll();
        deps.showToast("JSON importado correctamente.");
      } catch (error) {
        deps.showToast("No se pudo importar el archivo.");
      } finally {
        el.importJson.value = "";
      }
    };
    reader.readAsText(file, "utf-8");
  }

  function exportTransactionsCsv() {
    const state = deps.getState();
    const header = [
      "id",
      "date",
      "month",
      "type",
      "accountId",
      "category",
      "description",
      "amount",
      "time",
      "symbol",
      "side",
      "unitPrice",
      "units",
      "fee",
      "movementCurrency",
      "declared",
    ];
    const rows = state.transactions.map((item: any) => [
      item.id,
      item.date,
      item.month,
      item.type,
      item.accountId,
      item.category,
      item.description,
      item.amount,
      item.time || "",
      item.symbol || "",
      item.side || "",
      Number.isFinite(item.unitPrice) ? item.unitPrice : "",
      Number.isFinite(item.units) ? item.units : "",
      Number.isFinite(item.fee) ? item.fee : "",
      item.movementCurrency || "",
      item.declared ? "true" : "false",
    ]);

    const csv = [header, ...rows]
      .map((row: any) => row.map((field: any) => `"${String(field ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    downloadUrl(url, `movimientos-${state.year}.csv`);
    URL.revokeObjectURL(url);
    deps.showToast("CSV exportado.");
  }

  function downloadUrl(url: string, filename: string) {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
  }

  return {
    bindSettingsEvents,
    bindDataEvents,
    renderSettings,
    renderDataTab,
  };
}
