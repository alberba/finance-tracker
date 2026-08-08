<script setup lang="ts">
/**
 * Conflict-resolution UI (WP7). Financial conflicts are never auto-merged —
 * this dialog is the only place a conflict gets resolved: the user sees the
 * local (unsynced) value next to the server's current value and picks one
 * explicitly. Opens automatically whenever `useSyncStore().conflicts` is
 * non-empty; resolving the visible conflict reveals the next one, if any.
 */
import { computed } from 'vue'

import { useSyncStore } from '../../stores/sync'

const syncStore = useSyncStore()

const current = computed(() => syncStore.conflicts[0] ?? null)
const remainingCount = computed(() => Math.max(syncStore.conflicts.length - 1, 0))

const entityLabels: Record<string, string> = {
  account: 'Cuenta',
  category: 'Categoría',
  transaction: 'Movimiento',
  subscription: 'Suscripción',
  recurringRule: 'Regla recurrente',
  pendingMovement: 'Movimiento pendiente',
  budgetEntry: 'Partida de presupuesto',
  goal: 'Objetivo',
  contribution: 'Aportación',
  userInstrument: 'Activo',
  wealthSnapshot: 'Snapshot de patrimonio',
}

function entityLabel(entityType: string): string {
  return entityLabels[entityType] ?? entityType
}

function localSummary(conflict: NonNullable<typeof current.value>): string {
  if (conflict.local.action === 'update') {
    return JSON.stringify(conflict.local.patch, null, 2)
  }
  return 'Eliminación pendiente de confirmar.'
}

function serverSummary(conflict: NonNullable<typeof current.value>): string {
  if (!conflict.server) {
    return 'El elemento ya no existe en el servidor.'
  }
  return JSON.stringify(conflict.server, null, 2)
}

async function resolve(resolution: 'keepLocal' | 'keepServer'): Promise<void> {
  if (!current.value) {
    return
  }
  await syncStore.resolveConflict(current.value.seq, resolution)
}
</script>

<template>
  <div
    v-if="current"
    class="conflict-dialog-backdrop"
    role="presentation"
    data-conflict-resolution-dialog
  >
    <div
      class="conflict-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="conflict-dialog-title"
    >
      <h2 id="conflict-dialog-title" class="conflict-dialog-title">
        Conflicto de sincronización — {{ entityLabel(current.entityType) }}
      </h2>
      <p class="conflict-dialog-copy">
        Este elemento cambió en otro dispositivo antes de que tu edición llegara al servidor.
        Elige qué versión conservar; no se combinan automáticamente.
      </p>

      <div class="conflict-dialog-columns">
        <section class="conflict-dialog-column">
          <h3>Tu versión (local)</h3>
          <pre class="conflict-dialog-json">{{ localSummary(current) }}</pre>
          <button type="button" class="conflict-dialog-action" @click="resolve('keepLocal')">
            Mantener la mía
          </button>
        </section>
        <section class="conflict-dialog-column">
          <h3>Versión del servidor</h3>
          <pre class="conflict-dialog-json">{{ serverSummary(current) }}</pre>
          <button type="button" class="conflict-dialog-action" @click="resolve('keepServer')">
            Mantener la del servidor
          </button>
        </section>
      </div>

      <p v-if="remainingCount > 0" class="conflict-dialog-footer">
        {{ remainingCount }} conflicto(s) más pendiente(s) tras este.
      </p>
    </div>
  </div>
</template>

<style scoped>
.conflict-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: color-mix(in srgb, #05060a 55%, transparent);
}

.conflict-dialog {
  width: min(640px, 100%);
  max-height: 85vh;
  overflow-y: auto;
  border-radius: 1rem;
  padding: 1.5rem;
  background: var(--surface, #12141c);
  color: var(--text, #e9ecf5);
  border: 1px solid color-mix(in srgb, #ffffff 12%, transparent);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
}

.conflict-dialog-title {
  margin: 0 0 0.5rem;
  font-size: 1.05rem;
  font-weight: 700;
}

.conflict-dialog-copy {
  margin: 0 0 1rem;
  opacity: 0.75;
  font-size: 0.9rem;
}

.conflict-dialog-columns {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
}

@media (min-width: 560px) {
  .conflict-dialog-columns {
    grid-template-columns: 1fr 1fr;
  }
}

.conflict-dialog-column h3 {
  margin: 0 0 0.4rem;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  opacity: 0.7;
}

.conflict-dialog-json {
  max-height: 220px;
  overflow: auto;
  padding: 0.6rem;
  border-radius: 0.5rem;
  background: color-mix(in srgb, #000000 25%, transparent);
  font-size: 0.75rem;
  white-space: pre-wrap;
  word-break: break-word;
}

.conflict-dialog-action {
  margin-top: 0.6rem;
  width: 100%;
  padding: 0.5rem 0.8rem;
  border-radius: 0.5rem;
  border: 1px solid color-mix(in srgb, #ffffff 16%, transparent);
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-weight: 600;
}

.conflict-dialog-action:hover {
  background: color-mix(in srgb, #ffffff 8%, transparent);
}

.conflict-dialog-footer {
  margin: 1rem 0 0;
  font-size: 0.8rem;
  opacity: 0.6;
}
</style>
