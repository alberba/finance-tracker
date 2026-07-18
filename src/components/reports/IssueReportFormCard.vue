<script setup lang="ts">
import { reactive, shallowRef, useTemplateRef } from 'vue'

import { useIssueReportContext } from '../../composables/useIssueReportContext'
import { getValidationError, normalizeText } from '../../domain/reports/issue-report'
import {
  submitIssueReport,
  type ReportSubmissionPayload,
  type ReportType,
} from '../../services/issue-report-api'
import { useUiStore } from '../../stores/ui'

interface SuccessStatus {
  issueNumber: number
  issueUrl: string
}

const uiStore = useUiStore()
const { getIssueReportContext } = useIssueReportContext()
const summaryInputRef = useTemplateRef<HTMLInputElement>('summaryInput')

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

function focusSummary(): void {
  summaryInputRef.value?.focus()
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

  const payload: ReportSubmissionPayload = {
    type: form.type === 'enhancement' ? 'enhancement' : 'bug',
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

defineExpose({ focusSummary })
</script>

<template>
  <article class="card reports-form-card">
    <header class="reports-form-head">
      <p class="reports-kicker">Reporte</p>
      <h3>Describe la mejora o el error</h3>
      <p>
        Describe el error o la mejora y lo enviaremos como issue con el contexto justo para
        revisarlo.
      </p>
    </header>

    <form id="issue-report-form" autocomplete="off" novalidate @submit.prevent="onSubmit">
      <div class="reports-form-row reports-form-row-type">
        <label class="reports-field">
          Tipo
          <select id="issue-report-type" v-model="form.type" name="type" required>
            <option value="bug">Error</option>
            <option value="enhancement">Mejora</option>
          </select>
        </label>
        <label class="reports-field">
          Resumen
          <input
            id="issue-report-summary"
            ref="summaryInput"
            v-model="form.summary"
            name="summary"
            type="text"
            minlength="5"
            maxlength="140"
            required
            placeholder="Ej. El filtro de movimientos no guarda el valor"
            autocomplete="off"
          />
        </label>
      </div>
      <label class="reports-field">
        Descripción
        <textarea
          id="issue-report-description"
          v-model="form.description"
          name="description"
          minlength="12"
          maxlength="8000"
          required
          rows="4"
          placeholder="Describe el error o mejora con el mayor detalle posible."
        ></textarea>
      </label>
      <div class="reports-form-row reports-form-row-pair">
        <label class="reports-field">
          Resultado esperado (opcional)
          <textarea
            id="issue-report-expected"
            v-model="form.expectedResult"
            name="expectedResult"
            maxlength="4000"
            rows="3"
          ></textarea>
        </label>
        <label class="reports-field">
          Resultado actual (opcional)
          <textarea
            id="issue-report-actual"
            v-model="form.actualResult"
            name="actualResult"
            maxlength="4000"
            rows="3"
          ></textarea>
        </label>
      </div>
      <div class="reports-form-actions">
        <button id="issue-report-submit" class="primary-btn" type="submit" :disabled="submitting">
          Crear reporte
        </button>
      </div>
    </form>
    <p id="issue-report-status" role="status" aria-live="polite">
      <template v-if="successStatus"
        >Reporte creado:
        <a :href="successStatus.issueUrl" target="_blank" rel="noreferrer"
          >#{{ successStatus.issueNumber }}</a
        >
      </template>
      <template v-else>{{ statusMessage }}</template>
    </p>
  </article>
</template>
