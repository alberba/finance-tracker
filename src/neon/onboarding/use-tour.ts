import { computed, watch } from 'vue'

import { syncSettingsUpdate } from '../../lib/client/command-mapping'
import { isDemoMode } from '../../scripts/demo-mode'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useUiStore } from '../../stores/ui'
import { FRAME_QUERY } from '../ui/sheet-drag'
import { useFinanceReady } from '../../composables/useFinanceReady'
import { useMediaQuery } from '../../composables/useMediaQuery'
import { useSectionNavigation } from '../../composables/useSectionNavigation'

export type TourPlatform = 'desktop' | 'mobile'

const FLAG = { desktop: 'tourDesktopSeen', mobile: 'tourMobileSeen' } as const

/** The demo writes nothing to the server: there the flag stays in the browser. */
function demoKey(platform: TourPlatform): string {
  return `finance-tour-${platform}-seen`
}

function readDemoFlag(platform: TourPlatform): boolean {
  try {
    return window.localStorage.getItem(demoKey(platform)) === '1'
  } catch {
    return false
  }
}

function writeDemoFlag(platform: TourPlatform): void {
  try {
    window.localStorage.setItem(demoKey(platform), '1')
  } catch {
    // Without storage the demo shows it again next time; nothing else depends on it.
  }
}

/**
 * The guided tour (#527): one per frame, since the desktop and the mobile one
 * place everything differently. Seen or skipped, each is marked on the user
 * (in the browser in the demo); leaving it half way is not, so it starts over.
 */
export function useTour() {
  const financial = useFinancialStateStore()
  const uiStore = useUiStore()
  const { navigateTo } = useSectionNavigation()
  const desktop = useMediaQuery(FRAME_QUERY)
  const platform = computed<TourPlatform>(() => (desktop.value ? 'desktop' : 'mobile'))

  function seen(on: TourPlatform): boolean {
    // Finished here: until the flag is queued to sync, a refresh from the
    // server can still project it unset, and the tour must not start over.
    if (uiStore.toursDone.includes(on)) return true
    return isDemoMode() ? readDemoFlag(on) : financial.state[FLAG[on]]
  }

  /** It starts on the Dashboard and points at everything else from there. */
  function start(): void {
    if (uiStore.page !== 'section' || uiStore.ui.activeSection !== 'dashboard') {
      navigateTo('dashboard')
    }
    uiStore.tourOpen = true
  }

  /** Finished or skipped: marked as seen on this frame. */
  function finish(on: TourPlatform = platform.value): void {
    uiStore.tourOpen = false
    if (seen(on)) return
    uiStore.toursDone.push(on)
    if (isDemoMode()) return writeDemoFlag(on)
    financial.commitState((draft) => {
      draft[FLAG[on]] = true
    })
    void syncSettingsUpdate({ [FLAG[on]]: true })
  }

  /** Closed without counting as seen (the window crossed the frame breakpoint). */
  function abandon(): void {
    uiStore.tourOpen = false
  }

  return { platform, seen, start, finish, abandon }
}

/**
 * Starts the tour once the setup wizard is out of the way: after «Entendido»
 * or «Ahora no», or straight away for whoever is already set up. Mounted once,
 * by the workspace.
 */
export function useTourAutoOpen() {
  const financial = useFinancialStateStore()
  const uiStore = useUiStore()
  const ready = useFinanceReady()
  const tour = useTour()

  /** Nothing is left to wait for: from here it either shows or it does not. */
  const settled = computed(
    () =>
      ready.value &&
      (financial.status === 'error' || isDemoMode() || uiStore.setupSettled) &&
      !uiStore.setupOpen,
  )
  const due = computed(
    () =>
      settled.value &&
      financial.status !== 'error' &&
      !uiStore.tourOpen &&
      !tour.seen(tour.platform.value),
  )

  watch(due, (value) => value && tour.start(), { immediate: true })
  return { settled }
}
