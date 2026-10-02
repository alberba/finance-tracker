<script setup lang="ts">
import { reactive } from 'vue'

import type { Entity, EntityKey } from '../../scripts/types'
import { useSettingsStore } from '../../stores/settings'

const props = defineProps<{
  sectionId: string
  num: string
  title: string
  description?: string
  entityKey: EntityKey
  listId: string
  formId: string
  items: Entity[]
  namePlaceholder: string
  balancePlaceholder: string
  balanceLabel: string
}>()

const settingsStore = useSettingsStore()

const draft = reactive({ name: '', openingBalance: '' })

function onAdd(): void {
  const added = settingsStore.addEntity(props.entityKey, draft.name, draft.openingBalance)
  if (added) {
    draft.name = ''
    draft.openingBalance = ''
  }
}

function onNameChange(id: string, event: Event): void {
  const input = event.target as HTMLInputElement
  settingsStore.updateEntityField(props.entityKey, id, 'name', input.value)
}

function onBalanceChange(id: string, event: Event): void {
  const input = event.target as HTMLInputElement
  settingsStore.updateEntityField(props.entityKey, id, 'openingBalance', input.value)
}
</script>

<template>
  <section :id="sectionId" class="settings-block">
    <header>
      <span class="settings-block__num">{{ num }}</span>
      <h3>{{ title }}</h3>
      <p v-if="description">{{ description }}</p>
    </header>
    <div class="settings-block__body">
      <div class="ledger">
        <div v-if="items.length" class="ledger-head" aria-hidden="true">
          <span>Nombre</span>
          <span>{{ balanceLabel }}</span>
          <span></span>
        </div>
        <div :id="listId" class="list-stack">
          <p v-if="!items.length" class="list-item"><small>Sin elementos.</small></p>
          <div v-for="item in items" v-else :key="item.id" class="list-item ledger-row">
            <input
              type="text"
              autocomplete="off"
              :value="item.name"
              :aria-label="`Nombre ${item.name}`"
              @change="onNameChange(item.id, $event)"
            />
            <input
              type="number"
              autocomplete="off"
              step="0.01"
              :value="Number(item.openingBalance || 0)"
              :aria-label="`${balanceLabel} de ${item.name}`"
              @change="onBalanceChange(item.id, $event)"
            />
            <button
              class="delete-btn"
              type="button"
              :aria-label="`Eliminar ${item.name}`"
              @click="settingsStore.removeEntity(entityKey, item.id)"
            >
              Eliminar
            </button>
          </div>
        </div>
        <form :id="formId" class="mini-form" autocomplete="off" @submit.prevent="onAdd">
          <input
            v-model="draft.name"
            type="text"
            name="name"
            :placeholder="namePlaceholder"
            required
            autocomplete="off"
          />
          <input
            v-model="draft.openingBalance"
            type="number"
            name="openingBalance"
            step="0.01"
            min="0"
            :placeholder="balancePlaceholder"
            required
            autocomplete="off"
          />
          <button type="submit" class="secondary-btn">Agregar</button>
        </form>
      </div>
    </div>
  </section>
</template>
