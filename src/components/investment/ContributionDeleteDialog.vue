<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{
  confirm: [date: string]
}>()

const dialogRef = ref<HTMLDialogElement | null>(null)
const pendingDate = ref('')

function open(date: string): void {
  pendingDate.value = date
  dialogRef.value?.showModal?.()
}

function close(): void {
  pendingDate.value = ''
  if (dialogRef.value?.open) {
    dialogRef.value.close()
  }
}

function onConfirm(): void {
  const date = pendingDate.value
  close()
  if (date) {
    emit('confirm', date)
  }
}

defineExpose({ open })
</script>

<template>
  <dialog
    id="contribution-delete-dialog"
    ref="dialogRef"
    class="contribution-workflow-dialog contribution-delete-dialog"
  >
    <form id="contribution-delete-form" class="contribution-workflow-form" autocomplete="off" @submit.prevent="onConfirm">
      <div class="contribution-workflow-head">
        <h3 id="contribution-delete-title">Eliminar aporte manual</h3>
        <button
          id="contribution-delete-close"
          type="button"
          class="tx-close-btn"
          aria-label="Cerrar confirmación"
          @click="close"
        >
          ✕
        </button>
      </div>
      <p id="contribution-delete-message" class="contribution-workflow-intro">
        ¿Seguro que quieres eliminar el aporte manual del {{ pendingDate }}?
      </p>
      <div class="contribution-workflow-actions">
        <button id="contribution-delete-cancel" type="button" class="tx-btn-secondary" @click="close">
          Cancelar
        </button>
        <button id="contribution-delete-confirm" type="submit" class="tx-btn-primary">
          Eliminar aporte
        </button>
      </div>
    </form>
  </dialog>
</template>
