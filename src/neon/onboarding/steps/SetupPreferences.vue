<script setup lang="ts">
import { computed, ref } from 'vue'

import { useNeonTheme } from '../../../composables/useNeonTheme'
import { useFinancialStateStore } from '../../../stores/financial-state'
import { useSettingsStore } from '../../../stores/settings'
import { parseCurrency, THEME_CHOICES } from '../../sections/settings/view-model'

// «Moneda y tema»: both saved as soon as they are chosen. Each theme tile is
// painted by the theme it names (`data-theme` redefines the tokens inside it).
const financial = useFinancialStateStore()
const settingsStore = useSettingsStore()
const { theme } = useNeonTheme()

const COMMON = [
  { code: 'EUR', symbol: '€' },
  { code: 'USD', symbol: '$' },
  { code: 'GBP', symbol: '£' },
  { code: 'CHF', symbol: 'Fr' },
] as const

const currency = computed(() => financial.currency || 'EUR')
const isCommon = computed(() => COMMON.some((item) => item.code === currency.value))
const otherOpen = ref(!isCommon.value)
const other = ref(isCommon.value ? '' : currency.value)
const otherInvalid = ref(false)

function choose(code: string): void {
  otherOpen.value = false
  otherInvalid.value = false
  if (code !== currency.value) settingsStore.saveCurrency(code)
}

function saveOther(): void {
  const code = parseCurrency(other.value)
  otherInvalid.value = code === null
  if (code && code !== currency.value) settingsStore.saveCurrency(code)
}

const SEGMENT =
  'rounded-pill outline-accent inline-flex min-h-10 items-center gap-2 px-4.5 text-[14px] font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 aria-pressed:bg-sel-bg aria-pressed:text-sel-text text-soft'
</script>

<template>
  <div class="grid gap-8">
    <section class="grid gap-3" aria-labelledby="setup-currency">
      <h2 id="setup-currency" class="text-block-title font-extrabold">Moneda</h2>
      <div
        class="bg-panel2 rounded-pill flex flex-wrap gap-[3px] justify-self-start p-[3px]"
        role="group"
        aria-label="Moneda"
      >
        <button
          v-for="item in COMMON"
          :key="item.code"
          type="button"
          :class="SEGMENT"
          :aria-pressed="!otherOpen && currency === item.code"
          @click="choose(item.code)"
        >
          <span class="font-display font-semibold" aria-hidden="true">{{ item.symbol }}</span>
          {{ item.code }}
        </button>
        <button type="button" :class="SEGMENT" :aria-pressed="otherOpen" @click="otherOpen = true">
          Otra
        </button>
      </div>
      <label v-if="otherOpen" class="grid max-w-[220px] gap-1.5">
        <span class="text-muted text-[13px] font-bold">Código de tres letras</span>
        <input
          v-model="other"
          maxlength="3"
          autocomplete="off"
          placeholder="SEK"
          class="border-ctrl-line bg-panel rounded-field min-h-[46px] border px-3.5 text-[16px] font-bold uppercase"
          :aria-invalid="otherInvalid"
          @change="saveOther"
          @keydown.enter="saveOther"
        />
        <span v-if="otherInvalid" class="text-loss text-meta"
          >Escribe un código como SEK o JPY.</span
        >
      </label>
    </section>

    <section class="grid gap-3" aria-labelledby="setup-theme">
      <h2 id="setup-theme" class="text-block-title font-extrabold">Tema</h2>
      <div class="frame:grid-cols-4 grid grid-cols-2 gap-3" role="group" aria-label="Tema">
        <button
          v-for="choice in THEME_CHOICES"
          :key="choice.value"
          type="button"
          class="bg-panel border-line rounded-tile outline-text grid gap-2.5 border p-2.5 text-start focus-visible:outline-2 focus-visible:outline-offset-2 aria-pressed:outline-2 aria-pressed:outline-offset-3 motion-safe:transition-transform motion-safe:duration-140 motion-safe:active:scale-[0.98]"
          :aria-pressed="theme === choice.value"
          @click="theme = choice.value"
        >
          <span
            :data-theme="choice.value"
            class="bg-bg rounded-field grid h-[150px] content-start gap-2.5 p-3.5"
            aria-hidden="true"
          >
            <span class="bg-panel border-line grid gap-2 rounded-[10px] border p-3">
              <span class="bg-text h-[7px] w-[46%] rounded-full opacity-85" />
              <span class="bg-text h-[5px] w-[70%] rounded-full opacity-35" />
              <svg viewBox="0 0 100 28" class="text-accent h-[34px] w-full" fill="none">
                <path
                  d="M0 22 L18 18 L34 20 L52 11 L70 14 L86 6 L100 8"
                  stroke="currentColor"
                  stroke-width="2.2"
                  stroke-linejoin="round"
                />
              </svg>
            </span>
            <span class="flex gap-1.5">
              <span class="bg-accent h-3.5 w-11 rounded-full" />
              <span class="border-line h-3.5 w-7.5 rounded-full border" />
            </span>
          </span>
          <span class="flex items-center justify-between px-1 text-[15px] font-bold">
            {{ choice.label }}
            <span
              v-if="theme === choice.value"
              class="bg-sel-bg text-sel-text grid size-5.5 place-items-center rounded-full"
              aria-hidden="true"
            >
              <svg
                viewBox="0 0 24 24"
                class="size-3.5"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M5 12l5 5 9-10" />
              </svg>
            </span>
          </span>
        </button>
      </div>
      <p class="text-muted text-meta">
        Se aplica al momento y se recuerda en todos tus dispositivos.
      </p>
    </section>
  </div>
</template>
