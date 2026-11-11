<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, useTemplateRef, watch } from 'vue'

import { getAttachmentError } from '../../../domain/reports/issue-attachments'
import type { ReportEntry, ThreadItem } from '../../../domain/reports/report-entry'
import { REPORTER_COMMENT_MAX_LENGTH } from '../../../domain/reports/reporter-comment'
import type { ReportAttachment } from '../../../services/issue-report-api'
import type { ReportCommentUpdateInput } from '../../../services/reports-api'
import NeonButton from '../../ui/NeonButton.vue'
import { encodeAttachmentFile, TEXTAREA_CLASS } from './attachment-files'
import NeonAttachmentChip from './NeonAttachmentChip.vue'
import NeonAttachmentPicker from './NeonAttachmentPicker.vue'
import NeonReportMarkdown from './NeonReportMarkdown.vue'
import { threadNote, threadPerson } from './view-model'

// «Hilo» of a report (artboard «Mis reportes · 2560 px»): what the maintainer
// answered and what the person added, oldest first. Only the person's own
// replies can be edited (in place) or deleted (after an inline confirmation).
const props = defineProps<{
  report: ReportEntry
  items: readonly ThreadItem[]
  canComment: boolean
  /** The thread is closed to new replies (and the demo, which shows a disabled form instead). */
  readOnly: boolean
  pending: boolean
  error: string
  editingId: number | null
}>()

const emit = defineEmits<{
  'update:editingId': [commentId: number | null]
  update: [commentId: number, input: ReportCommentUpdateInput]
  delete: [commentId: number]
}>()

interface DraftFile {
  id: number
  file: File
}

const editText = ref('')
/** URLs of the attachments the edited reply keeps. */
const kept = ref<string[]>([])
const newFiles = shallowRef<DraftFile[]>([])
const localError = ref('')
const attachmentNotice = ref('')
const confirmingId = ref<number | null>(null)
const cancelDeleteButton = useTemplateRef<InstanceType<typeof NeonButton>[]>('cancelDelete')
let nextFileId = 0

const people = computed(() => new Map(props.items.map((item) => [item.id, threadPerson(item)])))
const editingItem = computed(() => props.items.find((item) => item.id === props.editingId) ?? null)
/** A kept attachment shows the name GitHub gave it. */
const keptRows = computed(
  () =>
    editingItem.value?.attachments
      .filter((attachment) => kept.value.includes(attachment.url))
      .map((attachment) => ({ key: attachment.url, name: attachment.name })) ?? [],
)

function resetEditor(): void {
  editText.value = ''
  kept.value = []
  newFiles.value = []
  localError.value = ''
  attachmentNotice.value = ''
}

function startEdit(item: ThreadItem): void {
  confirmingId.value = null
  resetEditor()
  editText.value = item.text
  kept.value = item.attachments.map((attachment) => attachment.url)
  emit('update:editingId', item.id)
}

function cancelEdit(): void {
  emit('update:editingId', null)
  resetEditor()
}

// The parent closes the editor once the edit was saved.
watch(
  () => props.editingId,
  (value) => {
    if (value === null) resetEditor()
  },
)

onBeforeUnmount(resetEditor)

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
    newFiles.value = [...newFiles.value, { id: nextFileId++, file }]
  }
  localError.value = ''
}

function removeNewFile(id: number): void {
  newFiles.value = newFiles.value.filter((file) => file.id !== id)
}

async function save(): Promise<void> {
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
  let attachments: ReportAttachment[]
  try {
    attachments = await Promise.all(newFiles.value.map(({ file }) => encodeAttachmentFile(file)))
  } catch {
    localError.value = 'No se pudieron leer los adjuntos. Inténtalo de nuevo.'
    return
  }
  emit('update', id, { text: value, keepAttachments: kept.value, attachments })
}

async function askDelete(item: ThreadItem): Promise<void> {
  if (props.editingId !== null) cancelEdit()
  confirmingId.value = item.id
  await nextTick()
  // The confirmation takes the focus, on the safe answer.
  const cancel = cancelDeleteButton.value?.[0]
  ;(cancel?.$el as HTMLElement | undefined)?.focus()
}

async function cancelDelete(item: ThreadItem): Promise<void> {
  confirmingId.value = null
  await nextTick()
  document
    .querySelector<HTMLElement>(`[data-thread-item="${item.id}"] [data-thread-delete]`)
    ?.focus()
}

function confirmDelete(item: ThreadItem): void {
  confirmingId.value = null
  emit('delete', item.id)
}
</script>

<template>
  <section
    class="bg-panel border-line rounded-card motion-safe:animate-rise flex min-w-0 flex-col gap-2.5 border px-6 py-[22px] [animation-delay:140ms] @max-lg:px-3 @max-lg:py-4"
    aria-labelledby="reports-thread-title"
  >
    <div class="flex flex-col gap-1">
      <h3 id="reports-thread-title" class="text-block-title font-extrabold">Hilo</h3>
      <p class="text-muted text-[14px]">{{ threadNote(report) }}</p>
    </div>

    <p
      v-if="error && editingId === null"
      class="bg-panel2 text-loss rounded-[14px] px-3.5 py-3 text-[14px] font-bold"
      role="alert"
    >
      {{ error }}
    </p>

    <p v-if="items.length === 0" class="border-line text-muted border-t py-3.5 text-[14px]">
      Todavía no hay respuestas ni aclaraciones en este hilo.
    </p>

    <ol class="flex flex-col">
      <li
        v-for="item in items"
        :key="item.id"
        class="border-line flex min-w-0 flex-col gap-2 border-t py-4"
        :data-thread-item="item.id"
      >
        <div class="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            class="grid size-10 shrink-0 place-items-center rounded-full text-[13px] font-extrabold"
            :class="people.get(item.id)?.own ? 'bg-sel-bg text-sel-text' : 'bg-panel2 text-soft'"
            >{{ people.get(item.id)?.initial }}</span
          >
          <p class="flex min-w-0 flex-1 flex-col">
            <span class="text-[15px] font-extrabold wrap-anywhere">{{ item.author }}</span>
            <span class="text-muted text-[13px]">
              {{ people.get(item.id)?.role }} ·
              <time :datetime="item.createdAt">{{ people.get(item.id)?.when }}</time
              ><template v-if="item.editedAt"> · editado</template>
            </span>
          </p>
          <div
            v-if="item.editable && canComment && editingId !== item.id && confirmingId !== item.id"
            class="flex shrink-0 items-center"
          >
            <NeonButton :disabled="pending" @click="startEdit(item)">Editar</NeonButton>
            <NeonButton danger data-thread-delete :disabled="pending" @click="askDelete(item)"
              >Borrar</NeonButton
            >
          </div>
        </div>

        <div v-if="editingId !== item.id" class="flex min-w-0 flex-col gap-3 ps-13 @max-lg:ps-0">
          <NeonReportMarkdown :source="item.text" />
          <ul
            v-if="item.attachments.length > 0"
            class="flex flex-wrap gap-2.5"
            aria-label="Capturas"
          >
            <li v-for="attachment in item.attachments" :key="attachment.url">
              <a
                :href="attachment.url"
                target="_blank"
                rel="noopener noreferrer"
                class="text-muted outline-accent flex w-28 flex-col gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <img
                  :src="attachment.url"
                  :alt="attachment.name"
                  loading="lazy"
                  referrerpolicy="no-referrer"
                  class="bg-panel2 border-line aspect-[4/3] w-full rounded-[14px] border object-cover"
                />
                <span class="truncate text-[12px]">{{ attachment.name }}</span>
              </a>
            </li>
          </ul>
        </div>

        <div
          v-if="confirmingId === item.id"
          class="bg-panel2 ms-13 flex flex-col gap-2.5 rounded-[18px] px-4 py-3.5 @max-lg:ms-0"
          role="alertdialog"
          :aria-labelledby="`reports-delete-${item.id}`"
        >
          <p :id="`reports-delete-${item.id}`" class="text-[16px] font-extrabold">
            ¿Borrar esta aclaración?
          </p>
          <p class="text-soft text-[14px]">Se eliminará de GitHub y no se puede deshacer.</p>
          <div class="flex flex-wrap justify-end gap-2">
            <NeonButton ref="cancelDelete" @click="cancelDelete(item)">Cancelar</NeonButton>
            <NeonButton danger :disabled="pending" @click="confirmDelete(item)"
              >Borrar de GitHub</NeonButton
            >
          </div>
        </div>

        <form
          v-if="editingId === item.id"
          class="flex min-w-0 flex-col gap-3 ps-13 @max-lg:ps-0"
          novalidate
          @submit.prevent="save"
        >
          <label class="flex flex-col gap-1.5">
            <span class="text-muted text-[13px] font-bold">Editar aclaración</span>
            <textarea
              v-model="editText"
              :class="TEXTAREA_CLASS"
              class="min-h-24"
              :maxlength="REPORTER_COMMENT_MAX_LENGTH"
              :disabled="pending"
            ></textarea>
          </label>
          <ul
            v-if="keptRows.length > 0 || newFiles.length > 0"
            class="flex flex-wrap gap-2"
            aria-label="Capturas de la aclaración"
          >
            <NeonAttachmentChip
              v-for="row in keptRows"
              :key="row.key"
              :name="row.name"
              @remove="removeKept(row.key)"
            />
            <NeonAttachmentChip
              v-for="file in newFiles"
              :key="file.id"
              :name="file.file.name"
              @remove="removeNewFile(file.id)"
            />
          </ul>
          <p
            v-if="attachmentNotice"
            class="text-soft flex items-start gap-2 text-[14px] font-bold"
            role="status"
          >
            <svg
              class="text-accent-text mt-px size-[18px] shrink-0"
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
            {{ attachmentNotice }}
          </p>
          <NeonAttachmentPicker :disabled="pending" @pick="onFilesPicked" />
          <p v-if="localError" class="text-loss text-[14px] font-bold" role="alert">
            {{ localError }}
          </p>
          <div class="flex flex-wrap justify-end gap-2">
            <NeonButton :disabled="pending" @click="cancelEdit">Cancelar</NeonButton>
            <NeonButton type="submit" variant="primary" :disabled="pending">Guardar</NeonButton>
          </div>
        </form>
      </li>
    </ol>

    <p
      v-if="readOnly"
      class="bg-panel2 flex items-start gap-2.5 rounded-[18px] px-4 py-3.5 text-[15px] font-bold"
      role="note"
    >
      <svg
        class="text-muted mt-px size-5 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
      </svg>
      Este reporte está cerrado: el hilo es de solo lectura.
    </p>
    <p class="text-muted pt-1.5 text-[13px]">
      No se muestran los comentarios de la automatización ni las aclaraciones de otras personas.
    </p>
  </section>
</template>
