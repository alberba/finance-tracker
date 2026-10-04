<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'

import SettingsTabIntro from './SettingsTabIntro.vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseInput from '../ui/BaseInput.vue'
import DocumentSurface from '../ui/DocumentSurface.vue'
import NumberedBlock from '../ui/NumberedBlock.vue'
import SegmentedControl from '../ui/SegmentedControl.vue'
import { THEME_OPTIONS, useThemePreference } from '../../composables/useThemePreference'
import { useSettingsStore } from '../../stores/settings'

// Preferencias: año de trabajo, moneda y tema. Las conexiones tienen su propia pestaña.
defineProps<{ isActive: boolean }>()

const settingsStore = useSettingsStore()
const { viewModel } = storeToRefs(settingsStore)

const { preference: themePreference, theme } = useThemePreference()
const themeSummary = computed(() => {
  if (themePreference.value === 'system') {
    return `Sigue al sistema: ahora ${theme.value === 'dark' ? 'oscuro' : 'claro'}.`
  }
  return themePreference.value === 'dark' ? 'Siempre oscuro.' : 'Siempre claro.'
})

const year = ref(String(viewModel.value.year))
const currency = ref(viewModel.value.currency)

// Keep the unsaved fields in step when the year or currency change elsewhere
// (the dashboard year control writes through the store).
watch(
  () => viewModel.value.year,
  (value) => {
    year.value = String(value)
  },
)
watch(
  () => viewModel.value.currency,
  (value) => {
    currency.value = value
  },
)
</script>

<template>
  <section
    id="settings-tab-preferences"
    class="grid content-start gap-6"
    :hidden="!isActive"
    role="tabpanel"
    aria-labelledby="settings-tab-preferences-button"
    data-settings-preferences
  >
    <SettingsTabIntro
      title="Preferencias"
      description="Año de trabajo, moneda y tema del tracker."
    />

    <DocumentSurface>
      <NumberedBlock
        number="01"
        title="General"
        title-id="settings-general-title"
        description="Año de trabajo y moneda con los que se calcula todo el tracker."
      >
        <form
          class="grid gap-3.5 sm:grid-cols-[10rem_8rem_auto] sm:items-end"
          autocomplete="off"
          @submit.prevent="settingsStore.saveGeneral(year, currency)"
        >
          <BaseInput
            id="settings-year"
            v-model="year"
            label="Año de trabajo"
            name="settingsYear"
            type="number"
            min="2000"
            max="2100"
            class="[&_input]:font-display"
          />
          <BaseInput
            id="settings-currency"
            v-model="currency"
            label="Moneda"
            name="settingsCurrency"
            maxlength="3"
            class="[&_input]:font-mono [&_input]:uppercase"
          />
          <BaseButton
            id="save-settings-main"
            type="submit"
            variant="primary"
            class="justify-self-start"
          >
            Guardar ajustes
          </BaseButton>
        </form>
      </NumberedBlock>

      <NumberedBlock
        number="02"
        title="Apariencia"
        title-id="settings-appearance-title"
        description="Claro, oscuro o el del sistema. Se aplica al momento y se recuerda en este dispositivo."
      >
        <div class="flex flex-wrap items-center gap-x-5 gap-y-3">
          <SegmentedControl
            v-model="themePreference"
            :options="THEME_OPTIONS"
            label="Tema"
            data-key="theme-pref"
          />
          <p class="text-text-muted text-sm" data-theme-summary>{{ themeSummary }}</p>
        </div>
      </NumberedBlock>
    </DocumentSurface>
  </section>
</template>
