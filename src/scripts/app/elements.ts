import { getRequiredElement } from './dom-helpers'

export function getAppElements() {
  return {
    navTabs: getRequiredElement<HTMLElement>('nav-tabs'),
  } as const
}

export type AppElements = ReturnType<typeof getAppElements>
