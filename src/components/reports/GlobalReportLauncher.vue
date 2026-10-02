<script setup lang="ts">
import { nextTick, shallowRef, useTemplateRef, watch } from 'vue'

import { useReportDialogTrigger } from '../../composables/useReportDialogTrigger'
import IssueReportFormCard from './IssueReportFormCard.vue'

const isOpen = defineModel<boolean>('open', { default: false })

const dialogRef = useTemplateRef<HTMLDialogElement>('dialog')
const launcherRef = useTemplateRef<HTMLButtonElement>('launcher')
const reportFormRef = useTemplateRef<InstanceType<typeof IssueReportFormCard>>('reportForm')
const isClosing = shallowRef(false)

function focusReportForm(): void {
  void nextTick(() => reportFormRef.value?.focusSummary())
}

function openDialog(): void {
  isClosing.value = false
  const dialog = dialogRef.value
  if (!dialog?.open) {
    dialog?.showModal()
  }
  isOpen.value = true
  focusReportForm()
}

function closeDialog(): void {
  if (!dialogRef.value?.open || isClosing.value) {
    isOpen.value = false
    return
  }
  isClosing.value = true
}

function syncClosedState(): void {
  isClosing.value = false
  isOpen.value = false
  void nextTick(() => launcherRef.value?.focus())
}

function onCancel(event: Event): void {
  event.preventDefault()
  closeDialog()
}

function onDialogAnimationEnd(event: AnimationEvent): void {
  if (event.animationName !== 'report-dialog-out' || !isClosing.value) {
    return
  }
  dialogRef.value?.close()
}

watch(isOpen, (open) => {
  if (open) {
    openDialog()
  } else {
    closeDialog()
  }
})

useReportDialogTrigger(openDialog)
</script>

<template>
  <button
    v-show="!isOpen"
    id="global-report-trigger"
    ref="launcher"
    class="global-report-trigger"
    type="button"
    aria-label="Crear reporte"
    @click="openDialog"
  >
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      aria-hidden="true"
    >
      <path
        d="M5 5.75A2.75 2.75 0 0 1 7.75 3h8.5A2.75 2.75 0 0 1 19 5.75v7.5A2.75 2.75 0 0 1 16.25 16H11l-4.25 3v-3.14A2.75 2.75 0 0 1 5 13.25z"
      />
      <path d="M8.5 8.5h7M8.5 11.5h4" />
    </svg>
    <span class="global-report-trigger-label">Reportar</span>
  </button>

  <dialog
    id="global-report-dialog"
    ref="dialog"
    class="global-report-dialog"
    :class="{ 'is-closing': isClosing }"
    aria-labelledby="global-report-dialog-title"
    @animationend="onDialogAnimationEnd"
    @cancel="onCancel"
    @click.self="closeDialog"
    @close="syncClosedState"
  >
    <div class="global-report-dialog-head">
      <div>
        <p class="global-report-dialog-kicker">Ayuda a mejorar Finance Tracker</p>
        <h2 id="global-report-dialog-title">Crear reporte</h2>
      </div>
      <button
        id="global-report-dialog-close"
        class="global-report-dialog-close"
        type="button"
        aria-label="Cerrar formulario de reporte"
        @click="closeDialog"
      >
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          aria-hidden="true"
        >
          <path d="m5 5 10 10M15 5 5 15" />
        </svg>
      </button>
    </div>
    <IssueReportFormCard ref="reportForm" />
  </dialog>
</template>
