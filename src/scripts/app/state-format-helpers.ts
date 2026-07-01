import { type State } from "../types";

interface AppStateFormatHelpersDeps {
  getState: () => State;
  saveStatusEl: HTMLElement;
  toastEl: HTMLElement;
  persistState: (state: State) => void;
  persistServerState: (state: State) => Promise<unknown>;
  sortTransactionsInState: (state: State) => void;
  sortContributionsInState: (state: State) => void;
}

export function setupAppStateFormatHelpers(deps: AppStateFormatHelpersDeps) {
  let toastTimer: number | undefined;

  function saveState() {
    const state = deps.getState();
    deps.persistState(state);
    void deps.persistServerState(state);
    const time = new Date(state.meta.savedAt || Date.now());
    const hh = String(time.getHours()).padStart(2, "0");
    const mm = String(time.getMinutes()).padStart(2, "0");
    deps.saveStatusEl.textContent = `Guardado ${hh}:${mm}`;
  }

  function sortTransactions() {
    deps.sortTransactionsInState(deps.getState());
  }

  function sortContributions() {
    deps.sortContributionsInState(deps.getState());
  }

  function showToast(message: string) {
    deps.toastEl.textContent = message;
    deps.toastEl.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      deps.toastEl.classList.remove("show");
    }, 2200);
  }

  function formatMoney(value: unknown) {
    const currency = (deps.getState().currency || "EUR").toUpperCase();
    try {
      return new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(Number(value || 0));
    } catch {
      return `${Number(value || 0).toFixed(2)} ${currency}`;
    }
  }

  function formatMoneyCompact(value: unknown) {
    const currency = (deps.getState().currency || "EUR").toUpperCase();
    try {
      return new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency,
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(Number(value || 0));
    } catch {
      return formatMoney(value);
    }
  }

  return {
    saveState,
    sortTransactions,
    sortContributions,
    showToast,
    formatMoney,
    formatMoneyCompact,
  };
}
