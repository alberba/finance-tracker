import { type State } from "./types";
import { setupAppStateFormatHelpers } from "./app/state-format-helpers";
import { setupDashboardBudgetGoalsSection } from "./app/dashboard-budget-goals-section";
import { getEventElement } from "./app/dom-helpers";
import { getAppElements } from "./app/elements";
import { type UiState } from "./app/ui-state";
import { clone, todayISO } from "./utils";
import {
  BASE_SEED,
  loadPersistedState,
  loadServerState,
  persistState,
  persistServerState,
  sortContributionsInState,
  sortTransactionsInState,
} from "./state";
import { materializeDueSubscriptions } from "./subscriptions";
import { useFinancialStateStore } from "../stores/financial-state";
import { pinia } from "../stores/pinia";
import { useUiStore } from "../stores/ui";
import { useRecurringStore } from "../stores/recurring";

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
    saveState();
  });
  financialStateStore.registerStateReloadHandler((nextState) => {
    state = nextState;
    saveState();
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
  }

  async function hydrateState() {
    const localState = loadPersistedState();
    const serverState = await loadServerState();
    const preferredState =
      pickMostRecentState(localState, serverState) || clone(BASE_SEED);
    state = financialStateStore.replaceState(preferredState);
    const dueSubscriptions = materializeDueSubscriptions(state, todayISO());
    if (dueSubscriptions.advancedCount > 0) {
      sortTransactionsInState(state);
      void persistServerState(state);
    }
    recurringStore.refreshPending();
    persistState(state);
  }

  function pickMostRecentState(
    localState: unknown,
    serverState: unknown,
  ): unknown | null {
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
    const rawMeta = (
      candidate as { meta?: { savedAt?: string; generatedAt?: string } } | null
    )?.meta;
    const timestamp = String(rawMeta?.savedAt || rawMeta?.generatedAt || "");
    const value = Date.parse(timestamp);
    return Number.isFinite(value) ? value : 0;
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
