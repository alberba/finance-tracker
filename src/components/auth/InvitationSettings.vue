<script setup lang="ts">
import { useInvitationSettings } from '../../composables/useInvitationSettings'
const { registration, maxUses, days, link, administratorId, busy, error, create, update } =
  useInvitationSettings()
</script>
<template>
  <section aria-labelledby="invitations-heading">
    <h3 id="invitations-heading">Invitaciones y registro</h3>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="registration">
      <p>Registro {{ registration.publicRegistration ? 'público' : 'solo por invitación' }}</p>
      <button
        :disabled="busy"
        @click="update({ action: 'policy', publicRegistration: !registration.publicRegistration })"
      >
        {{ registration.publicRegistration ? 'Cerrar registro público' : 'Abrir registro público' }}
      </button>
      <form @submit.prevent="create">
        <label for="invitation-uses">Plazas</label
        ><input
          id="invitation-uses"
          v-model.number="maxUses"
          type="number"
          min="1"
          max="10000"
          required
        />
        <label for="invitation-days">Duración en días</label
        ><input
          id="invitation-days"
          v-model.number="days"
          type="number"
          min="1"
          max="365"
          required
        />
        <button :disabled="busy">Crear invitación</button>
      </form>
      <p v-if="link" role="status">
        Comparte este enlace: <a :href="link">{{ link }}</a>
      </p>
      <ul>
        <li v-for="invitation in registration.invitations" :key="invitation.id">
          {{ invitation.uses }} / {{ invitation.maxUses }} plazas · Caduca
          {{ new Date(invitation.expiresAt).toLocaleDateString('es') }}
          <span v-if="invitation.revoked">Revocada</span
          ><button v-else :disabled="busy" @click="update({ action: 'revoke', id: invitation.id })">
            Revocar invitación
          </button>
        </li>
      </ul>
      <form @submit.prevent="update({ action: 'grant-admin', userId: administratorId })">
        <label for="administrator-id">Id del usuario que será administrador</label
        ><input id="administrator-id" v-model="administratorId" required />
        <button :disabled="busy">Autorizar administrador</button>
      </form>
    </template>
  </section>
</template>
