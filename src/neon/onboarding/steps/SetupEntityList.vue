<script setup lang="ts">
import { computed, ref } from 'vue'

import { useMediaQuery } from '../../../composables/useMediaQuery'
import { useMoneyFormatter } from '../../../composables/useMoneyFormatter'
import { useFinancialStateStore } from '../../../stores/financial-state'
import { useSettingsStore } from '../../../stores/settings'
import { useEntityActions } from '../../sections/settings/entity-actions'
import NeonFigure from '../../ui/NeonFigure.vue'
import NeonSwitch from '../../ui/NeonSwitch.vue'
import { FRAME_QUERY } from '../../ui/sheet-drag'

// The accounts, or the investments, created in the wizard: one row each, and
// a form to add another. An account also says whether it is liquidity, and an
// investment may carry the symbol that prices it.
const props = defineProps<{ kind: 'accounts' | 'investmentAssets' }>()

const financial = useFinancialStateStore()
const settingsStore = useSettingsStore()
const { words, add } = useEntityActions(props.kind)
const { formatMoney } = useMoneyFormatter()
const desktopFrame = useMediaQuery(FRAME_QUERY)

const isAccounts = props.kind === 'accounts'
const rows = computed(() => financial.state[props.kind])
const liquidity = computed(() => new Set(financial.state.twrLiquidityAccountIds))

const name = ref('')
const balance = ref('')
const symbol = ref('')
const liquid = ref(true)
// On a phone the form stays folded behind «Añadir» until it is needed.
const formOpen = ref(rows.value.length === 0)
const showForm = computed(() => desktopFrame.value || formOpen.value)

function submit(): void {
  if (!add(name.value, balance.value, symbol.value)) return
  if (isAccounts && liquid.value) {
    const created = rows.value.at(-1)
    if (created) settingsStore.setLiquidity(created.id, true)
  }
  name.value = ''
  balance.value = ''
  symbol.value = ''
  formOpen.value = false
}

const FIELD =
  'border-ctrl-line bg-panel text-text rounded-field min-h-[46px] w-full min-w-0 border px-3.5 text-[16px] font-bold placeholder:text-faint placeholder:font-semibold'
const LABEL = 'text-muted text-[13px] font-bold'
</script>

<template>
  <div class="grid gap-3">
    <div class="bg-panel border-line rounded-card border">
      <ul
        v-if="rows.length"
        class="frame:px-7 divide-line grid divide-y px-4 py-1"
        :aria-label="isAccounts ? 'Cuentas creadas' : 'Inversiones creadas'"
      >
        <li v-for="row in rows" :key="row.id" class="flex min-h-[68px] items-center gap-3.5">
          <span class="min-w-0 flex-1 truncate text-[16px] font-bold">{{ row.name }}</span>
          <label
            v-if="isAccounts"
            class="text-soft flex items-center gap-2.5 text-[14px] font-bold"
          >
            <span class="frame:inline hidden">Liquidez</span>
            <NeonSwitch
              :model-value="liquidity.has(row.id)"
              :label="`${row.name} cuenta como liquidez`"
              @update:model-value="settingsStore.setLiquidity(row.id, $event)"
            />
          </label>
          <NeonFigure
            :value="formatMoney(row.openingBalance)"
            class="frame:min-w-[150px] text-end text-[16px] font-semibold"
          />
        </li>
      </ul>

      <form
        v-if="showForm"
        class="frame:grid-cols-[1.4fr_1fr_auto_auto] frame:px-7 grid items-end gap-3.5 px-4 pbs-5 pbe-6"
        :class="{ 'border-line border-t': rows.length }"
        :aria-label="words.fresh"
        @submit.prevent="submit"
      >
        <label class="grid gap-1.5">
          <span :class="LABEL">Nombre</span>
          <input
            v-model="name"
            :class="FIELD"
            autocomplete="off"
            :placeholder="isAccounts ? 'Por ejemplo, Cuenta nómina' : 'Por ejemplo, Fondo indexado'"
          />
        </label>
        <label class="grid gap-1.5">
          <span :class="LABEL">{{ isAccounts ? 'Saldo actual' : 'Valor actual' }}</span>
          <input
            v-model="balance"
            :class="FIELD"
            class="text-end"
            inputmode="decimal"
            autocomplete="off"
            placeholder="0,00"
          />
        </label>
        <div
          v-if="isAccounts"
          class="text-soft flex min-h-[46px] items-center gap-2.5 text-[14px] font-bold"
        >
          <NeonSwitch v-model="liquid" label="La nueva cuenta cuenta como liquidez" />
          <span aria-hidden="true">Liquidez</span>
        </div>
        <label v-else class="grid gap-1.5">
          <span :class="LABEL">Símbolo (opcional)</span>
          <input
            v-model="symbol"
            :class="FIELD"
            class="frame:w-[130px] uppercase"
            autocomplete="off"
            placeholder="VWCE"
          />
        </label>
        <button
          type="submit"
          class="border-ctrl-line text-text rounded-pill outline-accent inline-flex min-h-11 items-center justify-center gap-2 border px-4.5 text-[14px] font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:active:scale-[0.97]"
        >
          <svg
            viewBox="0 0 24 24"
            class="size-4.5"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Añadir {{ words.one }}
        </button>
      </form>
    </div>

    <button
      v-if="!showForm"
      type="button"
      class="border-line rounded-card text-text outline-accent flex min-h-15 items-center gap-3 border border-dashed px-4 text-[15px] font-extrabold focus-visible:outline-2"
      @click="formOpen = true"
    >
      <svg
        viewBox="0 0 24 24"
        class="size-5"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
      Añadir {{ words.one }}
    </button>
  </div>
</template>
