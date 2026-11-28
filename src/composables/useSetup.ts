import { computed, watch } from 'vue'

import { syncSettingsUpdate } from '../lib/client/command-mapping'
import { isDemoMode } from '../scripts/demo-mode'
import { useFinancialStateStore } from '../stores/financial-state'
import { useUiStore } from '../stores/ui'
import { useFinanceReady } from './useFinanceReady'

/** «Listo», the wizard's last step; 0 is «Cómo empiezas». */
export const SETUP_LAST_STEP = 6

type SetupPatch = Pick<
  Parameters<typeof syncSettingsUpdate>[0],
  'onboardingPresented' | 'onboardingDismissed' | 'onboardingCompleted' | 'onboardingStep'
>

/**
 * The setup wizard (#452): which step it is on, and whether it is open. The
 * step and the flags live in the user's settings, so leaving it on one device
 * resumes it on another. It never runs in the demo, which writes nothing.
 */
export function useSetup() {
  const financial = useFinancialStateStore()
  const uiStore = useUiStore()
  const ready = useFinanceReady()

  const available = computed(() => ready.value && financial.status !== 'error' && !isDemoMode())
  const step = computed(() => Math.min(financial.state.onboardingStep, SETUP_LAST_STEP))
  const completed = computed(() => financial.state.onboardingCompleted)
  const canResume = computed(() => available.value && !completed.value && !uiStore.setupOpen)

  function save(patch: SetupPatch): Promise<void> {
    financial.commitState((draft) => Object.assign(draft, patch))
    return syncSettingsUpdate(patch)
  }

  /** Moves to a step; resolves once the step is queued to sync. */
  function go(next: number): Promise<void> {
    return save({ onboardingStep: Math.max(0, Math.min(next, SETUP_LAST_STEP)) })
  }

  /** «Ahora no»: closes it; what was created stays, and it can be resumed. */
  function dismiss(): void {
    uiStore.setupOpen = false
    if (!completed.value && !financial.state.onboardingDismissed) {
      void save({ onboardingDismissed: true })
    }
  }

  function resume(): void {
    uiStore.setupOpen = true
  }

  /** From Preferences: someone already set up goes through it again from the start. */
  function reopen(): void {
    if (completed.value || step.value === SETUP_LAST_STEP) void go(1)
    uiStore.setupOpen = true
  }

  /** «Entendido» in «Listo». */
  function finish(): void {
    uiStore.setupOpen = false
    void save({ onboardingCompleted: true })
  }

  return { available, step, completed, canResume, go, dismiss, resume, reopen, finish }
}

/**
 * Opens the wizard on the user's first visit, and after a restored backup
 * reloads the page on «Listo». Mounted once, by the workspace.
 */
export function useSetupAutoOpen(): void {
  const financial = useFinancialStateStore()
  const uiStore = useUiStore()
  const { available, completed, step } = useSetup()
  let decided = false
  watch(
    available,
    (value) => {
      if (!value || decided) return
      decided = true
      // Watchers run after this returns, so the tour sees the wizard already open.
      uiStore.setupSettled = true
      if (completed.value) return
      const { onboardingPresented, onboardingDismissed } = financial.state
      if (onboardingPresented && (step.value !== SETUP_LAST_STEP || onboardingDismissed)) return
      uiStore.setupOpen = true
      if (onboardingPresented) return
      financial.commitState((draft) => {
        draft.onboardingPresented = true
      })
      void syncSettingsUpdate({ onboardingPresented: true })
    },
    { immediate: true },
  )
}
