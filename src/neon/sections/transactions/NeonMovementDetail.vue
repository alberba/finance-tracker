<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'

import { formatDecimalInput, parseDecimal } from '../../../lib/number'
import type { Transaction } from '../../../scripts/types'
import { useMovementsStore } from '../../../stores/movements'
import NeonButton from '../../ui/NeonButton.vue'
import NeonDetailPanel from '../../ui/NeonDetailPanel.vue'
import type { AmountTone, MovementDetail } from './registry-view-model'

// The detail of one movement in the shared detail panel: its data, how its
// category stands against the budget and the latest movements with the same
// description (artboard «Movimientos», open row). «Editar» turns it into the
// form of the artboard (amount, description, category) and «Guardar» saves
// through the movements store, with its validations. A Bitvavo operation is
// read only. «Eliminar» is left to the registry, which offers to undo it.
const props = defineProps<{
  movement: Transaction | null
  detail: MovementDetail | null
}>()

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ delete: [movement: Transaction] }>()

const movementsStore = useMovementsStore()
const editing = ref(false)
const form = reactive({ amount: '', description: '', category: '' })

const TONE: Record<AmountTone, string> = {
  gain: 'text-gain',
  lilac: 'text-lilac',
  text: 'text-text',
}

const locked = computed(() => Boolean(props.movement?.remoteOperation))
const categories = computed(() => {
  const movement = props.movement
  if (!movement) return []
  const names = movementsStore.orderedCategories(movement.type)
  return movement.category && !names.includes(movement.category)
    ? [movement.category, ...names]
    : names
})

// Every opening starts in reading mode.
watch(
  () => [open.value, props.movement?.id],
  () => {
    editing.value = false
  },
)

function startEdit(): void {
  const movement = props.movement
  if (!movement) return
  form.amount = formatDecimalInput(Math.abs(Number(movement.amount) || 0))
  form.description = movement.description
  form.category = movement.category
  editing.value = true
}

function save(): void {
  const movement = props.movement
  if (!movement) return
  const amount = parseDecimal(form.amount)
  const saved = movementsStore.saveEdit(movement.id, {
    date: movement.date,
    month: movement.month,
    accountId: movement.accountId,
    destinationAccountId: movement.destinationAccountId,
    type: movement.type,
    category: form.category,
    description: form.description,
    amount: Number.isFinite(amount) ? String(amount) : '',
  })
  if (saved) editing.value = false
}

const fieldClass =
  'bg-panel border-ctrl-line text-text outline-accent rounded-field min-h-[46px] w-full min-w-0 border px-3.5 font-bold focus-visible:outline-2 focus-visible:outline-offset-2'
const labelClass = 'text-muted grid min-w-0 gap-1.5 text-[13px] font-bold'
</script>

<template>
  <NeonDetailPanel
    v-model:open="open"
    :title="detail?.title ?? ''"
    :kicker="detail?.kicker"
    data-movement-detail
  >
    <template v-if="detail && movement">
      <form
        v-if="editing"
        id="neon-movement-edit"
        class="grid gap-[18px]"
        novalidate
        @submit.prevent="save"
      >
        <label :class="labelClass">
          Importe
          <input
            v-model="form.amount"
            name="amount"
            inputmode="decimal"
            :class="[fieldClass, 'font-display text-[18px] tabular-nums']"
          />
        </label>
        <label :class="labelClass">
          Descripción
          <input
            v-model="form.description"
            name="description"
            maxlength="140"
            :class="[fieldClass, 'text-[16px]']"
          />
        </label>
        <div class="grid gap-2">
          <span id="neon-movement-category" class="text-muted text-[13px] font-bold"
            >Categoría</span
          >
          <div class="flex flex-wrap gap-2" role="group" aria-labelledby="neon-movement-category">
            <button
              v-for="name in categories"
              :key="name"
              type="button"
              :aria-pressed="form.category === name"
              class="outline-accent rounded-pill min-h-[38px] border px-3.5 text-[13px] font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2"
              :class="
                form.category === name
                  ? 'bg-sel-bg border-sel-border text-sel-text'
                  : 'border-ctrl-line text-soft'
              "
              @click="form.category = name"
            >
              {{ name }}
            </button>
          </div>
        </div>
      </form>

      <template v-else>
        <p
          class="font-display text-[22px] font-semibold tracking-[-0.02em] tabular-nums"
          :class="TONE[detail.tone]"
          data-detail-amount
        >
          {{ detail.amount }}
        </p>
        <dl class="grid text-[14px]">
          <div
            v-for="field in detail.fields"
            :key="field.label"
            class="border-line flex justify-between gap-3 border-t py-[9px]"
          >
            <dt class="text-muted">{{ field.label }}</dt>
            <dd class="text-end font-bold">{{ field.value }}</dd>
          </div>
        </dl>
        <div v-if="detail.budget" class="border-line grid gap-2 border-t pbs-[9px]">
          <div class="flex items-baseline justify-between gap-3 text-[14px]">
            <span class="font-extrabold">{{ detail.budget.title }}</span>
            <span class="text-soft tabular-nums">{{ detail.budget.text }}</span>
          </div>
          <div class="bg-line rounded-pill h-1.5 overflow-hidden" aria-hidden="true">
            <span
              class="rounded-pill block h-full"
              :class="detail.budget.over ? 'bg-loss' : 'bg-neutral-bar'"
              :style="{ width: `${detail.budget.width}%` }"
            ></span>
          </div>
        </div>
        <div v-if="detail.same.length" class="border-line grid gap-0.5 border-t pbs-[9px]">
          <h3 class="mbe-1 text-[14px] font-extrabold">{{ detail.sameTitle }}</h3>
          <div
            v-for="item in detail.same"
            :key="item.label + item.value"
            class="text-soft flex justify-between gap-3 py-[3px] text-[14px] tabular-nums"
          >
            <span>{{ item.label }}</span>
            <span>{{ item.value }}</span>
          </div>
        </div>
        <p v-if="locked" class="text-muted text-[14px]">
          Viene de Bitvavo: se cambia desde Inversión.
        </p>
      </template>
    </template>

    <template v-if="movement && !locked" #footer>
      <template v-if="editing">
        <NeonButton @click="editing = false">Descartar</NeonButton>
        <NeonButton variant="primary" type="submit" form="neon-movement-edit">Guardar</NeonButton>
      </template>
      <template v-else>
        <NeonButton danger class="me-auto" @click="emit('delete', movement)">Eliminar</NeonButton>
        <NeonButton @click="startEdit">Editar</NeonButton>
      </template>
    </template>
  </NeonDetailPanel>
</template>
