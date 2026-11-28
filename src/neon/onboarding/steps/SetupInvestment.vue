<script setup lang="ts">
import { defineAsyncComponent, ref } from 'vue'

import { useFinancialStateStore } from '../../../stores/financial-state'
import NeonStockEventsPanel from '../../sections/settings/NeonStockEventsPanel.vue'
import NeonButton from '../../ui/NeonButton.vue'
import SetupEntityList from './SetupEntityList.vue'

// «¿Inviertes?»: no; yes, kept by hand (the investments and what they are worth
// today); or through a service already holding them, whose panel opens over
// the wizard as it does in Configuración.
const NeonBitvavoPanel = defineAsyncComponent(
  () => import('../../sections/settings/NeonBitvavoPanel.vue'),
)

type Choice = 'no' | 'manual' | 'service'
const financial = useFinancialStateStore()
const choice = ref<Choice | null>(
  financial.state.stockEvents.enabled
    ? 'service'
    : financial.state.investmentAssets.length
      ? 'manual'
      : null,
)
const stockEventsOpen = ref(false)
const bitvavoOpen = ref(false)

const CHOICES: ReadonlyArray<{ value: Choice; label: string }> = [
  { value: 'no', label: 'No' },
  { value: 'manual', label: 'Sí, lo llevo a mano' },
  { value: 'service', label: 'Sí, con un servicio' },
]

const SERVICES = [
  {
    name: 'Stock Events',
    text: 'Sincroniza tus movimientos de inversión con tus listas de seguimiento.',
    open: stockEventsOpen,
  },
  {
    name: 'Bitvavo',
    text: 'Importa el historial de compras y ventas en euros.',
    open: bitvavoOpen,
  },
]
</script>

<template>
  <div class="grid gap-5">
    <div
      class="bg-panel2 rounded-pill flex flex-wrap gap-[3px] justify-self-start p-[3px]"
      role="group"
      aria-label="¿Inviertes?"
    >
      <button
        v-for="item in CHOICES"
        :key="item.value"
        type="button"
        class="rounded-pill outline-accent text-soft aria-pressed:bg-sel-bg aria-pressed:text-sel-text min-h-10 px-4.5 text-[14px] font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2"
        :aria-pressed="choice === item.value"
        @click="choice = item.value"
      >
        {{ item.label }}
      </button>
    </div>

    <p v-if="choice === 'no'" class="text-muted text-note">
      Sin problema. Si empiezas más adelante, lo añades en Configuración.
    </p>

    <template v-else-if="choice === 'manual'">
      <SetupEntityList kind="investmentAssets" />
      <p class="text-muted text-note max-w-[640px]">
        Las compras y las ventas se apuntan con «Apuntar», eligiendo Inversión. Con el símbolo, la
        app busca la cotización del día.
      </p>
    </template>

    <ul
      v-else-if="choice === 'service'"
      class="bg-panel border-line rounded-card divide-line grid divide-y border"
      aria-label="Servicios"
    >
      <li
        v-for="service in SERVICES"
        :key="service.name"
        class="frame:px-7 flex min-h-[76px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
      >
        <div class="grid min-w-0 flex-1 basis-[260px]">
          <span class="text-[16px] font-bold">{{ service.name }}</span>
          <span class="text-muted text-meta">{{ service.text }}</span>
        </div>
        <NeonButton @click="service.open.value = true">Conectar</NeonButton>
      </li>
    </ul>

    <NeonStockEventsPanel v-model:open="stockEventsOpen" />
    <NeonBitvavoPanel v-if="bitvavoOpen" v-model:open="bitvavoOpen" />
  </div>
</template>
