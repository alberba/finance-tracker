<script setup lang="ts">
import { onBeforeUnmount, reactive, shallowRef } from 'vue'

import { useIssueReportContext } from '../../composables/useIssueReportContext'
import {
  encodeBase64,
  getAttachmentError,
  ISSUE_ATTACHMENT_MAX_BYTES,
  ISSUE_ATTACHMENT_MAX_COUNT,
  ISSUE_ATTACHMENT_TYPES,
} from '../../domain/reports/issue-attachments'
import { getValidationError, normalizeText } from '../../domain/reports/issue-report'
import {
  submitIssueReport,
  type ReportAttachment,
  type ReportPayload,
  type ReportType,
} from '../../services/issue-report-api'
import { useUiStore } from '../../stores/ui'
import BaseButton from '../ui/BaseButton.vue'
import BaseInput from '../ui/BaseInput.vue'
import { FIELD_CONTROL, FIELD_LABEL } from '../ui/field'
import PanelSectionTitle from '../ui/PanelSectionTitle.vue'
import SegmentedControl, { type SegmentedOption } from '../ui/SegmentedControl.vue'
import SidePanel from '../ui/SidePanel.vue'

// The report form in a side panel: an error or an improvement, sent as a
// GitHub issue with the app context. Open from the floating launcher or the
// mobile «Más» sheet.
interface SuccessStatus {
  issueNumber: number
  issueUrl: string
  duplicate?: boolean
}

const open = defineModel<boolean>('open', { required: true })

const TYPE_OPTIONS: SegmentedOption<ReportType>[] = [
  { value: 'bug', label: 'Error' },
  { value: 'feature', label: 'Mejora' },
]

const TEXTAREA = `${FIELD_CONTROL} resize-y py-2.5 text-base`
const ATTACHMENT_ACCEPT = ISSUE_ATTACHMENT_TYPES.join(',')
const ATTACHMENT_LIMITS = `Hasta ${ISSUE_ATTACHMENT_MAX_COUNT} imágenes de ${ISSUE_ATTACHMENT_MAX_BYTES / (1024 * 1024)} MB: PNG, JPEG, WebP o GIF.`

const uiStore = useUiStore()
const { getIssueReportContext } = useIssueReportContext()

const form = reactive({
  type: 'bug' as ReportType,
  summary: '',
  description: '',
})

interface DraftAttachment {
  id: number
  file: File
  previewUrl: string
}

const attachments = shallowRef<DraftAttachment[]>([])
let nextAttachmentId = 0

const statusMessage = shallowRef('')
const successStatus = shallowRef<SuccessStatus | null>(null)
const submitting = shallowRef(false)

function revokePreviews(items: DraftAttachment[]): void {
  for (const item of items) URL.revokeObjectURL(item.previewUrl)
}

function clearAttachments(): void {
  revokePreviews(attachments.value)
  attachments.value = []
}

onBeforeUnmount(clearAttachments)

function onAttachmentsPicked(event: Event): void {
  const input = event.target as HTMLInputElement
  const picked = Array.from(input.files ?? [])
  // Vaciar el input permite volver a elegir el mismo fichero tras quitarlo.
  input.value = ''

  for (const file of picked) {
    const error = getAttachmentError(
      { name: file.name, size: file.size, type: file.type },
      attachments.value.length,
    )
    if (error) {
      successStatus.value = null
      statusMessage.value = error
      return
    }
    attachments.value = [
      ...attachments.value,
      { id: nextAttachmentId++, file, previewUrl: URL.createObjectURL(file) },
    ]
  }
  statusMessage.value = ''
}

function removeAttachment(id: number): void {
  const removed = attachments.value.filter((item) => item.id === id)
  revokePreviews(removed)
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

function resetForm(): void {
  form.type = 'bug'
  form.summary = ''
  form.description = ''
  clearAttachments()
}

async function onSubmit(): Promise<void> {
  const summary = normalizeText(form.summary)
  const description = normalizeText(form.description)

  const validationError = getValidationError(summary)
  if (validationError) {
    successStatus.value = null
    statusMessage.value = validationError
    return
  }

  const payload: ReportPayload = {
    // `enhancement` remains accepted by the API for old clients, but all new
    // form submissions use the shorter GitHub-facing `feature` value.
    type: form.type === 'bug' ? 'bug' : 'feature',
    summary,
    // Sin descripción no se envía el campo: el servidor la deja vacía.
    description: description || undefined,
    section: uiStore.ui.activeSection,
    context: getIssueReportContext(),
  }

  submitting.value = true
  successStatus.value = null
  statusMessage.value = 'Creando reporte...'

  try {
    if (attachments.value.length > 0) {
      payload.attachments = await encodeAttachments()
    }
    const result = await submitIssueReport(payload)
    if (!result.ok) {
      statusMessage.value = `No se pudo crear la issue: ${result.error}`
      return
    }

    statusMessage.value = ''
    successStatus.value = {
      issueNumber: result.issueNumber,
      issueUrl: result.issueUrl,
      duplicate: result.duplicate,
    }
    resetForm()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado.'
    statusMessage.value = `No se pudo crear la issue: ${message}`
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <SidePanel
    id="global-report-dialog"
    v-model:open="open"
    kicker="Ayuda a mejorar Finance Tracker"
    title="Crear reporte"
    title-id="global-report-dialog-title"
  >
    <p class="text-text-muted leading-relaxed">
      Describe el error o la mejora y lo enviaremos como issue con el contexto justo para revisarlo.
    </p>

    <form
      id="issue-report-form"
      class="grid gap-7"
      autocomplete="off"
      novalidate
      @submit.prevent="onSubmit"
    >
      <fieldset class="grid gap-3.5">
        <PanelSectionTitle>Reporte</PanelSectionTitle>
        <SegmentedControl
          v-model="form.type"
          :options="TYPE_OPTIONS"
          label="Tipo"
          variant="soft"
          data-key="report-type"
          class="[&>button]:h-11 [&>button]:flex-1"
        />
        <!-- `autofocus`: showModal() focuses it when the panel opens. -->
        <BaseInput
          id="issue-report-summary"
          v-model="form.summary"
          label="Resumen"
          name="summary"
          type="text"
          minlength="5"
          maxlength="140"
          required
          autofocus
          placeholder="Ej. El filtro de movimientos no guarda el valor"
        />
        <div :class="FIELD_LABEL">
          <label for="issue-report-description">Descripción (opcional)</label>
          <textarea
            id="issue-report-description"
            v-model="form.description"
            :class="TEXTAREA"
            name="description"
            maxlength="8000"
            rows="4"
            placeholder="Añade detalle si hace falta. El resumen puede bastar."
          ></textarea>
        </div>
        <div :class="FIELD_LABEL">
          <label for="issue-report-attachments">Capturas (opcional)</label>
          <input
            id="issue-report-attachments"
            type="file"
            name="attachments"
            :accept="ATTACHMENT_ACCEPT"
            multiple
            class="text-text-muted file:bg-subtle file:text-text-main text-sm file:mr-3 file:rounded-md file:px-3 file:py-2"
            @change="onAttachmentsPicked"
          />
          <p class="text-text-muted text-sm">{{ ATTACHMENT_LIMITS }}</p>
        </div>
        <ul
          v-if="attachments.length > 0"
          id="issue-report-attachment-list"
          class="grid gap-2"
          aria-label="Capturas adjuntas"
        >
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
      </fieldset>

      <p id="issue-report-notice" class="text-text-muted text-sm leading-relaxed">
        Este reporte se publica en un repositorio público, junto con tu nombre, tu email y el
        identificador de tu cuenta. No escribas datos que no quieras compartir.
      </p>
    </form>

    <p
      id="issue-report-status"
      class="bg-subtle text-text-main rounded-md px-4 py-3 text-sm empty:hidden"
      role="status"
      aria-live="polite"
    >
      <template v-if="successStatus"
        >{{ successStatus.duplicate ? 'Este reporte ya existe:' : 'Reporte creado:' }}
        <a
          class="text-primary font-bold hover:underline"
          :href="successStatus.issueUrl"
          target="_blank"
          rel="noreferrer"
          >#{{ successStatus.issueNumber }}</a
        >
      </template>
      <template v-else>{{ statusMessage }}</template>
    </p>

    <template #footer>
      <BaseButton variant="ghost" @click="open = false">Cancelar</BaseButton>
      <BaseButton
        id="issue-report-submit"
        variant="primary"
        type="submit"
        form="issue-report-form"
        :disabled="submitting"
      >
        Crear reporte
      </BaseButton>
    </template>
  </SidePanel>
</template>
