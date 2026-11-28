<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { ref, watch } from 'vue'

import { useSetup } from '../../../composables/useSetup'
import { useToast } from '../../../composables/useToast'
import { useSettingsStore } from '../../../stores/settings'
import NeonButton from '../../ui/NeonButton.vue'
import { useTour } from '../../onboarding/use-tour'
import NeonSettingsBlock from './NeonSettingsBlock.vue'
import NeonThemePicker from './NeonThemePicker.vue'
import { parseCurrency, parseYear } from './view-model'

// Preferencias: the theme (one of the four of DESIGN.md, applied at once), the
// working year and the currency every figure is calculated in. In a narrow
// container (the mobile frame) the fields shrink and «Guardar» spans it.
const settingsStore = useSettingsStore()
const { showToast } = useToast()
const { viewModel } = storeToRefs(settingsStore)
const setup = useSetup()
const tour = useTour()

const year = ref(String(viewModel.value.year))
const currency = ref(viewModel.value.currency)

// Follows the year and currency when they change elsewhere (the dashboard's
// year control writes through the same store).
watch(
  () => viewModel.value.year,
  (value) => (year.value = String(value)),
)
watch(
  () => viewModel.value.currency,
  (value) => (currency.value = value),
)

function save(): void {
  const nextYear = parseYear(year.value)
  const nextCurrency = parseCurrency(currency.value)
  if (nextYear === null) return void showToast('El año de trabajo va de 2000 a 2100.')
  if (nextCurrency === null) return void showToast('La moneda son tres letras, como EUR.')
  settingsStore.saveGeneral(String(nextYear), nextCurrency)
}

const INPUT =
  'border-ctrl-line bg-panel text-text rounded-field outline-accent box-border min-h-[46px] w-full min-w-0 border px-3.5 text-end text-[16px] font-bold focus-visible:outline-2 focus-visible:outline-offset-2'
const ROW =
  'border-line grid min-h-16 min-w-0 grid-cols-[minmax(0,1fr)_112px] items-center @lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)] gap-x-3 border-t py-2.5'
</script>

<template>
  <NeonSettingsBlock
    id="preferencias"
    title="Preferencias"
    description="Tema, año de trabajo y moneda del tracker."
  >
    <div class="grid min-w-0" data-settings-preferences>
      <div class="border-line grid min-w-0 gap-2.5 border-t py-2.5">
        <div class="grid gap-0.5">
          <span class="text-[16px] font-bold">Tema</span>
          <span class="text-muted text-meta"
            >Se aplica al momento y se recuerda en todos tus dispositivos</span
          >
        </div>
        <NeonThemePicker />
      </div>
      <div :class="ROW">
        <label for="settings-year" class="grid gap-0.5">
          <span class="text-[16px] font-bold">Año de trabajo</span>
          <span class="text-muted text-meta">Con el que se calcula todo el tracker</span>
        </label>
        <input
          id="settings-year"
          v-model="year"
          inputmode="numeric"
          autocomplete="off"
          :class="INPUT"
          @keydown.enter="save"
        />
      </div>
      <div :class="ROW">
        <label for="settings-currency" class="grid gap-0.5">
          <span class="text-[16px] font-bold">Moneda</span>
          <span class="text-muted text-meta">Todos los importes se muestran en esta moneda</span>
        </label>
        <input
          id="settings-currency"
          v-model="currency"
          maxlength="3"
          autocomplete="off"
          :class="INPUT"
          @keydown.enter="save"
        />
      </div>
    </div>
    <div class="grid pbs-1.5 pbe-2 @lg:flex @lg:justify-end @lg:pbe-0">
      <NeonButton variant="primary" @click="save">Guardar ajustes</NeonButton>
    </div>
    <div
      v-if="setup.available.value"
      class="border-line mbs-4 flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t py-2.5"
    >
      <div class="grid gap-0.5">
        <span class="text-[16px] font-bold">Puesta en marcha</span>
        <span class="text-muted text-meta">Moneda, cuentas, fijos e inversiones, paso a paso</span>
      </div>
      <NeonButton @click="setup.reopen">Abrir</NeonButton>
    </div>
    <div
      class="border-line flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t py-2.5"
      :class="!setup.available.value && 'mbs-4'"
    >
      <div class="grid gap-0.5">
        <span class="text-[16px] font-bold">Recorrido guiado</span>
        <span class="text-muted text-meta">
          Dónde está cada cosa
          {{ tour.platform.value === 'desktop' ? 'en escritorio' : 'en el móvil' }}
        </span>
      </div>
      <NeonButton data-tour-replay @click="tour.start">Ver el recorrido otra vez</NeonButton>
    </div>
  </NeonSettingsBlock>
</template>
