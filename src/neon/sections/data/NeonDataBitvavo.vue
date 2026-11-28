<script setup lang="ts">
import { computed, onMounted } from 'vue'

import { useBitvavoImport } from '../../../composables/useBitvavoImport'
import { formatLongDate, formatShortDate } from '../../../lib/format'
import { getPathFromSection } from '../../../scripts/app/dashboard-section-routing'
import NeonButton from '../../ui/NeonButton.vue'
import {
  bitvavoConfirmLabel,
  bitvavoDetail,
  bitvavoHeadline,
  bitvavoSummary,
  needsResolution,
} from './view-model'

// The Bitvavo origin of the import flow: the account must be connected in
// Configuración, then a preview says how many operations are new and which
// look like a movement of yours (those need a choice), and «Importar» brings
// the new ones. The connection and the preview are the shared composable's.
const emit = defineEmits<{ done: [counts: { imported: number; duplicates: number }] }>()

const {
  form,
  configured,
  busy,
  error,
  preview,
  resolutions,
  canConfirm,
  load,
  generatePreview,
  confirm,
} = useBitvavoImport()

onMounted(() => void load())

const summary = computed(() => (preview.value ? bitvavoSummary(preview.value) : null))
const toResolve = computed(() => preview.value?.operations.filter(needsResolution) ?? [])
const since = computed(() =>
  form.startDate ? `desde el ${formatLongDate(form.startDate)} · ${form.timeZone}` : form.timeZone,
)

async function importAll(): Promise<void> {
  const current = summary.value
  if (!current) return
  await confirm()
  if (error.value) return
  emit('done', { imported: current.fresh, duplicates: current.duplicates })
}
</script>

<template>
  <div class="flex flex-col gap-3" data-data-bitvavo>
    <p v-if="busy && !preview && !configured" role="status" class="text-soft text-[15px]">
      Consultando Bitvavo…
    </p>

    <template v-else-if="!configured">
      <p class="text-soft text-[15px]">
        Aún no has conectado tu cuenta de Bitvavo. Conéctala con una clave de solo lectura en
        Configuración y vuelve aquí a traer tus operaciones.
      </p>
      <a
        :href="getPathFromSection('settings')"
        class="text-text outline-accent rounded-pill text-note inline-flex min-h-11 items-center self-start px-4 font-extrabold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Ir a Configuración
      </a>
      <div class="flex"><slot name="back" /></div>
    </template>

    <template v-else>
      <p class="text-muted text-label tracking-label font-extrabold uppercase">
        Bitvavo · {{ since }}
      </p>

      <template v-if="!preview || !summary">
        <p class="text-soft text-[15px]">
          Compras y ventas de tu cuenta. Antes de importar verás cuántas son nuevas.
        </p>
        <div class="flex flex-wrap items-center gap-2.5">
          <slot name="back" />
          <NeonButton variant="primary" :disabled="busy" :aria-busy="busy" @click="generatePreview">
            {{ busy ? 'Consultando Bitvavo…' : 'Preparar vista previa' }}
          </NeonButton>
        </div>
      </template>

      <template v-else>
        <p class="text-[18px] leading-[1.35] font-bold" data-bitvavo-headline>
          <template v-for="(part, index) in bitvavoHeadline(summary)" :key="index">
            <span v-if="part.figure" class="font-display font-bold">{{ part.text }}</span>
            <template v-else>{{ part.text }}</template>
          </template>
        </p>
        <p class="text-soft text-[15px]">{{ bitvavoDetail(summary) }}</p>

        <ul v-if="toResolve.length" class="grid gap-2.5">
          <li v-for="operation in toResolve" :key="operation.externalId">
            <label class="grid gap-1.5">
              <span class="text-muted text-meta font-bold">
                Resolver {{ operation.symbol }} del {{ formatShortDate(operation.date) }}
              </span>
              <select
                v-model="resolutions[operation.externalId]"
                class="bg-panel border-ctrl-line text-text rounded-field outline-accent min-h-[46px] border px-3.5 text-[16px] font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <option :value="undefined" disabled>Elige una resolución</option>
                <option value="">Crear un movimiento nuevo</option>
                <option
                  v-for="candidate in operation.candidates"
                  :key="candidate.id"
                  :value="candidate.id"
                >
                  Vincular: {{ candidate.description }} ({{ formatShortDate(candidate.date) }})
                </option>
              </select>
            </label>
          </li>
        </ul>

        <div class="flex flex-wrap items-center gap-2.5">
          <slot name="back" />
          <NeonButton
            variant="primary"
            :disabled="busy || !canConfirm || summary.fresh === 0"
            :aria-busy="busy"
            @click="importAll"
          >
            {{ bitvavoConfirmLabel(summary) }}
          </NeonButton>
        </div>
      </template>
    </template>

    <p v-if="error" role="alert" class="text-loss text-note font-bold">{{ error }}</p>
  </div>
</template>
