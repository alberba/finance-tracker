<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'

import { getAttachmentError } from '../../../domain/reports/issue-attachments'
import type { ReportEntry } from '../../../domain/reports/report-entry'
import { REPORTER_COMMENT_MAX_LENGTH } from '../../../domain/reports/reporter-comment'
import { isDemoMode } from '../../../scripts/demo-mode'
import type { ReportAttachment } from '../../../services/issue-report-api'
import NeonButton from '../../ui/NeonButton.vue'
import { ATTACHMENT_LIMITS, encodeAttachmentFile, TEXTAREA_CLASS } from './attachment-files'
import NeonAttachmentChip from './NeonAttachmentChip.vue'
import NeonAttachmentPicker from './NeonAttachmentPicker.vue'
import NeonReportCard from './NeonReportCard.vue'
import { composerNote } from './view-model'

// «Nueva aclaración» (artboard «Mis reportes · 2560 px»): a reply on the
// report's thread, with up to three screenshots. The text survives a failed
// publish; the parent bumps `resetSignal` when it went through. In the demo it
// is disabled: nothing is sent.
const props = withDefaults(
  defineProps<{ report: ReportEntry; pending: boolean; error: string; resetSignal?: number }>(),
  { resetSignal: 0 },
)
const emit = defineEmits<{ submit: [payload: { text: string; attachments: ReportAttachment[] }] }>()

const demo = isDemoMode()

interface DraftFile {
  id: number
  file: File
}

const text = ref('')
const files = shallowRef<DraftFile[]>([])
const localError = ref('')
const announcement = ref('')
/** Covers the gap between the press and `props.pending`: encoding the files is async. */
const submitting = ref(false)
const busy = computed(() => demo || props.pending || submitting.value)
let nextId = 0

function reset(): void {
  text.value = ''
  files.value = []
  localError.value = ''
}

function onFilesPicked(event: Event): void {
  const input = event.target as HTMLInputElement
  const picked = Array.from(input.files ?? [])
  input.value = ''
  for (const file of picked) {
    const error = getAttachmentError(
      { name: file.name, size: file.size, type: file.type },
      files.value.length,
    )
    if (error) {
      localError.value = error
      return
    }
    files.value = [...files.value, { id: nextId++, file }]
  }
  localError.value = ''
}

function removeFile(id: number): void {
  files.value = files.value.filter((item) => item.id !== id)
}

async function onSubmit(): Promise<void> {
  // The parent has not marked `pending` yet while the files are encoded: without
  // this guard two presses in a row would publish the same reply twice.
  if (busy.value) return
  const value = text.value.trim()
  if (!value) {
    localError.value = 'Escribe una aclaración.'
    return
  }
  if (value.length > REPORTER_COMMENT_MAX_LENGTH) {
    localError.value = `La aclaración supera el límite de ${REPORTER_COMMENT_MAX_LENGTH} caracteres.`
    return
  }
  localError.value = ''
  submitting.value = true
  try {
    let attachments: ReportAttachment[]
    try {
      attachments = await Promise.all(files.value.map(({ file }) => encodeAttachmentFile(file)))
    } catch {
      localError.value = 'No se pudieron leer los adjuntos. Inténtalo de nuevo.'
      return
    }
    emit('submit', { text: value, attachments })
  } finally {
    submitting.value = false
  }
}

watch(
  () => props.resetSignal,
  () => {
    reset()
    announcement.value = 'Aclaración publicada.'
  },
)
</script>

<template>
  <NeonReportCard
    class="motion-safe:animate-rise gap-3.5 [animation-delay:210ms]"
    aria-labelledby="reports-composer-title"
  >
    <div class="flex flex-col gap-1">
      <h3 id="reports-composer-title" class="text-block-title font-extrabold">Nueva aclaración</h3>
      <p class="text-muted text-note">{{ composerNote(report) }}</p>
    </div>

    <form class="flex flex-col gap-3.5" novalidate @submit.prevent="onSubmit">
      <div class="flex flex-col gap-1.5">
        <textarea
          v-model="text"
          :class="TEXTAREA_CLASS"
          class="min-h-30"
          name="text"
          aria-labelledby="reports-composer-title"
          aria-describedby="reports-composer-notice"
          :maxlength="REPORTER_COMMENT_MAX_LENGTH"
          :disabled="busy"
          placeholder="Amplía, corrige o detalla lo que enviaste."
        ></textarea>
        <p class="font-display text-muted self-end text-[12px] font-semibold" aria-hidden="true">
          {{ text.length }}/{{ REPORTER_COMMENT_MAX_LENGTH }}
        </p>
      </div>

      <ul v-if="files.length > 0" class="flex flex-wrap gap-2" aria-label="Capturas adjuntas">
        <NeonAttachmentChip
          v-for="item in files"
          :key="item.id"
          :name="item.file.name"
          @remove="removeFile(item.id)"
        />
      </ul>

      <div class="flex flex-wrap items-center gap-x-3.5 gap-y-2">
        <NeonAttachmentPicker :disabled="busy" @pick="onFilesPicked" />
        <p class="text-muted text-meta min-w-55 flex-1">{{ ATTACHMENT_LIMITS }}</p>
      </div>

      <p id="reports-composer-notice" class="text-muted text-meta">
        Se publica en un repositorio público. Las capturas ya subidas no se borran de GitHub al
        quitarlas de una aclaración.
      </p>

      <p
        v-if="demo"
        class="bg-panel2 text-soft rounded-[18px] px-4 py-3.5 text-[15px] font-bold"
        role="note"
      >
        En la demo no se envían comentarios.
      </p>
      <p
        v-else-if="error || localError"
        class="bg-panel2 text-loss flex items-start gap-2.5 rounded-[18px] px-4 py-3.5 text-[15px] font-bold"
        role="alert"
      >
        <svg
          class="mt-px size-5 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M12 3l9.5 17h-19zM12 10v4M12 17h.01" />
        </svg>
        {{ error || localError }}
      </p>

      <p class="sr-only" role="status">{{ busy && !demo ? 'Publicando…' : announcement }}</p>

      <div class="flex justify-end @max-lg:*:w-full">
        <NeonButton type="submit" variant="primary" :disabled="busy" :aria-busy="busy && !demo">
          {{ busy && !demo ? 'Publicando…' : 'Publicar aclaración' }}
        </NeonButton>
      </div>
    </form>
  </NeonReportCard>
</template>
