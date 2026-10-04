<script setup lang="ts">
import { computed, reactive, ref } from 'vue'

import BaseButton from '../ui/BaseButton.vue'
import BaseInput from '../ui/BaseInput.vue'
import SidePanel from '../ui/SidePanel.vue'
import PanelSectionTitle from '../ui/PanelSectionTitle.vue'
import { formatDecimalInput, parseDecimal } from '../../lib/number'
import type { Entity, EntityKey } from '../../scripts/types'
import { useSettingsStore } from '../../stores/settings'

// The card of an account, asset or liability in the side panel: its name and
// opening balance, saved with the footer button. When editing, the default
// slot adds the sections that hang from the entity (liquidity, quotes, Stock
// Events); those apply at once, like the switches elsewhere.
const props = defineProps<{
  entityKey: EntityKey
  panelId: string
  kicker: string
  /** Title when creating, e.g. "Nueva cuenta". */
  newTitle: string
  /** Its submit button when creating, e.g. "Crear cuenta". */
  createLabel: string
  balanceLabel: string
}>()

const emit = defineEmits<{ delete: [entity: Entity] }>()

const settingsStore = useSettingsStore()

const open = ref(false)
const editing = ref<Entity | null>(null)
const form = reactive({ name: '', openingBalance: '' })

const isEditing = computed(() => editing.value !== null)
const formId = computed(() => `${props.panelId}-form`)

function openNew(): void {
  editing.value = null
  Object.assign(form, { name: '', openingBalance: '' })
  open.value = true
}

function openEdit(entity: Entity): void {
  editing.value = entity
  Object.assign(form, {
    name: entity.name,
    openingBalance: formatDecimalInput(entity.openingBalance),
  })
  open.value = true
}

function save(): void {
  const balance = parseDecimal(form.openingBalance)
  const amount = Number.isFinite(balance) ? balance : 0
  const saved = editing.value
    ? settingsStore.saveEntity(props.entityKey, editing.value.id, form.name, amount)
    : settingsStore.addEntity(props.entityKey, form.name, String(amount))
  if (saved) open.value = false
}

function requestDelete(): void {
  const entity = editing.value
  open.value = false
  if (entity) emit('delete', entity)
}

defineExpose({ openNew, openEdit })
</script>

<template>
  <SidePanel
    :id="panelId"
    v-model:open="open"
    :kicker="kicker"
    :title="editing ? editing.name : newTitle"
    :title-id="`${panelId}-title`"
  >
    <form :id="formId" autocomplete="off" @submit.prevent="save">
      <fieldset class="grid gap-3.5 sm:grid-cols-[1fr_12rem]">
        <PanelSectionTitle>Partida</PanelSectionTitle>
        <BaseInput v-model="form.name" label="Nombre" name="name" required />
        <BaseInput
          v-model="form.openingBalance"
          :label="`${balanceLabel} (€)`"
          name="openingBalance"
          inputmode="decimal"
          placeholder="0,00"
          class="[&_input]:font-display [&_input]:text-right [&_input]:tabular-nums"
        />
      </fieldset>
    </form>

    <slot v-if="editing" :entity="editing" />

    <template #footer>
      <BaseButton v-if="isEditing" variant="danger" class="mr-auto" @click="requestDelete">
        Eliminar
      </BaseButton>
      <BaseButton variant="ghost" @click="open = false">Cancelar</BaseButton>
      <BaseButton variant="primary" type="submit" :form="formId">
        {{ isEditing ? 'Guardar cambios' : createLabel }}
      </BaseButton>
    </template>
  </SidePanel>
</template>
