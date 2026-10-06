<script setup lang="ts">
import BaseButton from '../ui/BaseButton.vue'
import { useSessionSettings } from '../../composables/useSessionSettings'
const { sessions, currentId, busy, error, revoke, revokeOthers } = useSessionSettings()
</script>
<template>
  <section
    class="bg-panel border-line grid gap-4 rounded-lg border p-5"
    aria-labelledby="sessions-heading"
  >
    <h3 id="sessions-heading" class="font-display text-xl font-bold">Dispositivos y sesiones</h3>
    <p>Las sesiones caducan tras 30 días de inactividad y se renuevan mientras usas Finanzas.</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <ul class="list-stack">
      <li v-for="session in sessions" :key="session.id">
        <strong>{{ session.id === currentId ? 'Esta sesión' : 'Otra sesión' }}</strong>
        <p>{{ session.userAgent || 'Navegador desconocido' }}</p>
        <p>Último uso: {{ new Date(session.updatedAt).toLocaleString('es') }}</p>
        <BaseButton v-if="session.id !== currentId" :disabled="busy" @click="revoke(session.token)">
          Cerrar esta sesión
        </BaseButton>
      </li>
    </ul>
    <BaseButton :disabled="busy" @click="revokeOthers">Cerrar las demás sesiones</BaseButton>
  </section>
</template>
