<script setup lang="ts">
import type { GoalEditorViewModel } from '../../domain/goals/view-model'
import type { GoalField, GoalKey } from '../../scripts/types'

defineProps<{
  editor: GoalEditorViewModel
}>()

const emit = defineEmits<{
  'update-goal-field': [payload: { key: GoalKey; field: GoalField; value: string }]
}>()

function updateField(key: GoalKey, field: GoalField, event: Event): void {
  const target = event.target
  const value = target instanceof HTMLInputElement ? target.value : ''
  emit('update-goal-field', { key, field, value })
}
</script>

<template>
  <article class="card" :data-goal-card="editor.key">
    <h3>{{ editor.title }}</h3>
    <label>
      Nombre
      <input
        type="text"
        autocomplete="off"
        :name="`goal-${editor.key}-name`"
        :data-goal="editor.key"
        data-field="name"
        :value="editor.goal.name"
        @input="updateField(editor.key, 'name', $event)"
      />
    </label>
    <label>
      Año objetivo
      <input
        type="number"
        min="2000"
        max="2100"
        autocomplete="off"
        :name="`goal-${editor.key}-year`"
        :data-goal="editor.key"
        data-field="targetYear"
        :value="editor.goal.targetYear"
        @input="updateField(editor.key, 'targetYear', $event)"
      />
    </label>
    <label>
      Monto objetivo
      <input
        type="number"
        min="0"
        step="0.01"
        autocomplete="off"
        :name="`goal-${editor.key}-amount`"
        :data-goal="editor.key"
        data-field="targetAmount"
        :value="editor.goal.targetAmount"
        @input="updateField(editor.key, 'targetAmount', $event)"
      />
    </label>
  </article>
</template>
