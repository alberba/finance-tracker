<script setup lang="ts">
import { useSecuritySettings } from '../../composables/useSecuritySettings'
import AccessMethodsSettings from './AccessMethodsSettings.vue'
import SessionSettings from './SessionSettings.vue'
import InvitationSettings from './InvitationSettings.vue'
const { available, admin } = useSecuritySettings()
</script>
<template>
  <section v-if="available" id="cfg-security" class="settings-block">
    <header><h2>Acceso y seguridad</h2></header>
    <div class="settings-block__body">
      <AccessMethodsSettings /><SessionSettings /><InvitationSettings v-if="admin" />
    </div>
  </section>
</template>
