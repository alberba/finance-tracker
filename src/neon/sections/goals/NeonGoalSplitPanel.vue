<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'

import { formatNumber } from '../../../lib/format'
import NeonButton from '../../ui/NeonButton.vue'
import NeonDetailPanel from '../../ui/NeonDetailPanel.vue'
import { parseAmount, splitView, type GoalPlan } from './view-model'

// «Repartir el ahorro»: what is saved each month (the saving budget of this
// month, to start with) shared among the goals, ten euros at a time or typed.
// Each goal says where its share gets it; the bar shows the split and the
// foot what is left to assign. Saving keeps every goal's monthly amount.
const props = defineProps<{ plans: GoalPlan[]; saving: number; today: Date }>()
const emit = defineEmits<{ save: [amounts: Record<string, number>] }>()

const open = defineModel<boolean>('open', { required: true })

const FORM_ID = 'neon-goal-split-form'
/** One hue per goal, in order, as in the artboard. */
const HUES = ['bg-accent', 'bg-lilac', 'bg-peach', 'bg-lilac2', 'bg-lilac3', 'bg-neutral-bar']

const total = ref('')
const shares = reactive<Record<string, number>>({})
/** What is typed in a share while it is not a number yet. */
const drafts = reactive<Record<string, string>>({})

watch(
  open,
  (isOpen) => {
    if (!isOpen) return
    const sum = props.plans.reduce((acc, plan) => acc + plan.monthly, 0)
    total.value = formatNumber(Math.round(props.saving || sum))
    for (const key of Object.keys(shares)) delete shares[key]
    for (const key of Object.keys(drafts)) delete drafts[key]
    for (const plan of props.plans) shares[plan.id] = plan.monthly
  },
  { immediate: true },
)

const totalAmount = computed(() => {
  const value = parseAmount(total.value)
  return Number.isFinite(value) && value > 0 ? value : 0
})
const view = computed(() => splitView(props.plans, shares, totalAmount.value, props.today))

function hue(index: number): string {
  return HUES[index % HUES.length]
}

function shareText(id: string): string {
  return drafts[id] ?? formatNumber(Math.round(shares[id] ?? 0))
}

function step(id: string, delta: number): void {
  delete drafts[id]
  shares[id] = Math.max(Math.round((shares[id] ?? 0) + delta), 0)
}

function type(id: string, text: string): void {
  drafts[id] = text
  const value = parseAmount(text)
  shares[id] = Number.isFinite(value) && value > 0 ? Math.round(value) : 0
}

function save(): void {
  emit('save', { ...shares })
}

const iconButton =
  'border-ctrl-line text-text outline-accent grid size-11 shrink-0 place-items-center rounded-full border focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-140 motion-safe:ease-out motion-safe:active:scale-[0.97]'
</script>

<template>
  <NeonDetailPanel v-model:open="open" title="Repartir el ahorro">
    <form :id="FORM_ID" class="grid grid-cols-[minmax(0,1fr)] gap-[22px]" autocomplete="off" @submit.prevent="save">
      <label class="text-muted grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 text-[13px] font-bold">
        Ahorras al mes
        <span class="border-ctrl-line flex items-baseline gap-2 border-b-2">
          <input
            v-model="total"
            name="splitTotal"
            inputmode="decimal"
            class="font-display text-text min-w-0 flex-1 bg-transparent py-0.5 text-[32px] font-bold tracking-[-0.02em] outline-none"
          />
          <span class="font-display text-muted text-[20px] font-bold" aria-hidden="true">€</span>
        </span>
      </label>

      <span
        class="flex h-3.5 gap-0.5 overflow-clip rounded-[7px] shadow-[inset_0_0_0_1px_var(--color-ctrl-line)]"
        aria-hidden="true"
      >
        <span
          v-for="(segment, index) in view.segments"
          :key="segment.id"
          class="shrink-0"
          :class="hue(index)"
          :title="segment.name"
          :style="{ width: `${segment.width}%` }"
        ></span>
      </span>

      <ul>
        <li
          v-for="(row, index) in view.rows"
          :key="row.id"
          class="border-line flex items-center justify-between gap-3 border-t py-3"
          :data-split-row="row.name"
        >
          <span class="flex min-w-0 items-start gap-2.5">
            <span
              class="mbs-1.5 size-2.5 shrink-0 rounded-[3px]"
              :class="hue(index)"
              aria-hidden="true"
            ></span>
            <span class="grid min-w-0 gap-0.5">
              <span class="truncate text-[16px] font-bold">{{ row.name }}</span>
              <span class="text-meta" :class="row.late ? 'text-loss' : 'text-muted'">
                {{ row.line }}
              </span>
            </span>
          </span>
          <span class="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              :class="iconButton"
              :aria-label="`Restar 10 € a ${row.name}`"
              @click="step(row.id, -10)"
            >
              <svg
                class="size-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                aria-hidden="true"
              >
                <path d="M5 12h14" />
              </svg>
            </button>
            <span
              class="border-ctrl-line bg-panel rounded-field flex min-h-11 w-26 items-center gap-1 border px-3"
            >
              <input
                :value="shareText(row.id)"
                inputmode="decimal"
                :aria-label="`Al mes para ${row.name}`"
                class="font-display text-text min-w-0 flex-1 bg-transparent text-end text-[15px] font-semibold outline-none"
                @input="type(row.id, ($event.target as HTMLInputElement).value)"
              />
              <span class="text-muted text-[14px]" aria-hidden="true">€</span>
            </span>
            <button
              type="button"
              :class="iconButton"
              :aria-label="`Sumar 10 € a ${row.name}`"
              @click="step(row.id, 10)"
            >
              <svg
                class="size-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </span>
        </li>
      </ul>

      <p
        class="border-line flex items-baseline justify-between gap-3 border-t pbs-3.5"
        :class="view.rest.over ? 'text-loss' : 'text-text'"
        data-split-rest
      >
        <span class="text-[15px] font-bold">{{ view.rest.label }}</span>
        <span class="font-display text-[20px] font-bold tabular-nums">{{ view.rest.amount }}</span>
      </p>
    </form>

    <template #footer>
      <NeonButton @click="open = false">Cancelar</NeonButton>
      <NeonButton variant="primary" type="submit" :form="FORM_ID">Guardar reparto</NeonButton>
    </template>
  </NeonDetailPanel>
</template>
