<script setup lang="ts">
import AppSection from '../ui/AppSection.vue'
import ReportsGuideCard from './ReportsGuideCard.vue'

const emit = defineEmits<{
  openReportDialog: []
}>()

withDefaults(
  defineProps<{
    isActive?: boolean
  }>(),
  { isActive: false },
)
</script>

<template>
  <AppSection id="reports" :is-active="isActive">
    <div class="panel-head">
      <div>
        <p class="panel-kicker">Soporte</p>
        <h2 id="reports-title">Reportes</h2>
        <p>
          Envía errores o mejoras. El reporte se convertirá en una issue de GitHub con el contexto
          necesario.
        </p>
      </div>
    </div>

    <div class="reports-layout">
      <div class="card reports-entry-card">
        <p class="reports-kicker">Un acceso siempre a mano</p>
        <h3>Cuéntanos qué mejorar</h3>
        <p>
          El formulario también está disponible desde el botón discreto que acompaña la aplicación.
          Puedes abrirlo sin perder el lugar en el que estabas trabajando.
        </p>
        <button
          class="primary-btn reports-entry-action"
          type="button"
          @click="emit('openReportDialog')"
        >
          Crear reporte
        </button>
      </div>
      <ReportsGuideCard />
    </div>
  </AppSection>
</template>
