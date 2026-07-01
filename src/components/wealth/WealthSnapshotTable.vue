<script setup lang="ts">
import type { SnapshotRowViewModel } from '../../domain/wealth/view-model'
import type { SnapshotKind } from '../../scripts/types'

const props = defineProps<{
  title: string
  headerLabel: string
  kind: SnapshotKind
  listId: string
  rows: SnapshotRowViewModel[]
  inputs: Record<string, string>
  formatMoney: (value: number) => string
}>()

const emit = defineEmits<{
  openCalc: [row: SnapshotRowViewModel]
  updateSnapshot: [key: string, value: string]
}>()

function keyOf(id: string): string {
  return `${props.kind}:${id}`
}

function onInput(id: string, event: Event): void {
  emit('updateSnapshot', keyOf(id), (event.target as HTMLInputElement).value)
}
</script>

<template>
  <article class="card">
    <h3>{{ title }}</h3>
    <div class="table-wrap compact">
      <table>
        <thead>
          <tr>
            <th>{{ headerLabel }}</th>
            <th>Apertura</th>
            <th>Calculado</th>
            <th>Snapshot</th>
          </tr>
        </thead>
        <tbody :id="listId">
          <tr v-if="!rows.length">
            <td colspan="4">No hay elementos configurados.</td>
          </tr>
          <tr v-for="row in rows" v-else :key="row.id">
            <td>{{ row.name }}</td>
            <td>{{ formatMoney(row.opening) }}</td>
            <td>{{ formatMoney(row.calculated) }}</td>
            <td>
              <div class="snapshot-field-stack">
                <input
                  :value="inputs[keyOf(row.id)]"
                  type="number"
                  :name="`snapshot-${kind}-${row.id}`"
                  autocomplete="off"
                  step="0.01"
                  :data-snapshot-kind="kind"
                  :data-snapshot-id="row.id"
                  placeholder="Auto"
                  :aria-label="`Snapshot de ${row.name}`"
                  @input="onInput(row.id, $event)"
                />
                <button
                  v-if="kind === 'investments'"
                  type="button"
                  class="tx-btn-secondary snapshot-calc-btn"
                  :aria-label="`Abrir cálculo de ${row.name}`"
                  @click="emit('openCalc', row)"
                >
                  Calcular
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </article>
</template>
