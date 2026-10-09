<script setup lang="ts">
import { reactive, shallowRef } from 'vue'

import { useIssueReportContext } from '../../composables/useIssueReportContext'
import { getValidationError, normalizeText } from '../../domain/reports/issue-report'
import {
  submitIssueReport,
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
}

const open = defineModel<boolean>('open', { required: true })

const TYPE_OPTIONS: SegmentedOption<ReportType>[] = [
  { value: 'bug', label: 'Error' },
  { value: 'feature', label: 'Mejora' },
]

const TEXTAREA = `${FIELD_CONTROL} resize-y py-2.5 text-base`

const uiStore = useUiStore()
const { getIssueReportContext } = useIssueReportContext()

const form = reactive({
  type: 'bug' as ReportType,
  summary: '',
  description: '',
  expectedResult: '',
  actualResult: '',
})

const statusMessage = shallowRef('')
const successStatus = shallowRef<SuccessStatus | null>(null)
const submitting = shallowRef(false)

function resetForm(): void {
  form.type = 'bug'
  form.summary = ''
  form.description = ''
  form.expectedResult = ''
  form.actualResult = ''
}

async function onSubmit(): Promise<void> {
  const summary = normalizeText(form.summary)
  const description = normalizeText(form.description)

  const validationError = getValidationError(summary, description)
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
    description,
    section: uiStore.ui.activeSection,
    context: getIssueReportContext(),
    expectedResult: normalizeText(form.expectedResult) || undefined,
    actualResult: normalizeText(form.actualResult) || undefined,
  }

  submitting.value = true
  successStatus.value = null
  statusMessage.value = 'Creando reporte...'

  try {
    const result = await submitIssueReport(payload)
    if (!result.ok) {
      statusMessage.value = `No se pudo crear la issue: ${result.error}`
      return
    }

    statusMessage.value = ''
    successStatus.value = {
      issueNumber: result.issueNumber,
      issueUrl: result.issueUrl,
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
          <label for="issue-report-description">Descripción</label>
          <textarea
            id="issue-report-description"
            v-model="form.description"
            :class="TEXTAREA"
            name="description"
            minlength="12"
            maxlength="8000"
            required
            rows="4"
            placeholder="Describe el error o mejora con el mayor detalle posible."
          ></textarea>
        </div>
      </fieldset>

      <fieldset class="grid gap-3.5 sm:grid-cols-2">
        <PanelSectionTitle>Detalle (opcional)</PanelSectionTitle>
        <div :class="FIELD_LABEL">
          <label for="issue-report-expected">Resultado esperado</label>
          <textarea
            id="issue-report-expected"
            v-model="form.expectedResult"
            :class="TEXTAREA"
            name="expectedResult"
            maxlength="4000"
            rows="3"
          ></textarea>
        </div>
        <div :class="FIELD_LABEL">
          <label for="issue-report-actual">Resultado actual</label>
          <textarea
            id="issue-report-actual"
            v-model="form.actualResult"
            :class="TEXTAREA"
            name="actualResult"
            maxlength="4000"
            rows="3"
          ></textarea>
        </div>
      </fieldset>
    </form>

    <p
      id="issue-report-status"
      class="bg-subtle text-text-main rounded-md px-4 py-3 text-sm empty:hidden"
      role="status"
      aria-live="polite"
    >
      <template v-if="successStatus"
        >Reporte creado:
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
