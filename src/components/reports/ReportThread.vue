<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'

import {
  encodeBase64,
  getAttachmentError,
  ISSUE_ATTACHMENT_MAX_COUNT,
  ISSUE_ATTACHMENT_TYPES,
} from '../../domain/reports/issue-attachments'
import { REPORTER_COMMENT_MAX_LENGTH } from '../../domain/reports/reporter-comment'
import type { ThreadItem } from '../../domain/reports/report-entry'
import { formatStamp } from '../../lib/format'
import type { ReportAttachment } from '../../services/issue-report-api'
import type { ReportCommentUpdateInput } from '../../services/reports-api'
import BaseButton from '../ui/BaseButton.vue'
import ConfirmDialog from '../ui/ConfirmDialog.vue'
import IconButton from '../ui/IconButton.vue'
import { FIELD_LABEL } from '../ui/field'
import AttachmentList from './AttachmentList.vue'
import ReportMarkdown from './ReportMarkdown.vue'
import { COMMENT_TEXTAREA } from './report-form'

// Correspondencia del reporte: cada aclaración es una carta con remitente y
// filete lateral, no una burbuja de chat. Solo las propias se pueden editar.
const props = defineProps<{
  items: ThreadItem[]
  canComment: boolean
  pending: boolean
  error: string
  editingId: number | null
}>()

const emit = defineEmits<{
  'update:editingId': [commentId: number | null]
  update: [commentId: number, input: ReportCommentUpdateInput]
  delete: [commentId: number]
}>()

const TEXTAREA = COMMENT_TEXTAREA

interface DraftFile {
  id: number
  file: File
  previewUrl: string
}

const editText = ref('')
const kept = ref<string[]>([])
const newFiles = shallowRef<DraftFile[]>([])
const localError = ref('')
const attachmentNotice = ref('')
const deleteTarget = ref<ThreadItem | null>(null)
const confirmOpen = ref(false)
let nextFileId = 0

const keptRows = computed(() =>
  kept.value.map((url) => ({ id: url, name: url, previewUrl: url })),
)
const newRows = computed(() =>
  newFiles.value.map((file) => ({
    id: file.id,
    name: file.file.name,
    previewUrl: file.previewUrl,
  })),
)

function revoke(files: DraftFile[]): void {
  for (const file of files) URL.revokeObjectURL(file.previewUrl)
}

function clearEditor(): void {
  emit('update:editingId', null)
  editText.value = ''
  kept.value = []
  revoke(newFiles.value)
  newFiles.value = []
  localError.value = ''
  attachmentNotice.value = ''
}

onBeforeUnmount(() => revoke(newFiles.value))

function startEdit(item: ThreadItem): void {
  editText.value = item.text
  kept.value = item.attachments.map((attachment) => attachment.url)
  localError.value = ''
  attachmentNotice.value = ''
  emit('update:editingId', item.id)
}

// El padre cierra el editor cuando la edición se guardó.
watch(
  () => props.editingId,
  (value) => {
    if (value === null) {
      editText.value = ''
      kept.value = []
      revoke(newFiles.value)
      newFiles.value = []
    }
  },
)

function removeKept(url: string): void {
  kept.value = kept.value.filter((current) => current !== url)
  attachmentNotice.value = 'Quitar un adjunto no lo borra de GitHub.'
}

function onFilesPicked(event: Event): void {
  const input = event.target as HTMLInputElement
  const picked = Array.from(input.files ?? [])
  input.value = ''
  for (const file of picked) {
    const error = getAttachmentError(
      { name: file.name, size: file.size, type: file.type },
      kept.value.length + newFiles.value.length,
    )
    if (error) {
      localError.value = error
      return
    }
    newFiles.value = [
      ...newFiles.value,
      { id: nextFileId++, file, previewUrl: URL.createObjectURL(file) },
    ]
  }
  localError.value = ''
}

function removeNewFile(id: number): void {
  revoke(newFiles.value.filter((file) => file.id === id))
  newFiles.value = newFiles.value.filter((file) => file.id !== id)
}

async function encodeNewFiles(): Promise<ReportAttachment[]> {
  return Promise.all(
    newFiles.value.map(async ({ file }) => ({
      name: file.name,
      contentType: file.type,
      data: encodeBase64(new Uint8Array(await file.arrayBuffer())),
    })),
  )
}

function save(): void {
  const id = props.editingId
  if (id === null) return
  const value = editText.value.trim()
  if (!value) {
    localError.value = 'Escribe una aclaración.'
    return
  }
  if (value.length > REPORTER_COMMENT_MAX_LENGTH) {
    localError.value = `La aclaración supera el límite de ${REPORTER_COMMENT_MAX_LENGTH} caracteres.`
    return
  }
  void encodeNewFiles().then((attachments) => {
    emit('update', id, {
      text: value,
      keepAttachments: kept.value,
      attachments,
    })
  })
}

function askDelete(item: ThreadItem): void {
  deleteTarget.value = item
  confirmOpen.value = true
}

function confirmDelete(): void {
  const target = deleteTarget.value
  if (!target) return
  emit('delete', target.id)
  deleteTarget.value = null
}
</script>

<template>
  <div class="grid min-w-0 gap-4">
    <p
      v-if="props.error && props.editingId === null"
      class="bg-subtle text-loss rounded-md px-3 py-2 text-sm"
      role="alert"
    >
      {{ props.error }}
    </p>

    <article
      v-for="item in props.items"
      :key="item.id"
      class="border-line-strong pis-4 border-s-2"
      :class="item.kind === 'reporter' ? 'border-primary' : 'border-line-strong'"
      :data-thread-item="item.id"
    >
      <header class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p class="text-text-main font-mono text-xs font-semibold tracking-wide">
          {{ item.author }}
        </p>
        <p class="text-text-muted font-mono text-xs tabular-nums">
          {{ formatStamp(item.createdAt) }}
          <span v-if="item.editedAt" class="text-text-muted"> · editado</span>
        </p>
        <div
          v-if="item.editable && props.canComment && props.editingId !== item.id"
          class="ms-auto flex items-center gap-1"
        >
          <BaseButton variant="ghost" @click="startEdit(item)">Editar</BaseButton>
          <BaseButton variant="ghost" @click="askDelete(item)">Borrar</BaseButton>
        </div>
      </header>

      <template v-if="props.editingId === item.id">
        <div class="mbs-3 grid gap-3">
          <div :class="FIELD_LABEL">
            <label :for="`report-comment-edit-${item.id}`">Editar aclaración</label>
            <textarea
              :id="`report-comment-edit-${item.id}`"
              v-model="editText"
              :class="TEXTAREA"
              :maxlength="REPORTER_COMMENT_MAX_LENGTH"
            ></textarea>
          </div>

          <AttachmentList :items="keptRows" label="Adjuntos de la aclaración">
            <template #action="{ item: attachment }">
              <IconButton
                label="Quitar adjunto"
                icon="close"
                @click="removeKept(String(attachment.id))"
              />
            </template>
          </AttachmentList>
          <AttachmentList :items="newRows" label="Adjuntos nuevos">
            <template #action="{ item: attachment }">
              <IconButton
                label="Quitar adjunto nuevo"
                icon="close"
                @click="removeNewFile(Number(attachment.id))"
              />
            </template>
          </AttachmentList>

          <p v-if="attachmentNotice" class="text-text-muted text-sm" role="status">
            {{ attachmentNotice }}
          </p>

          <div :class="FIELD_LABEL">
            <label :for="`report-comment-edit-files-${item.id}`">Añadir capturas</label>
            <input
              :id="`report-comment-edit-files-${item.id}`"
              type="file"
              :accept="ISSUE_ATTACHMENT_TYPES.join(',')"
              multiple
              class="text-text-muted file:bg-subtle file:text-text-main text-sm file:mr-3 file:rounded-md file:px-3 file:py-2"
              @change="onFilesPicked"
            />
            <p class="text-text-muted text-sm">Hasta {{ ISSUE_ATTACHMENT_MAX_COUNT }} imágenes.</p>
          </div>

          <p v-if="localError" class="text-loss text-sm" role="alert">{{ localError }}</p>

          <div class="flex flex-wrap justify-end gap-2">
            <BaseButton variant="ghost" :disabled="props.pending" @click="clearEditor"
              >Cancelar</BaseButton
            >
            <BaseButton variant="primary" :disabled="props.pending" @click="save"
              >Guardar</BaseButton
            >
          </div>
        </div>
      </template>

      <div v-else class="mbs-2">
        <ReportMarkdown :source="item.text" />
        <ul v-if="item.attachments.length > 0" class="mbs-3 flex flex-wrap gap-2">
          <li v-for="attachment in item.attachments" :key="attachment.url">
            <a
              :href="attachment.url"
              target="_blank"
              rel="noopener noreferrer"
              class="focus-visible:outline-primary block rounded-md focus-visible:outline-2"
            >
              <img
                :src="attachment.url"
                :alt="attachment.name"
                loading="lazy"
                referrerpolicy="no-referrer"
                class="bg-subtle border-line size-24 rounded-md border object-cover"
              />
            </a>
          </li>
        </ul>
      </div>
    </article>

    <p v-if="props.items.length === 0" class="text-text-muted text-sm">
      Todavía no hay respuestas ni aclaraciones en este hilo.
    </p>

    <ConfirmDialog
      v-model:open="confirmOpen"
      title="¿Borrar esta aclaración?"
      title-id="delete-report-comment-title"
      confirm-label="Borrar"
      @confirm="confirmDelete"
    >
      Se eliminará de GitHub y no se puede deshacer.
    </ConfirmDialog>
  </div>
</template>
