<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'

import { SETUP_LAST_STEP, useSetup } from '../../../composables/useSetup'
import { useDataStore } from '../../../stores/data'
import NeonButton from '../../ui/NeonButton.vue'

// «Cómo empiezas»: from scratch, or from a backup of this app. Restoring
// replaces the data and reloads the page, so the wizard is moved to «Listo»
// first; if the restore fails, it goes back here.
const setup = useSetup()
const dataStore = useDataStore()
const input = useTemplateRef<HTMLInputElement>('input')
const restoring = ref(false)

async function restore(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  restoring.value = true
  await setup.go(SETUP_LAST_STEP)
  const restored = await dataStore.importJson(file)
  if (!restored) {
    void setup.go(0)
    restoring.value = false
  }
  if (input.value) input.value.value = ''
}
</script>

<template>
  <div class="grid gap-4">
    <div class="flex flex-wrap items-center gap-x-2 gap-y-3">
      <NeonButton variant="primary" data-setup-start @click="setup.go(1)">
        Empezar de cero
      </NeonButton>
      <NeonButton :disabled="restoring" @click="input?.click()">
        {{ restoring ? 'Restaurando…' : 'Restaurar una copia de seguridad' }}
      </NeonButton>
      <input
        ref="input"
        type="file"
        accept="application/json,.json"
        class="hidden"
        aria-label="Copia de seguridad"
        @change="restore"
      />
    </div>
    <p class="text-muted text-note max-w-[560px]">
      La copia es el JSON que se descarga en Datos. Restaurarla trae tus cuentas, movimientos y
      ajustes tal como estaban.
    </p>
  </div>
</template>
