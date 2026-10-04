<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'

import { formatSignedMoney } from '../../lib/format'
import { evaluateNumericExpression } from '../../scripts/math-expression'
import { round2 } from '../../scripts/utils'
import BaseButton from '../ui/BaseButton.vue'
import SidePanel from '../ui/SidePanel.vue'

export interface WealthCalcTarget {
  key: string
  name: string
  /** The snapshot as it stands in the table: typed value, else the calculated one. */
  current: number
  calculated: number
  opening: number
}

// Works out a balance from an operation (units × price, a sum of accounts…)
// while the table stays in view, and applies the result to the snapshot cell.
// Operator keys cover what a phone's numeric keyboard lacks.
const props = defineProps<{
  target: WealthCalcTarget | null
  monthName: string
  formatMoney: (value: number) => string
  currency: string
}>()

const emit = defineEmits<{ apply: [key: string, value: number] }>()

const open = defineModel<boolean>('open', { required: true })
const expression = ref('')
const field = useTemplateRef<HTMLInputElement>('field')

watch(open, (value) => {
  if (value) expression.value = ''
})

const KEYS = [
  { label: '+', name: 'Sumar', insert: '+' },
  { label: '−', name: 'Restar', insert: '-' },
  { label: '×', name: 'Multiplicar', insert: '*' },
  { label: '÷', name: 'Dividir', insert: '/' },
  { label: '(', name: 'Abrir paréntesis', insert: '(' },
  { label: ')', name: 'Cerrar paréntesis', insert: ')' },
]

const result = computed(() => {
  const text = expression.value.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')
  const value = evaluateNumericExpression(text)
  return value === null ? null : round2(value)
})
const isEmpty = computed(() => expression.value.trim() === '')
const isInvalid = computed(() => !isEmpty.value && result.value === null)

const note = computed(() => {
  if (isEmpty.value) return 'Escribe una operación'
  if (result.value === null) return 'El cálculo no es válido'
  const diff = round2(result.value - (props.target?.current ?? 0))
  if (diff === 0) return 'Igual que el snapshot actual'
  return `${formatSignedMoney(diff, props.currency)} frente al snapshot actual`
})

// Places the caret right after the DOM update, not a frame later: a key typed
// in between would land wherever the caret was (#227).
async function insert(text: string): Promise<void> {
  const input = field.value
  const start = input?.selectionStart ?? expression.value.length
  const end = input?.selectionEnd ?? expression.value.length
  expression.value = expression.value.slice(0, start) + text + expression.value.slice(end)
  await nextTick()
  input?.focus()
  input?.setSelectionRange(start + text.length, start + text.length)
}

function apply(): void {
  if (!props.target || result.value === null) {
    field.value?.focus()
    return
  }
  emit('apply', props.target.key, result.value)
  open.value = false
}
</script>

<template>
  <SidePanel
    v-model:open="open"
    :kicker="`Snapshot · ${monthName}`"
    title="Calcular saldo"
    title-id="wealth-calc-title"
  >
    <form v-if="target" id="wealth-calc-form" class="grid gap-6" @submit.prevent="apply">
      <p class="text-text-muted -mt-3 text-base" data-calc-target>{{ target.name }}</p>
      <dl class="border-line divide-line grid grid-cols-3 divide-x border-y py-4">
        <div class="grid gap-1 pr-3">
          <dt class="text-text-muted text-sm">Snapshot actual</dt>
          <dd class="font-display m-0 font-medium tabular-nums sm:text-lg">
            {{ formatMoney(target.current) }}
          </dd>
        </div>
        <div class="grid gap-1 px-3">
          <dt class="text-text-muted text-sm">Calculado</dt>
          <dd class="font-display m-0 font-medium tabular-nums sm:text-lg">
            {{ formatMoney(target.calculated) }}
          </dd>
        </div>
        <div class="grid gap-1 pl-3">
          <dt class="text-text-muted text-sm">Apertura</dt>
          <dd class="font-display m-0 font-medium tabular-nums sm:text-lg">
            {{ formatMoney(target.opening) }}
          </dd>
        </div>
      </dl>

      <fieldset class="m-0 grid gap-3 border-0 p-0">
        <legend class="text-text-muted pb-3 text-xs font-bold tracking-widest uppercase">
          Operación
        </legend>
        <label for="wealth-calc-expression" class="sr-only">Cálculo numérico</label>
        <input
          id="wealth-calc-expression"
          ref="field"
          v-model="expression"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          placeholder="45,85*128,46"
          :aria-invalid="isInvalid"
          aria-describedby="wealth-calc-hint"
          class="border-line-strong bg-panel text-text-main placeholder:text-text-faint focus:border-primary aria-invalid:border-loss h-16 w-full rounded-md border px-4 font-mono text-2xl outline-none focus:shadow-[0_0_0_3px_var(--ring)]"
        />
        <div role="group" aria-label="Insertar operador" class="grid grid-cols-6 gap-2">
          <button
            v-for="key in KEYS"
            :key="key.label"
            type="button"
            class="border-line-strong bg-panel text-text-main hover:border-primary focus-visible:outline-primary h-11 rounded-md border font-mono text-lg focus-visible:outline-2"
            :aria-label="key.name"
            @mousedown.prevent
            @click="insert(key.insert)"
          >
            {{ key.label }}
          </button>
        </div>
        <p id="wealth-calc-hint" class="text-text-muted text-sm">
          Suma, resta, multiplica o divide. Usa coma para los decimales, sin puntos de millar:
          <span class="text-text-main font-mono">45,85*128,46</span> son 45,85 títulos a 128,46 €.
        </p>
      </fieldset>

      <div
        role="status"
        class="bg-ink text-ink-text flex items-center justify-between gap-4 rounded-md px-5 py-5"
      >
        <div class="grid gap-1">
          <span class="text-ink-muted text-sm">Resultado</span>
          <span class="text-sm" :class="isInvalid ? 'text-ink-loss' : 'text-ink-muted'">{{
            note
          }}</span>
        </div>
        <output
          for="wealth-calc-expression"
          class="font-display text-2xl font-medium whitespace-nowrap tabular-nums sm:text-3xl"
          data-calc-result
        >
          {{ result === null ? '—' : formatMoney(result) }}
        </output>
      </div>
    </form>

    <template #footer>
      <BaseButton variant="ghost" @click="open = false">Cancelar</BaseButton>
      <BaseButton
        variant="primary"
        type="submit"
        form="wealth-calc-form"
        :disabled="result === null"
      >
        Aplicar al snapshot
      </BaseButton>
    </template>
  </SidePanel>
</template>
