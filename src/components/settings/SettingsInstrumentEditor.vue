<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'

import BaseButton from '../ui/BaseButton.vue'
import BaseInput from '../ui/BaseInput.vue'
import { FIELD_LABEL } from '../ui/field'
import PillTag from '../ui/PillTag.vue'
import SegmentedControl, { type SegmentedOption } from '../ui/SegmentedControl.vue'
import YahooQuoteLink from './YahooQuoteLink.vue'
import { yahooQuoteSymbol } from '../../domain/investment/symbol-matching'
import { INSTRUMENT_TYPE_LABEL, QUOTE_PROVIDERS } from '../../domain/investment/instrument-labels'
import type { InstrumentRowViewModel } from '../../domain/settings/view-model'
import { searchMarketSymbols, type MarketSearchResult } from '../../services/market-api'
import { runClientHttp } from '../../lib/client/runtime'
import { useMarketStore } from '../../stores/market'
import { useSyncStore } from '../../stores/sync'
import { isUnresolvedIntent } from '../../lib/client/durable-intents'
import { LINK_CONFIGURATION_STEP } from '../../lib/client/instrument-link'

// The portfolio's visible symbol and its independent provider ticker.
const props = defineProps<{ instrument: InstrumentRowViewModel }>()

const marketStore = useMarketStore()
const syncStore = useSyncStore()
const linking = ref(false)

/**
 * The durable link intent for this instrument, while it is not confirmed.
 * Accepting it is local; only the server's acknowledgement makes it confirmed.
 */
const linkIntent = computed(() =>
  syncStore.intents.find((view) => {
    if (
      view.intent.kind !== 'instrumentLink' ||
      view.intent.payload.instrumentId !== props.instrument.id ||
      !isUnresolvedIntent(view.intent)
    )
      return false
    return true
  }),
)
/** The movable steps; the configuration dependency is not a "vinculado". */
const linkSteps = computed(
  () => linkIntent.value?.steps.filter((step) => step.step !== LINK_CONFIGURATION_STEP) ?? [],
)
const linkCounts = computed(() => {
  if (!linkIntent.value) return null
  return {
    confirmed: linkSteps.value.filter((step) => step.state === 'confirmed').length,
    pending: linkSteps.value.filter(
      (step) => step.state !== 'confirmed' && step.state !== 'cancelled',
    ).length,
    total: linkSteps.value.length,
  }
})
const linkFailed = computed(
  () =>
    linkIntent.value?.intent.failure !== null ||
    linkIntent.value?.steps.some((step) => step.state === 'failed') === true,
)
const linkStatus = computed(() => {
  const view = linkIntent.value
  if (!view) return ''
  if (linkFailed.value) {
    return view.intent.failure ?? 'No se pudo completar la vinculación.'
  }
  if (view.intent.state === 'partial' && view.intent.failure === null) {
    return `Resultado parcial: ${linkCounts.value?.confirmed ?? 0} de ${
      linkCounts.value?.total ?? 0
    } vinculados; el resto se descartó.`
  }
  if (view.intent.state === 'sending') {
    return `Guardado en este dispositivo · ${linkCounts.value?.pending ?? 0} pendientes de confirmar.`
  }
  if (view.intent.state === 'waiting') {
    return view.intent.waitingFor === 'catalog'
      ? 'Guardado en este dispositivo · esperando la sincronización de la cotización.'
      : 'Guardado en este dispositivo · pendiente de sincronizar.'
  }
  return 'Guardado en este dispositivo · pendiente de enviar.'
})

async function linkExistingMovements(): Promise<void> {
  if (linking.value) return
  linking.value = true
  try {
    await marketStore.linkExistingMovements(props.instrument.id)
  } finally {
    linking.value = false
  }
}

async function retryLink(): Promise<void> {
  const view = linkIntent.value
  if (view) await syncStore.retryIntent(view.intent.id)
}

async function discardLink(): Promise<void> {
  const view = linkIntent.value
  if (view) await syncStore.discardIntent(view.intent.id)
}

const displaySymbol = ref(props.instrument.symbol)
const savedTicker = computed(() =>
  props.instrument.provider === 'yahoo'
    ? yahooQuoteSymbol(props.instrument)
    : props.instrument.quoteSymbol || props.instrument.symbol,
)
const ticker = ref(savedTicker.value)
watch(
  () => props.instrument.symbol,
  (symbol) => {
    displaySymbol.value = symbol
  },
)
watch(savedTicker, (value) => {
  ticker.value = value
})

const provider = computed({
  get: () => props.instrument.provider,
  set: (value: string) => marketStore.setInstrumentProvider(props.instrument.id, value),
})

const results = shallowRef<MarketSearchResult[]>([])
const isSearching = shallowRef(false)
const searchError = shallowRef('')

const canSearch = computed(() => props.instrument.provider === 'yahoo')
const yahooTicker = computed(() =>
  yahooQuoteSymbol({ ...props.instrument, symbol: displaySymbol.value, quoteSymbol: ticker.value }),
)
const providerOptions: SegmentedOption[] = QUOTE_PROVIDERS.map((item) => ({ ...item }))

function saveTicker(): void {
  if (
    marketStore.configureInstrumentSymbols(props.instrument.id, displaySymbol.value, ticker.value)
  ) {
    results.value = []
    searchError.value = ''
  }
}

async function search(): Promise<void> {
  const query = ticker.value.trim() || props.instrument.symbol
  if (!query) return
  isSearching.value = true
  searchError.value = ''
  try {
    results.value = await runClientHttp(searchMarketSymbols(query, props.instrument.provider))
  } catch (error) {
    results.value = []
    searchError.value = error instanceof Error ? error.message : 'No se pudieron buscar símbolos'
  } finally {
    isSearching.value = false
  }
}

function useResult(result: MarketSearchResult): void {
  ticker.value = result.symbol
  results.value = []
}
</script>

<template>
  <div class="border-line grid gap-4 rounded-md border p-4" :data-instrument-id="instrument.id">
    <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <span class="flex items-baseline gap-2.5">
        <span class="font-mono text-base font-medium">{{ instrument.symbol }}</span>
        <PillTag>{{ INSTRUMENT_TYPE_LABEL[instrument.type] }}</PillTag>
        <span class="text-text-muted text-sm">
          {{ [instrument.currency, instrument.market].filter(Boolean).join(' · ') }}
        </span>
      </span>
      <span class="text-text-muted text-sm" data-instrument-movements>
        <span class="font-display text-text-main tabular-nums">{{ instrument.linked }}</span>
        vinculados<template v-if="instrument.pending">
          ·
          <span class="text-text-main font-semibold">{{ instrument.pending }} por vincular</span>
        </template>
      </span>
    </div>

    <BaseInput
      v-model="displaySymbol"
      label="Símbolo a mostrar"
      required
      spellcheck="false"
      class="[&_input]:font-mono [&_input]:uppercase"
    />
    <p class="text-text-muted text-sm">Este símbolo identifica tu posición y sus movimientos.</p>

    <div class="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
      <BaseInput
        v-model="ticker"
        :label="`Ticker de ${instrument.symbol} en el proveedor`"
        spellcheck="false"
        class="[&_input]:font-mono [&_input]:uppercase"
      />
      <BaseButton @click="saveTicker">Guardar símbolos</BaseButton>
    </div>
    <p class="text-text-muted text-sm">El ticker de consulta solo se usa para obtener el precio.</p>
    <YahooQuoteLink v-if="canSearch" :symbol="yahooTicker" />

    <ul v-if="results.length" class="grid" aria-label="Tickers aproximados">
      <li
        v-for="result in results"
        :key="result.symbol"
        class="border-line flex items-center justify-between gap-3 border-b py-1.5"
      >
        <span class="grid min-w-0">
          <span class="font-mono text-sm font-medium">{{ result.symbol }}</span>
          <span class="text-text-muted truncate text-xs"
            >{{ result.exchange }} · {{ result.name }}</span
          >
          <span class="text-text-muted text-xs">{{
            [result.type, result.currency].filter(Boolean).join(' · ')
          }}</span>
          <YahooQuoteLink :symbol="result.symbol" />
        </span>
        <BaseButton
          variant="ghost"
          :aria-label="`Usar símbolo ${result.symbol}`"
          @click="useResult(result)"
        >
          Usar
        </BaseButton>
      </li>
    </ul>
    <p v-if="searchError" class="text-loss text-sm" role="alert">{{ searchError }}</p>

    <div :class="FIELD_LABEL">
      <span aria-hidden="true">Proveedor</span>
      <SegmentedControl
        v-model="provider"
        :options="providerOptions"
        :label="`Proveedor de ${instrument.symbol}`"
        data-key="provider"
        class="flex-wrap [&>button]:h-11 [&>button]:flex-auto [&>button]:whitespace-nowrap"
      />
    </div>

    <div class="flex flex-wrap items-end gap-2.5">
      <BaseButton v-if="canSearch" :disabled="isSearching" @click="search">
        {{ isSearching ? 'Buscando…' : 'Buscar aproximados' }}
      </BaseButton>
      <BaseButton v-if="instrument.pending" :disabled="linking" @click="linkExistingMovements">
        {{ linking ? 'Guardando…' : 'Vincular movimientos' }}
      </BaseButton>
      <BaseButton variant="danger" @click="marketStore.removeInstrument(instrument.id)">
        Quitar instrumento
      </BaseButton>
    </div>

    <div v-if="linkIntent" class="grid gap-2" data-link-intent>
      <p
        :class="linkFailed ? 'text-loss' : 'text-text-muted'"
        class="text-sm"
        :role="linkFailed ? 'alert' : 'status'"
        data-link-intent-status
      >
        {{ linkStatus }}
        <template v-if="linkFailed && linkCounts && linkCounts.total > 0">
          ({{ linkCounts.confirmed }}/{{ linkCounts.total }} vinculados)
        </template>
      </p>
      <div v-if="linkFailed" class="flex flex-wrap gap-2">
        <BaseButton data-link-intent-retry @click="retryLink">Reintentar</BaseButton>
        <BaseButton variant="ghost" data-link-intent-discard @click="discardLink">
          Descartar
        </BaseButton>
      </div>
    </div>
  </div>
</template>
