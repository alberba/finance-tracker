<script setup lang="ts">
import { reactive, shallowRef, watch } from 'vue'

import { useIssueReportContext } from '../../composables/useIssueReportContext'
import { useSectionNavigation } from '../../composables/useSectionNavigation'
import { getAttachmentError } from '../../domain/reports/issue-attachments'
import { getValidationError, normalizeText } from '../../domain/reports/issue-report'
import { runClientHttp } from '../../lib/client/runtime'
import {
  submitIssueReport,
  type ReportPayload,
  type ReportType,
} from '../../services/issue-report-api'
import { useUiStore } from '../../stores/ui'
import {
  ATTACHMENT_LIMITS,
  encodeAttachmentFile,
  TEXTAREA_CLASS,
} from '../sections/reports/attachment-files'
import NeonAttachmentChip from '../sections/reports/NeonAttachmentChip.vue'
import NeonAttachmentPicker from '../sections/reports/NeonAttachmentPicker.vue'
import NeonButton from '../ui/NeonButton.vue'
import NeonDetailPanel from '../ui/NeonDetailPanel.vue'

// «Crear reporte»: an error or an improvement, sent as a GitHub issue with the
// app context. It opens from the frame's «Reportar» button or the mobile «Más»
// sheet, in the detail panel every section uses.
interface SuccessStatus {
  issueNumber: number
  issueUrl: string
  tracked: boolean
}

interface DraftFile {
  id: number
  file: File
}

const open = defineModel<boolean>('open', { required: true })

const TYPE_OPTIONS: ReadonlyArray<{ value: ReportType; label: string }> = [
  { value: 'bug', label: 'Error' },
  { value: 'feature', label: 'Mejora' },
]
const FORM_ID = 'issue-report-form'
const fieldClass =
  'min-w-0 bg-panel border-ctrl-line text-text outline-accent rounded-field placeholder:text-faint min-h-[46px] w-full border px-3.5 text-[16px] font-bold focus-visible:outline-2 focus-visible:outline-offset-2'
const labelClass = 'text-muted grid min-w-0 gap-1.5 text-[13px] font-bold'

const uiStore = useUiStore()
const { getIssueReportContext } = useIssueReportContext()
const { navigateToReports } = useSectionNavigation()

const form = reactive({ type: 'bug' as ReportType, summary: '', description: '' })
const files = shallowRef<DraftFile[]>([])
const statusMessage = shallowRef('')
const successStatus = shallowRef<SuccessStatus | null>(null)
const submitting = shallowRef(false)
let nextId = 0

// Set while the panel closes on its way to «Mis reportes»: the page is inert
// until the dialog is gone, so the navigation waits for `closed` (and the
// detail then takes the focus the panel hands back to its opener).
let pendingReports: { issueNumber?: number } | null = null
watch(open, (value) => {
  if (value) pendingReports = null
})

/** Closes the panel, then navigates: the detail mounts on the page. */
function openReports(issueNumber?: number): void {
  pendingReports = { issueNumber }
  open.value = false
}

function onClosed(): void {
  if (!pendingReports) return
  const { issueNumber } = pendingReports
  pendingReports = null
  navigateToReports(issueNumber)
}

function onFilesPicked(event: Event): void {
  const input = event.target as HTMLInputElement
  const picked = Array.from(input.files ?? [])
  // Emptying the input lets the same file be picked again after removing it.
  input.value = ''
  for (const file of picked) {
    const error = getAttachmentError(
      { name: file.name, size: file.size, type: file.type },
      files.value.length,
    )
    if (error) {
      successStatus.value = null
      statusMessage.value = error
      return
    }
    files.value = [...files.value, { id: nextId++, file }]
  }
  statusMessage.value = ''
}

function removeFile(id: number): void {
  files.value = files.value.filter((item) => item.id !== id)
}

function resetForm(): void {
  form.type = 'bug'
  form.summary = ''
  form.description = ''
  files.value = []
}

async function onSubmit(): Promise<void> {
  if (submitting.value) return
  const summary = normalizeText(form.summary)
  const description = normalizeText(form.description)

  const validationError = getValidationError(summary)
  if (validationError) {
    successStatus.value = null
    statusMessage.value = validationError
    return
  }

  const payload: ReportPayload = {
    type: form.type,
    summary,
    // Without a description the field is not sent: the server leaves it empty.
    description: description || undefined,
    section: uiStore.ui.activeSection,
    context: getIssueReportContext(),
  }

  submitting.value = true
  successStatus.value = null
  statusMessage.value = 'Creando reporte…'

  try {
    if (files.value.length > 0) {
      payload.attachments = await Promise.all(
        files.value.map(({ file }) => encodeAttachmentFile(file)),
      )
    }
    const result = await runClientHttp(submitIssueReport(payload))
    if (!result.ok) {
      statusMessage.value = `No se pudo crear la issue: ${result.error}`
      return
    }
    statusMessage.value = ''
    successStatus.value = {
      issueNumber: result.issueNumber,
      issueUrl: result.issueUrl,
      tracked: result.tracked,
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
  <NeonDetailPanel
    v-model:open="open"
    kicker="Ayuda a mejorar la app"
    title="Crear reporte"
    @closed="onClosed"
  >
    <p class="text-soft text-[15px] leading-relaxed">
      Describe el error o la mejora y lo enviaremos como issue con el contexto justo para revisarlo.
    </p>

    <p class="text-muted text-note">
      <a
        class="text-accent-text outline-accent font-extrabold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
        href="/reportes"
        data-report-tracking-link
        @click.prevent="openReports()"
        >Mis reportes</a
      >
      · estado y aclaraciones de lo que ya has enviado.
    </p>

    <form
      :id="FORM_ID"
      class="grid grid-cols-[minmax(0,1fr)] gap-[22px]"
      autocomplete="off"
      novalidate
      @submit.prevent="onSubmit"
    >
      <div class="grid gap-2">
        <span id="issue-report-type" class="text-muted text-[13px] font-bold">Tipo</span>
        <div class="flex flex-wrap gap-2" role="group" aria-labelledby="issue-report-type">
          <button
            v-for="option in TYPE_OPTIONS"
            :key="option.value"
            type="button"
            :aria-pressed="form.type === option.value"
            class="rounded-pill outline-accent min-h-11 border px-4 text-[13px] font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2"
            :class="
              form.type === option.value
                ? 'bg-sel-bg text-sel-text border-sel-border'
                : 'border-ctrl-line text-soft'
            "
            @click="form.type = option.value"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <label :class="labelClass">
        Resumen
        <!-- `autofocus`: showModal() focuses it when the panel opens. -->
        <input
          id="issue-report-summary"
          v-model="form.summary"
          name="summary"
          type="text"
          minlength="5"
          maxlength="140"
          required
          autofocus
          placeholder="Ej. El filtro de movimientos no guarda el valor"
          :class="fieldClass"
        />
      </label>

      <label :class="labelClass">
        Descripción (opcional)
        <textarea
          id="issue-report-description"
          v-model="form.description"
          name="description"
          maxlength="8000"
          :class="TEXTAREA_CLASS"
          class="min-h-30 font-normal"
          placeholder="Añade detalle si hace falta. El resumen puede bastar."
        ></textarea>
      </label>

      <div class="grid gap-2.5">
        <span class="text-muted text-[13px] font-bold">Capturas (opcional)</span>
        <ul
          v-if="files.length > 0"
          id="issue-report-attachment-list"
          class="flex flex-wrap gap-2"
          aria-label="Capturas adjuntas"
        >
          <NeonAttachmentChip
            v-for="item in files"
            :key="item.id"
            :name="item.file.name"
            @remove="removeFile(item.id)"
          />
        </ul>
        <div class="flex flex-wrap items-center gap-x-3.5 gap-y-2">
          <NeonAttachmentPicker id="issue-report-attachments" @pick="onFilesPicked" />
          <p class="text-muted text-meta min-w-55 flex-1">{{ ATTACHMENT_LIMITS }}</p>
        </div>
      </div>

      <p id="issue-report-notice" class="text-muted text-meta leading-relaxed">
        Este reporte se publica en un repositorio público, junto con tu nombre, tu email y el
        identificador de tu cuenta. No escribas datos que no quieras compartir.
      </p>
    </form>

    <p
      id="issue-report-status"
      class="bg-panel2 text-soft rounded-[18px] px-4 py-3.5 text-[15px] font-bold empty:hidden"
      role="status"
      aria-live="polite"
    >
      <template v-if="successStatus">
        <template v-if="successStatus.tracked">
          Reporte creado:
          <a
            class="text-accent-text underline underline-offset-4"
            :href="successStatus.issueUrl"
            target="_blank"
            rel="noreferrer"
            >#{{ successStatus.issueNumber }}</a
          >
          ·
          <a
            class="text-accent-text underline underline-offset-4"
            href="/reportes"
            data-report-tracking-link
            @click.prevent="openReports(successStatus.issueNumber)"
            >Ver en Mis reportes</a
          >
        </template>
        <template v-else>
          No pudimos añadirlo a Mis reportes todavía; aparecerá en cuanto se recupere.
        </template>
      </template>
      <template v-else>{{ statusMessage }}</template>
    </p>

    <template #footer>
      <NeonButton @click="open = false">Cancelar</NeonButton>
      <NeonButton
        id="issue-report-submit"
        variant="primary"
        type="submit"
        :form="FORM_ID"
        :disabled="submitting"
      >
        Crear reporte
      </NeonButton>
    </template>
  </NeonDetailPanel>
</template>
