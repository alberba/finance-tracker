<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'

import { getAttachmentError, ISSUE_ATTACHMENT_TYPES } from '../../domain/reports/issue-attachments'
import { REPORTER_COMMENT_MAX_LENGTH } from '../../domain/reports/reporter-comment'
import { isDemoMode } from '../../scripts/demo-mode'
import type { ReportAttachment } from '../../services/issue-report-api'
import BaseButton from '../ui/BaseButton.vue'
import { FIELD_LABEL } from '../ui/field'
import AttachmentList from './AttachmentList.vue'
import { ATTACHMENT_LIMITS, COMMENT_TEXTAREA, encodeAttachmentFile } from './report-form'

// Compositor de una aclaración nueva. Mismas reglas de adjuntos que el panel
// del reporte; en demo queda desactivado.
const props = withDefaults(
  defineProps<{ pending: boolean; error: string; resetSignal?: number }>(),
  { resetSignal: 0 },
)
const emit = defineEmits<{ submit: [payload: { text: string; attachments: ReportAttachment[] }] }>()

const demo = isDemoMode()

interface DraftAttachment {
  id: number
  file: File
  previewUrl: string
}

const text = ref('')
const attachments = shallowRef<DraftAttachment[]>([])
const localError = ref('')
const announcement = ref('')
/** Cubre la ventana entre el envío y `props.pending`: codificar adjuntos es async. */
const submitting = ref(false)
const busy = computed(() => demo || props.pending || submitting.value)
let nextId = 0

const rows = computed(() =>
  attachments.value.map((item) => ({
    id: item.id,
    name: item.file.name,
    previewUrl: item.previewUrl,
  })),
)

function revoke(items: DraftAttachment[]): void {
  for (const item of items) URL.revokeObjectURL(item.previewUrl)
}

function reset(): void {
  text.value = ''
  revoke(attachments.value)
  attachments.value = []
  localError.value = ''
}

onBeforeUnmount(() => revoke(attachments.value))

function onFilesPicked(event: Event): void {
  const input = event.target as HTMLInputElement
  const picked = Array.from(input.files ?? [])
  input.value = ''

  for (const file of picked) {
    const error = getAttachmentError(
      { name: file.name, size: file.size, type: file.type },
      attachments.value.length,
    )
    if (error) {
      localError.value = error
      return
    }
    attachments.value = [
      ...attachments.value,
      { id: nextId++, file, previewUrl: URL.createObjectURL(file) },
    ]
  }
  localError.value = ''
}

function removeAttachment(id: number): void {
  revoke(attachments.value.filter((item) => item.id === id))
  attachments.value = attachments.value.filter((item) => item.id !== id)
}

async function encodeAttachments(): Promise<ReportAttachment[]> {
  return Promise.all(attachments.value.map(({ file }) => encodeAttachmentFile(file)))
}

async function onSubmit(): Promise<void> {
  // El padre aún no ha marcado `pending` mientras se codifican los adjuntos:
  // sin esta guarda, dos envíos seguidos publicarían la misma aclaración dos veces.
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
    let encoded: ReportAttachment[]
    try {
      encoded = await encodeAttachments()
    } catch {
      localError.value = 'No se pudieron leer los adjuntos. Inténtalo de nuevo.'
      return
    }
    emit('submit', { text: value, attachments: encoded })
  } finally {
    submitting.value = false
  }
}

// El padre incrementa la señal cuando el alta se publicó: limpia el borrador.
watch(
  () => props.resetSignal,
  () => {
    reset()
    announcement.value = 'Aclaración publicada.'
  },
)
</script>

<template>
  <form class="grid gap-4" novalidate @submit.prevent="onSubmit">
    <div :class="FIELD_LABEL">
      <label for="report-comment-text">Nueva aclaración</label>
      <textarea
        id="report-comment-text"
        v-model="text"
        :class="COMMENT_TEXTAREA"
        name="text"
        :maxlength="REPORTER_COMMENT_MAX_LENGTH"
        :disabled="busy"
        placeholder="Amplía, corrige o detalla lo que enviaste."
      ></textarea>
      <p class="text-text-muted text-xs tabular-nums" aria-hidden="true">
        {{ text.length }}/{{ REPORTER_COMMENT_MAX_LENGTH }}
      </p>
    </div>

    <div :class="FIELD_LABEL">
      <label for="report-comment-attachments">Capturas (opcional)</label>
      <input
        id="report-comment-attachments"
        type="file"
        name="attachments"
        :accept="ISSUE_ATTACHMENT_TYPES.join(',')"
        multiple
        :disabled="busy"
        class="text-text-muted file:bg-subtle file:text-text-main text-sm file:mr-3 file:rounded-md file:px-3 file:py-2"
        @change="onFilesPicked"
      />
      <p class="text-text-muted text-sm">{{ ATTACHMENT_LIMITS }}</p>
    </div>

    <AttachmentList :items="rows" label="Capturas adjuntas">
      <template #action="{ item }">
        <BaseButton variant="ghost" @click="removeAttachment(Number(item.id))">
          Quitar {{ item.name }}
        </BaseButton>
      </template>
    </AttachmentList>

    <p id="report-comment-notice" class="text-text-muted text-sm leading-relaxed">
      Se publica en un repositorio público. Las capturas ya subidas no se borran de GitHub al
      quitarlas de una aclaración.
    </p>

    <p v-if="demo" class="bg-subtle text-text-muted rounded-md px-4 py-3 text-sm" role="note">
      En la demo no se envían comentarios.
    </p>
    <p
      v-else-if="props.error || localError"
      class="bg-expense-bg text-loss rounded-md px-4 py-3 text-sm"
      role="alert"
    >
      {{ props.error || localError }}
    </p>

    <p class="sr-only" role="status">
      {{ busy ? 'Publicando…' : announcement }}
    </p>

    <div class="flex justify-end">
      <BaseButton type="submit" variant="primary" :disabled="busy">
        {{ busy ? 'Publicando…' : 'Publicar aclaración' }}
      </BaseButton>
    </div>
  </form>
</template>
