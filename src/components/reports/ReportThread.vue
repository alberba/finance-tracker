<script setup lang="ts">
import { onBeforeUnmount, ref, shallowRef } from 'vue'

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
import { FIELD_CONTROL, FIELD_LABEL } from '../ui/field'
import ReportMarkdown from './ReportMarkdown.vue'

// Correspondencia del reporte: cada aclaración es una carta con remitente y
// filete lateral, no una burbuja de chat. Solo las propias se pueden editar.
const props = defineProps<{
  items: ThreadItem[]
  canComment: boolean
  pending: boolean
  error: string
  updateComment: (commentId: number, input: ReportCommentUpdateInput) => Promise<boolean>
  removeComment: (commentId: number) => Promise<boolean>
}>()

const TEXTAREA = `${FIELD_CONTROL} field-sizing-content max-h-[12lh] min-h-[3lh] resize-none py-2.5 text-base`

interface DraftFile {
  id: number
  file: File
  previewUrl: string
}

const editingId = ref<number | null>(null)
const editText = ref('')
const kept = ref<string[]>([])
const newFiles = shallowRef<DraftFile[]>([])
const localError = ref('')
const attachmentNotice = ref('')
const deleteTarget = ref<ThreadItem | null>(null)
const confirmOpen = ref(false)
let nextFileId = 0

function revoke(files: DraftFile[]): void {
  for (const file of files) URL.revokeObjectURL(file.previewUrl)
}

function clearEditor(): void {
  editingId.value = null
  editText.value = ''
  kept.value = []
  revoke(newFiles.value)
  newFiles.value = []
  localError.value = ''
  attachmentNotice.value = ''
}

onBeforeUnmount(() => revoke(newFiles.value))

function startEdit(item: ThreadItem): void {
  clearEditor()
  editingId.value = item.id
  editText.value = item.text
  kept.value = item.attachments.map((attachment) => attachment.url)
}

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

async function save(): Promise<void> {
  const id = editingId.value
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
  const saved = await props.updateComment(id, {
    text: value,
    keepAttachments: kept.value,
    attachments: await encodeNewFiles(),
  })
  if (saved) clearEditor()
}

function askDelete(item: ThreadItem): void {
  deleteTarget.value = item
  confirmOpen.value = true
}

async function confirmDelete(): Promise<void> {
  const target = deleteTarget.value
  if (!target) return
  await props.removeComment(target.id)
  deleteTarget.value = null
}
</script>

<template>
  <div class="grid min-w-0 gap-4">
    <p
      v-if="props.error && editingId === null"
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
          v-if="item.editable && props.canComment && editingId !== item.id"
          class="ms-auto flex items-center gap-1"
        >
          <BaseButton variant="ghost" @click="startEdit(item)">Editar</BaseButton>
          <BaseButton variant="ghost" @click="askDelete(item)">Borrar</BaseButton>
        </div>
      </header>

      <template v-if="editingId === item.id">
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

          <ul v-if="kept.length > 0 || newFiles.length > 0" class="grid gap-2">
            <li
              v-for="url in kept"
              :key="url"
              class="bg-subtle flex items-center gap-3 rounded-md p-2"
            >
              <img :src="url" alt="" class="bg-subtle size-14 shrink-0 rounded-md object-cover" />
              <span class="text-text-main min-w-0 flex-1 truncate text-sm">{{ url }}</span>
              <IconButton label="Quitar adjunto" icon="close" @click="removeKept(url)" />
            </li>
            <li
              v-for="file in newFiles"
              :key="file.id"
              class="bg-subtle flex items-center gap-3 rounded-md p-2"
            >
              <img
                :src="file.previewUrl"
                :alt="`Vista previa de ${file.file.name}`"
                class="size-14 shrink-0 rounded-md object-cover"
              />
              <span class="text-text-main min-w-0 flex-1 truncate text-sm">{{
                file.file.name
              }}</span>
              <IconButton
                label="Quitar adjunto nuevo"
                icon="close"
                @click="removeNewFile(file.id)"
              />
            </li>
          </ul>

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
