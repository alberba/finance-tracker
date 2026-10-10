import { computed, ref, watch } from 'vue'

import { syncSettingsUpdate } from '../lib/client/command-mapping'
import { isDemoMode } from '../scripts/demo-mode'
import { useFinancialStateStore } from '../stores/financial-state'
import { useFinanceReady } from './useFinanceReady'

export function useWelcome() {
  const financial = useFinancialStateStore()
  const ready = useFinanceReady()
  const open = ref(false)
  const accountCompleted = computed(
    () => financial.state.onboardingAccountCompleted || financial.accounts.length > 0,
  )
  const movementCompleted = computed(
    () => financial.state.onboardingMovementCompleted || financial.transactions.length > 0,
  )
  const complete = computed(() => accountCompleted.value && movementCompleted.value)
  const canResume = computed(
    () =>
      ready.value &&
      financial.status !== 'error' &&
      !isDemoMode() &&
      !financial.state.onboardingCompleted &&
      !open.value,
  )
  let started = false
  let resumed = false
  let awaitingAcknowledgement = false
  const requested = new Set<string>()

  function save(patch: Parameters<typeof syncSettingsUpdate>[0]): void {
    const progress = {
      onboardingPresented: true,
      ...(financial.state.onboardingDismissed ? { onboardingDismissed: true } : {}),
      ...(accountCompleted.value ? { onboardingAccountCompleted: true } : {}),
      ...(movementCompleted.value ? { onboardingMovementCompleted: true } : {}),
      ...patch,
    }
    for (const key of Object.keys(progress)) requested.add(key)
    financial.commitState((draft) => Object.assign(draft, progress))
    void syncSettingsUpdate(progress)
  }

  watch(
    () => [ready.value, financial.state, financial.status] as const,
    () => {
      if (!ready.value || financial.status === 'error' || isDemoMode()) return
      if (financial.state.onboardingCompleted) {
        open.value = false
        return
      }
      if (!started) {
        started = true
        awaitingAcknowledgement = !financial.state.onboardingPresented && complete.value
        open.value = !financial.state.onboardingPresented
      }
      if (financial.state.onboardingDismissed && !resumed) open.value = false
      const patch: Parameters<typeof syncSettingsUpdate>[0] = {}
      if (!financial.state.onboardingPresented && !requested.has('onboardingPresented'))
        patch.onboardingPresented = true
      if (
        accountCompleted.value &&
        !financial.state.onboardingAccountCompleted &&
        !requested.has('onboardingAccountCompleted')
      )
        patch.onboardingAccountCompleted = true
      if (
        movementCompleted.value &&
        !financial.state.onboardingMovementCompleted &&
        !requested.has('onboardingMovementCompleted')
      )
        patch.onboardingMovementCompleted = true
      if (complete.value && !awaitingAcknowledgement && !requested.has('onboardingCompleted'))
        patch.onboardingCompleted = true
      if (Object.keys(patch).length) save(patch)
    },
    { immediate: true },
  )

  function dismiss(): void {
    open.value = false
    save(complete.value ? { onboardingCompleted: true } : { onboardingDismissed: true })
  }

  function resume(): void {
    resumed = true
    open.value = true
  }

  return { ready, open, accountCompleted, movementCompleted, complete, canResume, dismiss, resume }
}
