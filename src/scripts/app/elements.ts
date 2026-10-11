import { getRequiredElement } from "./dom-helpers";

export function getAppElements() {
  return {
    navTabs: getRequiredElement<HTMLElement>("nav-tabs"),
    chartTooltip: getRequiredElement<HTMLElement>("chart-tooltip"),
  } as const;
}

export type AppElements = ReturnType<typeof getAppElements>;
