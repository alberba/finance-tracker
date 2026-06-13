import {
  isCategoryKey,
  isEntityKey,
  type BudgetType,
  type CategoryKey,
  type Entity,
  type EntityKey,
  type State,
} from "../types";
import { decorateCategoryLabel } from "../category-emoji";
import {
  escapeAttr,
  escapeHtml,
  parseFloatSafe,
  parseIntSafe,
  round2,
  slug,
} from "../utils";

interface SettingsDataSectionDeps {
  getState: () => State;
  el: SettingsDataElements;
  saveState: () => void;
  renderAll: () => void;
  showToast: (message: string) => void;
  getEventElement: (target: EventTarget | null) => Element | null;
}

interface SettingsDataElements {
  saveSettingsMain: HTMLElement;
  settingsYear: HTMLInputElement;
  settingsCurrency: HTMLInputElement;
  addAccountForm: HTMLFormElement;
  addInvestmentForm: HTMLFormElement;
  addLiabilityForm: HTMLFormElement;
  addIncomeCategory: HTMLFormElement;
  addExpenseCategory: HTMLFormElement;
  addInvestmentCategory: HTMLFormElement;
  settingsAccounts: HTMLElement;
  settingsInvestments: HTMLElement;
  settingsLiabilities: HTMLElement;
  settingsTwrLiquidity: HTMLElement;
  incomeTags: HTMLElement;
  expenseTags: HTMLElement;
  investmentTags: HTMLElement;
}

export function setupSettingsDataSection(deps: SettingsDataSectionDeps) {
  const { el } = deps;

  function bindSettingsEvents() {
    el.saveSettingsMain.addEventListener("click", () => {
      const state = deps.getState();
      state.year = parseIntSafe(el.settingsYear.value, state.year);
      state.currency = String(
        el.settingsCurrency.value || state.currency || "EUR",
      )
        .toUpperCase()
        .slice(0, 3);
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
      addEntityFromForm(
        event.currentTarget as HTMLFormElement,
        "investmentAssets",
      );
      syncInvestmentCategoriesWithAssets();
    });
    el.addLiabilityForm.addEventListener("submit", (event: Event) => {
      event.preventDefault();
      addEntityFromForm(event.currentTarget as HTMLFormElement, "liabilities");
    });

    bindCategoryAddForm(el.addIncomeCategory, "incomeCategories");
    bindCategoryAddForm(el.addExpenseCategory, "expenseCategories");
    bindCategoryAddForm(el.addInvestmentCategory, "investmentCategories");

    [
      el.settingsAccounts,
      el.settingsInvestments,
      el.settingsLiabilities,
    ].forEach((container: HTMLElement) => {
      container.addEventListener("change", onEntityEditorInput);
      container.addEventListener("click", onEntityEditorDelete);
    });
    el.settingsTwrLiquidity.addEventListener(
      "change",
      onTwrLiquiditySelectionChange,
    );
    [el.incomeTags, el.expenseTags, el.investmentTags].forEach(
      (container: HTMLElement) => {
        container.addEventListener("click", onCategoryDelete);
      },
    );
  }

  function renderSettings() {
    const state = deps.getState();
    el.settingsYear.value = String(state.year);
    el.settingsCurrency.value = String(state.currency || "EUR");

    renderEntityEditor("accounts", el.settingsAccounts);
    renderEntityEditor("investmentAssets", el.settingsInvestments);
    renderEntityEditor("liabilities", el.settingsLiabilities);
    renderTwrLiquiditySelector();

    el.incomeTags.innerHTML = renderCategoryTags("incomeCategories");
    el.expenseTags.innerHTML = renderCategoryTags("expenseCategories");
    el.investmentTags.innerHTML = renderCategoryTags("investmentCategories");
  }

  function renderEntityEditor(key: EntityKey, container: HTMLElement) {
    const state = deps.getState();
    const list = state[key];
    if (!list.length) {
      container.innerHTML =
        "<p class='list-item'><small>Sin elementos.</small></p>";
      return;
    }

    container.innerHTML = list
      .map(
        (item: Entity) => `
          <div class="list-item" data-entity="${escapeAttr(key)}" data-id="${escapeAttr(item.id)}">
            <input type="text" name="${escapeAttr(key)}-${escapeAttr(item.id)}-name" autocomplete="off" data-field="name" value="${escapeAttr(item.name)}" aria-label="Nombre ${escapeAttr(item.name)}" />
            <input type="number" name="${escapeAttr(key)}-${escapeAttr(item.id)}-openingBalance" autocomplete="off" data-field="openingBalance" step="0.01" value="${Number(item.openingBalance || 0)}" aria-label="Saldo inicial de ${escapeAttr(item.name)}" />
            <button class="delete-btn" data-action="remove-entity" data-entity="${escapeAttr(key)}" data-id="${escapeAttr(item.id)}" aria-label="Eliminar ${escapeAttr(item.name)}">Eliminar</button>
          </div>
        `,
      )
      .join("");
  }

  function renderTwrLiquiditySelector() {
    const state = deps.getState();
    const selected = new Set(state.twrLiquidityAccountIds || []);
    const accounts = state.accounts || [];
    if (!accounts.length) {
      el.settingsTwrLiquidity.innerHTML =
        "<small>Sin cuentas disponibles.</small>";
      return;
    }

    el.settingsTwrLiquidity.innerHTML = accounts
      .map((account: Entity) => {
        const checked = selected.has(account.id) ? "checked" : "";
        return `
          <label class="tx-checkbox-option">
            <input type="checkbox" data-action="toggle-twr-liquidity-account" data-account-id="${escapeAttr(account.id)}" ${checked} />
            <span>${escapeHtml(account.name)}</span>
          </label>
        `;
      })
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
        (item: string) => `
          <span class="tag">
            ${escapeHtml(decorateCategoryLabel(categoryKeyToType(key), item))}
            <button class="icon-btn" data-action="remove-category" data-target="${escapeAttr(key)}" data-name="${escapeAttr(item)}" aria-label="Eliminar categoría ${escapeAttr(item)}">×</button>
          </span>
        `,
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

  function addEntityFromForm(
    formElement: HTMLFormElement,
    targetKey: EntityKey,
  ) {
    const state = deps.getState();
    const form = new FormData(formElement);
    const name = String(form.get("name") || "").trim();
    const openingBalance = round2(
      parseFloatSafe(form.get("openingBalance"), 0),
    );

    if (!name) {
      deps.showToast("Indica un nombre.");
      return;
    }

    const id = slug(name);
    const exists = state[targetKey].some((item) => item.id === id);
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
    const item = list.find((entry) => entry.id === id);
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
    const button = target?.closest<HTMLElement>(
      "button[data-action='remove-entity']",
    );
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
    state[entity] = list.filter((item) => item.id !== id);

    if (entity === "accounts") {
      state.transactions = state.transactions.filter(
        (tx) => tx.accountId !== id,
      );
      state.twrLiquidityAccountIds = (
        state.twrLiquidityAccountIds || []
      ).filter((accountId: string) => accountId !== id);
    }
    if (entity === "investmentAssets") {
      syncInvestmentCategoriesWithAssets();
    }

    deps.saveState();
    deps.renderAll();
    deps.showToast("Elemento eliminado.");
  }

  function onTwrLiquiditySelectionChange(event: Event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (target.dataset.action !== "toggle-twr-liquidity-account") {
      return;
    }
    const accountId = String(target.dataset.accountId || "").trim();
    if (!accountId) {
      return;
    }

    const state = deps.getState();
    const nextSelection = new Set(
      (state.twrLiquidityAccountIds || []).map((item) => String(item)),
    );
    if (target.checked) {
      nextSelection.add(accountId);
    } else {
      nextSelection.delete(accountId);
    }
    state.twrLiquidityAccountIds = Array.from(nextSelection);
    deps.saveState();
    deps.renderAll();
    deps.showToast("Configuración TWR actualizada.");
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
    const button = target?.closest<HTMLElement>(
      "button[data-action='remove-category']",
    );
    if (!button) {
      return;
    }

    const key = button.dataset.target;
    const name = button.dataset.name;
    if (!key || !name || !isCategoryKey(key)) {
      return;
    }

    const state = deps.getState();
    state[key] = state[key].filter((item) => item !== name);
    if (key === "investmentCategories") {
      // no-op
    }

    deps.saveState();
    deps.renderAll();
    deps.showToast("Categoría eliminada.");
  }

  function syncInvestmentCategoriesWithAssets() {
    const state = deps.getState();
    const assetNames = state.investmentAssets.map((item) => item.name);
    const merged = Array.from(
      new Set([...(state.investmentCategories || []), ...assetNames]),
    );
    state.investmentCategories = merged;
  }

  return {
    bindSettingsEvents,
    renderSettings,
  };
}
