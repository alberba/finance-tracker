import { type State } from "./types";
import { setupAppStateFormatHelpers } from "./app/state-format-helpers";
import { setupDashboardBudgetGoalsSection } from "./app/dashboard-budget-goals-section";
import { getEventElement } from "./app/dom-helpers";
import { getAppElements } from "./app/elements";
import { type UiState } from "./app/ui-state";
import { clone, todayISO } from "./utils";
import {
  BASE_SEED,
  getKnownServerVersion,
  hasPendingChanges,
  loadPersistedState,
  loadServerState,
  persistState,
  persistServerState,
  setKnownServerVersion,
  setPendingChanges,
  sortContributionsInState,
  sortTransactionsInState,
} from "./state";
import { materializeDueSubscriptions } from "./subscriptions";
import { useFinancialStateStore } from "../stores/financial-state";
import { pinia } from "../stores/pinia";
import { useUiStore } from "../stores/ui";
import { useRecurringStore } from "../stores/recurring";
import { isSyncV2Enabled } from "../lib/client/feature-flags";
import { useSyncStore } from "../stores/sync";

(() => {
  "use strict";

  const financialStateStore = useFinancialStateStore(pinia);
  const uiStore = useUiStore(pinia);
  const recurringStore = useRecurringStore(pinia);
  let state: State = financialStateStore.replaceState(clone(BASE_SEED));
  const ui = uiStore.ui as UiState;

  const el = getAppElements();

  const { saveState } = setupAppStateFormatHelpers({
    getState: () => state,
    saveStatusEl: el.saveStatus,
    toastEl: el.toast,
    persistState: (nextState) => {
      persistState(nextState);
      financialStateStore.replaceState(nextState);
    },
    persistServerState,
    sortTransactionsInState,
    sortContributionsInState,
  });

  const dashboardBudgetGoalsSection = setupDashboardBudgetGoalsSection({
    ui,
    el,
  });

  // Every section is now a Vue island reading from Pinia; the legacy app only
  // owns state hydration, persistence and the imperative sidebar navigation.
  // Persist whenever a Pinia mutation lands so the canonical state stays saved.
  financialStateStore.registerStateCommitHandler((nextState) => {
    state = nextState;
    if (!isSyncV2Enabled()) saveState();
  });
  financialStateStore.registerStateReloadHandler((nextState) => {
    state = nextState;
    if (!isSyncV2Enabled()) saveState();
  });

  void init();

  async function init() {
    await hydrateState();
    ui.activeSection = dashboardBudgetGoalsSection.getSectionFromPath(
      window.location.pathname,
    );
    bindEvents();
    dashboardBudgetGoalsSection.switchSection(ui.activeSection, {
      updateHistory: false,
    });
    document.documentElement.dataset.financeReady = "true";
  }

  /**
   * Reconciles local and server state with the server as the source of truth.
   * The one exception is local edits that never reached the server (offline
   * saves, flagged pending): those are flushed up first so they are not lost.
   * On conflict the server wins to avoid clobbering another device's change.
   */
  async function hydrateState() {
    if (isSyncV2Enabled()) {
      const response = await fetch('/api/session');
      if (!response.ok) throw new Error('No se pudo resolver la sesión para sync v2.');
      const session = await response.json() as { user?: { id?: string; email?: string } };
      if (!session.user?.id) throw new Error('La sesión no contiene una identidad válida.');
      await useSyncStore(pinia).init(session.user.id, { email: session.user.email ?? null });
      state = financialStateStore.state;
      recurringStore.refreshPending();
      return;
    }

    // Capture the version we last confirmed BEFORE loadServerState overwrites it
    // as a side effect — we need it to tell "server unchanged since our last
    // sync" (safe to push local edits) from "another device moved it ahead".
    const priorKnownVersion = getKnownServerVersion();
    const localState = loadPersistedState();
    const server = await loadServerState();

    if (server) {
      const localPending =
        localState !== null &&
        hasPendingChanges() &&
        (priorKnownVersion === null || priorKnownVersion === server.version);

      if (localPending) {
        // Local holds unsynced edits and the server hasn't moved past the
        // version we last saw: try to push them up.
        state = financialStateStore.replaceState(localState);
        const result = await persistServerState(state);
        if (result.status === "ok") {
          setPendingChanges(false);
        } else if (result.status === "conflict") {
          // Both sides diverged — adopt the server copy to stay consistent.
          state = financialStateStore.replaceState(result.state);
          setPendingChanges(false);
        }
        // On transient error keep the pending flag so the next save retries.
      } else {
        state = financialStateStore.replaceState(server.state);
        setKnownServerVersion(server.version);
        setPendingChanges(false);
      }
    } else if (localState) {
      // Server unreachable: fall back to the local cache and keep any pending
      // flag so the change re-syncs once the server is reachable again.
      state = financialStateStore.replaceState(localState);
    } else {
      state = financialStateStore.replaceState(clone(BASE_SEED));
    }

    const dueSubscriptions = materializeDueSubscriptions(state, todayISO());
    if (dueSubscriptions.advancedCount > 0) {
      sortTransactionsInState(state);
      setPendingChanges(true);
      void persistServerState(state);
    }
    recurringStore.refreshPending();
    persistState(state);
  }

  function bindEvents() {
    dashboardBudgetGoalsSection.bindNavigationEvents();
    bindChartTooltipEvents();
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
})();
