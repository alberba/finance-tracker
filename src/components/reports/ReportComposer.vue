<script setup lang="ts">
import { onBeforeUnmount, ref, shallowRef } from 'vue'

import {
  encodeBase64,
  getAttachmentError,
  ISSUE_ATTACHMENT_MAX_BYTES,
  ISSUE_ATTACHMENT_MAX_COUNT,
  ISSUE_ATTACHMENT_TYPES,
} from '../../domain/reports/issue-attachments'
import { REPORTER_COMMENT_MAX_LENGTH } from '../../domain/reports/reporter-comment'
import { isDemoMode } from '../../scripts/demo-mode'
import type { ReportAttachment } from '../../services/issue-report-api'
import BaseButton from '../ui/BaseButton.vue'
import { FIELD_CONTROL, FIELD_LABEL } from '../ui/field'

// Compositor de una aclaración nueva. Mismas reglas de adjuntos que el panel
// del reporte; en demo queda desactivado.
const props = defineProps<{ pending: boolean; error: string }>()
const emit = defineEmits<{ submit: [payload: { text: string; attachments: ReportAttachment[] }] }>()

const demo = isDemoMode()
const TEXTAREA = `${FIELD_CONTROL} field-sizing-content max-h-[12lh] min-h-[3lh] resize-none py-2.5 text-base`
const ATTACHMENT_LIMITS = `Hasta ${ISSUE_ATTACHMENT_MAX_COUNT} imágenes de ${ISSUE_ATTACHMENT_MAX_BYTES / (1024 * 1024)} MB: PNG, JPEG, WebP o GIF.`

interface DraftAttachment {
  id: number
  file: File
  previewUrl: string
}

const text = ref('')
const attachments = shallowRef<DraftAttachment[]>([])
const localError = ref('')
let nextId = 0

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
  return Promise.all(
    attachments.value.map(async ({ file }) => ({
      name: file.name,
      contentType: file.type,
      data: encodeBase64(new Uint8Array(await file.arrayBuffer())),
    })),
  )
}

async function onSubmit(): Promise<void> {
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
  emit('submit', { text: value, attachments: await encodeAttachments() })
}

defineExpose({ reset })
</script>

<template>
  <form class="grid gap-4" novalidate @submit.prevent="onSubmit">
    <div :class="FIELD_LABEL">
      <label for="report-comment-text">Nueva aclaración</label>
      <textarea
        id="report-comment-text"
        v-model="text"
        :class="TEXTAREA"
        name="text"
        :maxlength="REPORTER_COMMENT_MAX_LENGTH"
        :disabled="demo || props.pending"
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
        :disabled="demo || props.pending"
        class="text-text-muted file:bg-subtle file:text-text-main text-sm file:mr-3 file:rounded-md file:px-3 file:py-2"
        @change="onFilesPicked"
      />
      <p class="text-text-muted text-sm">{{ ATTACHMENT_LIMITS }}</p>
    </div>

    <ul v-if="attachments.length > 0" class="grid gap-2" aria-label="Capturas adjuntas">
      <li
        v-for="item in attachments"
        :key="item.id"
        class="bg-subtle flex items-center gap-3 rounded-md p-2"
      >
        <img
          :src="item.previewUrl"
          :alt="`Vista previa de ${item.file.name}`"
          class="size-14 shrink-0 rounded-md object-cover"
        />
        <span class="text-text-main min-w-0 flex-1 truncate text-sm">{{ item.file.name }}</span>
        <BaseButton variant="ghost" @click="removeAttachment(item.id)">
          Quitar {{ item.file.name }}
        </BaseButton>
      </li>
    </ul>

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

    <div class="flex justify-end">
      <BaseButton type="submit" variant="primary" :disabled="demo || props.pending">
        {{ props.pending ? 'Publicando…' : 'Publicar aclaración' }}
      </BaseButton>
    </div>
  </form>
</template>
