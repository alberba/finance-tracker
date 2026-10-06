<script setup lang="ts">
import { useSecuritySettings } from '../../composables/useSecuritySettings'
import AccessMethodsSettings from './AccessMethodsSettings.vue'
import SessionSettings from './SessionSettings.vue'
import InvitationSettings from './InvitationSettings.vue'
const { available, admin } = useSecuritySettings()
</script>
<template>
  <section v-if="available" id="cfg-security" class="grid gap-4">
    <header><h2 class="font-display text-2xl font-bold">Acceso y seguridad</h2></header>
    <div class="grid gap-6">
      <AccessMethodsSettings /><SessionSettings /><InvitationSettings v-if="admin" />
    </div>
  </section>
</template>
