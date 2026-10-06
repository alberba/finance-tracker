<script setup lang="ts">
import { useSessionSettings } from '../../composables/useSessionSettings'
const { sessions, currentId, busy, error, revoke, revokeOthers } = useSessionSettings()
</script>
<template>
  <section aria-labelledby="sessions-heading">
    <h3 id="sessions-heading">Dispositivos y sesiones</h3>
    <p>Las sesiones caducan tras 30 días de inactividad y se renuevan mientras usas Finanzas.</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <ul class="list-stack">
      <li v-for="session in sessions" :key="session.id">
        <strong>{{ session.id === currentId ? 'Esta sesión' : 'Otra sesión' }}</strong>
        <p>{{ session.userAgent || 'Navegador desconocido' }}</p>
        <p>Último uso: {{ new Date(session.updatedAt).toLocaleString('es') }}</p>
        <button v-if="session.id !== currentId" :disabled="busy" @click="revoke(session.token)">
          Cerrar esta sesión
        </button>
      </li>
    </ul>
    <button :disabled="busy" @click="revokeOthers">Cerrar las demás sesiones</button>
  </section>
</template>
