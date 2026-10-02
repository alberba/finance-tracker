import { type State } from "../types";
import { setPendingChanges, type ServerSaveResult } from "../state";

interface AppStateFormatHelpersDeps {
  getState: () => State;
  saveStatusEl: HTMLElement;
  toastEl: HTMLElement;
  persistState: (state: State) => void;
  persistServerState: (state: State) => Promise<ServerSaveResult>;
  sortTransactionsInState: (state: State) => void;
  sortContributionsInState: (state: State) => void;
  onConflict?: () => void;
}

const RETRY_BASE_MS = 2000;
const RETRY_MAX_MS = 30000;

export function setupAppStateFormatHelpers(deps: AppStateFormatHelpersDeps) {
  let toastTimer: number | undefined;

  // Server sync is coalesced: a full-state PUT is idempotent, so while one is in
  // flight we only remember that another is due and fire a single follow-up.
  let syncing = false;
  let syncQueued = false;
  let retryTimer: number | undefined;
  let retryDelay = RETRY_BASE_MS;

  function setSaveStatus(text: string) {
    deps.saveStatusEl.textContent = text;
  }

  function savedStamp(): string {
    const time = new Date();
    const hh = String(time.getHours()).padStart(2, "0");
    const mm = String(time.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  function requestSync() {
    if (syncing) {
      syncQueued = true;
      return;
    }
    void runSync();
  }

  async function runSync() {
    syncing = true;
    syncQueued = false;
    window.clearTimeout(retryTimer);
    setSaveStatus("Guardando…");

    const result = await deps.persistServerState(deps.getState());
    syncing = false;

    if (result.status === "ok") {
      retryDelay = RETRY_BASE_MS;
      if (syncQueued) {
        // Newer local edits landed while this request was in flight, so they
        // are not on the server yet: stay pending and flush again. Clearing the
        // pending flag here would let a reload adopt a stale server copy.
        requestSync();
      } else {
        setPendingChanges(false);
        setSaveStatus(`Sincronizado ${savedStamp()}`);
      }
      return;
    }

    if (result.status === "conflict") {
      // Another device saved in the meantime. Keep the local change (still
      // pending) rather than clobbering the server, and surface it.
      setSaveStatus("Conflicto · recarga la página");
      showToast(
        "⚠️ Este cambio no se sincronizó: los datos cambiaron en otro dispositivo. Recarga la página para traer la última versión.",
      );
      deps.onConflict?.();
      return;
    }

    // Transient error / offline: retry with exponential backoff.
    setSaveStatus("Sin conexión · reintentando…");
    retryTimer = window.setTimeout(() => {
      retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
      requestSync();
    }, retryDelay);
  }

  function saveState() {
    const state = deps.getState();
    deps.persistState(state);
    setPendingChanges(true);
    requestSync();
  }

  function sortTransactions() {
    deps.sortTransactionsInState(deps.getState());
  }

  function sortContributions() {
    deps.sortContributionsInState(deps.getState());
  }

  function showToast(message: unknown) {
    deps.toastEl.textContent = String(message);
    deps.toastEl.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      deps.toastEl.classList.remove("show");
    }, 2200);
  }

  function formatMoney(value: unknown) {
    const currency = (deps.getState().currency || "EUR").toUpperCase();
    const amount = Number(value || 0);
    try {
      return new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `${amount.toFixed(2)} ${currency}`;
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
