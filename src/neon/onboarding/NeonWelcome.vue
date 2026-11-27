<script setup lang="ts">
import { useSetupNavigation } from '../../composables/useSetupNavigation'
import { useWelcome } from '../../composables/useWelcome'
import { useUiStore } from '../../stores/ui'
import NeonButton from '../ui/NeonButton.vue'
import NeonDetailPanel from '../ui/NeonDetailPanel.vue'

// The welcome of a new account: a detail panel with the two first steps (an
// account, a movement) and the optional ones. Closed before finishing, it
// leaves a line on top of the section to pick it up again.
const { ready, open, accountCompleted, movementCompleted, complete, canResume, dismiss, resume } =
  useWelcome()
const { createAccount, createMovement, navigateTo } = useSetupNavigation()
const uiStore = useUiStore()

/** The panel only closes through `dismiss`, which remembers the choice. */
function onOpenChange(value: boolean): void {
  if (!value) dismiss()
}

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

const OPTIONAL = [
  { section: 'budget', label: 'Presupuesto' },
  { section: 'investment', label: 'Inversión' },
  { section: 'settings', label: 'Integraciones' },
] as const

const stepNumber = 'font-display text-muted text-[13px] font-bold tabular-nums'
const stepTitle = 'font-display text-block-title leading-tight font-bold'
const stepText = 'text-soft text-[15px] leading-normal'
const done = 'text-gain text-[15px] font-extrabold'
</script>

<template>
  <div
    class="contents"
    :data-welcome-state="!ready ? 'loading' : open ? 'open' : canResume ? 'available' : 'complete'"
  >
    <aside
      v-if="canResume"
      class="bg-panel border-line rounded-card flex flex-wrap items-center justify-between gap-3 border px-5 py-3.5"
      aria-label="Configuración inicial"
    >
      <p class="text-soft text-[15px] font-bold">
        Tu punto de partida: una cuenta y tu primer movimiento.
      </p>
      <NeonButton @click="resume">Retomar bienvenida</NeonButton>
    </aside>

    <NeonDetailPanel
      :open="open"
      kicker="Tu punto de partida"
      title="Bienvenido a tus finanzas"
      @update:open="onOpenChange"
    >
      <p class="text-soft text-[16px] leading-normal">
        Empieza con una cuenta y un movimiento. Con eso ya puedes seguir tu día a día.
      </p>

      <ol class="divide-line grid divide-y">
        <li class="grid gap-2.5 py-[18px]" aria-labelledby="welcome-account-title">
          <span :class="stepNumber" aria-hidden="true">01</span>
          <h3 id="welcome-account-title" :class="stepTitle">Crea una cuenta</h3>
          <p :class="stepText">
            Dale un nombre y apunta su saldo inicial. Puede ser tu cuenta bancaria o tu efectivo.
          </p>
          <p v-if="accountCompleted" :class="done">✓ Cuenta creada</p>
          <NeonButton v-else variant="primary" class="justify-self-start" @click="account">
            Crear cuenta
          </NeonButton>
        </li>

        <li class="grid gap-2.5 py-[18px]" aria-labelledby="welcome-movement-title">
          <span :class="stepNumber" aria-hidden="true">02</span>
          <h3 id="welcome-movement-title" :class="stepTitle">Registra tu primer movimiento</h3>
          <p :class="stepText">
            Anota un ingreso o un gasto: importe, fecha, cuenta y categoría. Una importación también
            cuenta.
          </p>
          <p v-if="movementCompleted" :class="done">✓ Movimiento registrado</p>
          <NeonButton
            v-else
            variant="primary"
            class="justify-self-start"
            :disabled="!accountCompleted"
            @click="movement"
          >
            Registrar movimiento
          </NeonButton>
          <p v-if="!accountCompleted && !movementCompleted" class="text-muted text-note">
            Crea una cuenta para poder registrar movimientos.
          </p>
        </li>

        <li class="grid gap-2.5 py-[18px]" aria-labelledby="welcome-optional-title">
          <span :class="stepNumber" aria-hidden="true">03</span>
          <h3 id="welcome-optional-title" :class="stepTitle">A tu ritmo</h3>
          <p :class="stepText">
            Presupuestos, inversión e integraciones son pasos opcionales. Puedes operar manualmente
            desde el principio.
          </p>
          <div class="flex flex-wrap gap-x-1 gap-y-2">
            <NeonButton
              v-for="item in OPTIONAL"
              :key="item.section"
              @click="optional(item.section)"
            >
              {{ item.label }}
            </NeonButton>
          </div>
        </li>
      </ol>

      <template #footer>
        <NeonButton :variant="complete ? 'primary' : 'secondary'" @click="dismiss">
          {{ complete ? 'Entendido' : 'Ahora no' }}
        </NeonButton>
      </template>
    </NeonDetailPanel>
  </div>
</template>
