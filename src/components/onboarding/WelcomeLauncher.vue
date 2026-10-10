<script setup lang="ts">
import { useWelcome } from '../../composables/useWelcome'
import { useSetupNavigation } from '../../composables/useSetupNavigation'
import { useUiStore } from '../../stores/ui'
import BaseButton from '../ui/BaseButton.vue'
import WelcomeGuide from './WelcomeGuide.vue'

const { ready, open, accountCompleted, movementCompleted, complete, canResume, dismiss, resume } =
  useWelcome()
const { createAccount, createMovement, navigateTo } = useSetupNavigation()
const uiStore = useUiStore()
function account(): void {
  dismiss()
  createAccount()
}
function movement(): void {
  dismiss()
  createMovement()
}
function optional(section: 'budget' | 'investment' | 'settings'): void {
  dismiss()
  if (section === 'settings') uiStore.settingsTab = 'connections'
  navigateTo(section)
}
</script>

<template>
  <div
    class="contents"
    :data-welcome-state="!ready ? 'loading' : open ? 'open' : canResume ? 'available' : 'complete'"
  >
    <aside
      v-if="canResume"
      class="border-line bg-panel rounded-md border p-4"
      aria-label="Configuración inicial"
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-text-muted text-sm">
          Tu punto de partida: una cuenta y tu primer movimiento.
        </p>
        <BaseButton class="active:opacity-80" variant="secondary" @click="resume"
          >Retomar bienvenida</BaseButton
        >
      </div>
    </aside>
    <WelcomeGuide
      v-model:open="open"
      :account-completed="accountCompleted"
      :movement-completed="movementCompleted"
      :complete="complete"
      @account="account"
      @movement="movement"
      @dismiss="dismiss"
      @optional="optional"
    />
  </div>
</template>
