<script setup lang="ts">
import { computed, reactive, ref } from 'vue'

import BaseButton from '../ui/BaseButton.vue'
import BaseInput from '../ui/BaseInput.vue'
import SidePanel from '../ui/SidePanel.vue'
import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import { goalSlot, type GoalPace, type GoalRowViewModel } from '../../domain/goals/view-model'
import { formatPercent } from '../../lib/format'
import { formatDecimalInput, parseDecimal } from '../../lib/number'
import type { GoalKey } from '../../scripts/types'
import { useGoalsStore } from '../../stores/goals'
import { dueLabel, joinNames, monthsLabel, portfolioPaceSentence } from './goal-text'

// Defines or edits one goal in the side panel. While it is typed, the ink box
// reads what is left, the months to the deadline and the monthly amount, and
// how the pace of the goal's block changes with it.
defineProps<{ monthName: string }>()

const goalsStore = useGoalsStore()
const { formatMoney } = useMoneyFormatter()

const open = ref(false)
const key = ref<GoalKey>('short')
const isNew = ref(false)
const form = reactive({ name: '', amount: '', year: '' })

// What each goal is measured against; the three term goals share net worth.
const NET_BASE = {
  label: 'Patrimonio neto',
  note: 'Corto, medio y largo plazo comparten esta cifra.',
}
const PORTFOLIO_BASE: Partial<Record<GoalKey, { label: string; note: string }>> = {
  investmentTotal: { label: 'Valor de la cartera', note: 'Todos tus activos de inversión.' },
  investmentFunds: { label: 'Valor en fondos indexados', note: 'Una parte de la cartera.' },
  investmentCrypto: { label: 'Valor en criptomonedas', note: 'Una parte de la cartera.' },
}

const amount = computed(() => parseDecimal(form.amount))
const year = computed(() => Number(form.year))
const amountInvalid = computed(() => !Number.isFinite(amount.value) || amount.value < 0)
const yearInvalid = computed(
  () => !Number.isInteger(year.value) || year.value < 2000 || year.value > 2100,
)
const valid = computed(() => !amountInvalid.value && !yearInvalid.value)

const preview = computed(() =>
  goalsStore.preview(key.value, {
    name: form.name,
    targetAmount: amountInvalid.value ? 0 : amount.value,
    targetYear: yearInvalid.value ? new Date().getFullYear() : year.value,
  }),
)
const base = computed(() => PORTFOLIO_BASE[key.value] ?? NET_BASE)

function namesOf(pace: GoalPace): string[] {
  return pace.by.map((by) => preview.value.names[by])
}

const impact = computed(() => {
  const { group, before, after } = preview.value
  const now =
    Math.abs(after.rate - before.rate) >= 0.005 ? ` Ahora son ${formatMoney(before.rate)}.` : ''
  if (group === 'net') {
    if (!after.rate) return 'Con estos valores, los plazos de patrimonio quedan cubiertos.'
    return `El patrimonio tiene que crecer ${formatMoney(after.rate)} al mes para llegar a tiempo a sus plazos; lo marca ${joinNames(namesOf(after))}.${now}`
  }
  if (!after.rate) return 'Con estos valores, las metas de la cartera quedan cubiertas.'
  return `${portfolioPaceSentence(formatMoney(after.rate), namesOf(after))}${now}`
})

function openEdit(row: GoalRowViewModel): void {
  key.value = row.key
  isNew.value = !row.defined
  form.name = row.goal.name
  form.amount = row.defined ? formatDecimalInput(row.target) : ''
  form.year = String(row.goal.targetYear || new Date().getFullYear())
  open.value = true
}

function save(): void {
  if (!valid.value) return
  goalsStore.saveGoal(key.value, {
    name: form.name,
    targetAmount: amount.value,
    targetYear: year.value,
  })
  open.value = false
}

defineExpose({ openEdit })
</script>

<template>
  <SidePanel
    id="goal-panel"
    v-model:open="open"
    :kicker="`Objetivo · ${goalSlot(key)}`"
    :title="form.name.trim() || (isNew ? 'Nuevo objetivo' : goalSlot(key))"
    title-id="goal-panel-title"
  >
    <form id="goal-form" class="grid gap-7" autocomplete="off" @submit.prevent="save">
      <fieldset class="grid gap-3.5 sm:grid-cols-2">
        <legend class="text-text-muted mb-3 text-xs font-bold tracking-widest uppercase">
          Meta
        </legend>
        <BaseInput
          v-model="form.name"
          class="sm:col-span-2"
          label="Nombre"
          name="goalName"
          maxlength="80"
          :placeholder="goalSlot(key)"
        />
        <BaseInput
          v-model="form.amount"
          label="Importe objetivo"
          name="goalAmount"
          inputmode="decimal"
          placeholder="0,00"
          suffix="€"
          class="[&_input]:font-display [&_input]:text-right"
          :aria-invalid="amountInvalid"
          required
        />
        <BaseInput
          v-model="form.year"
          label="Año objetivo"
          name="goalYear"
          type="number"
          min="2000"
          max="2100"
          step="1"
          class="[&_input]:font-display"
          :aria-invalid="yearInvalid"
          required
        />
      </fieldset>

      <div class="grid gap-2.5">
        <p class="text-text-muted text-xs font-bold tracking-widest uppercase">Se mide contra</p>
        <div
          class="bg-subtle flex items-baseline justify-between gap-4 rounded-md px-4 py-3.5"
          data-goal-base
        >
          <span class="grid gap-1">
            <span class="text-text-main font-semibold">{{ base.label }}</span>
            <span class="text-text-muted text-sm"
              >{{ base.note }} A cierre de {{ monthName }}.</span
            >
          </span>
          <span class="font-display text-lg font-medium whitespace-nowrap tabular-nums">
            {{ formatMoney(preview.row.current) }}
          </span>
        </div>
      </div>

      <div class="grid gap-2.5">
        <p class="text-text-muted text-xs font-bold tracking-widest uppercase">Con estos valores</p>
        <div
          class="bg-ink border-ink-line text-ink-text grid gap-4.5 rounded-md border px-5 py-5"
          data-goal-preview
        >
          <div class="flex items-center gap-3.5">
            <span class="bg-ink-text/15 h-1.5 grow overflow-hidden rounded-full" aria-hidden="true">
              <span
                class="bg-ink-text block h-full rounded-full"
                :style="{ width: `${preview.row.progress}%` }"
              ></span>
            </span>
            <output for="goal-form" class="font-display text-sm font-medium tabular-nums">
              {{ formatPercent(preview.row.progress) }}
            </output>
          </div>
          <dl class="divide-ink-text/10 grid grid-cols-3 divide-x">
            <div class="grid gap-1.5 pr-3">
              <dt class="text-ink-muted text-sm">Faltan</dt>
              <dd
                class="font-display m-0 font-medium tabular-nums sm:text-lg"
                data-goal-preview-remaining
              >
                {{ preview.row.met ? 'Cumplida' : formatMoney(Math.max(preview.row.remaining, 0)) }}
              </dd>
            </div>
            <div class="grid gap-1.5 px-3">
              <dt class="text-ink-muted text-sm">
                Hasta {{ yearInvalid ? 'el plazo' : dueLabel(year) }}
              </dt>
              <dd class="font-display m-0 font-medium tabular-nums sm:text-lg">
                {{ monthsLabel(preview.row.monthsLeft) }}
              </dd>
            </div>
            <div class="grid gap-1.5 pl-3">
              <dt class="text-ink-muted text-sm">Al mes</dt>
              <dd
                class="font-display m-0 font-medium tabular-nums sm:text-lg"
                data-goal-preview-monthly
              >
                {{ preview.row.monthlyNeeded ? formatMoney(preview.row.monthlyNeeded) : '—' }}
              </dd>
            </div>
          </dl>
          <p
            class="border-ink-text/10 text-ink-muted border-t pt-3.5 text-sm leading-relaxed"
            data-goal-impact
          >
            {{ impact }}
          </p>
        </div>
      </div>
    </form>

    <template #footer>
      <BaseButton variant="ghost" @click="open = false">Cancelar</BaseButton>
      <BaseButton variant="primary" type="submit" form="goal-form" :disabled="!valid">
        {{ isNew ? 'Crear objetivo' : 'Guardar objetivo' }}
      </BaseButton>
    </template>
  </SidePanel>
</template>
