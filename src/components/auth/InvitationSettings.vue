<script setup lang="ts">
import BaseButton from '../ui/BaseButton.vue'
import { useInvitationSettings } from '../../composables/useInvitationSettings'
const { registration, maxUses, days, link, administratorId, busy, error, create, update } =
  useInvitationSettings()
</script>
<template>
  <section
    class="bg-panel border-line grid gap-4 rounded-lg border p-5"
    aria-labelledby="invitations-heading"
  >
    <h3 id="invitations-heading" class="font-display text-xl font-bold">Invitaciones y registro</h3>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="registration">
      <p>Registro {{ registration.publicRegistration ? 'público' : 'solo por invitación' }}</p>
      <BaseButton
        :disabled="busy"
        @click="update({ action: 'policy', publicRegistration: !registration.publicRegistration })"
      >
        {{ registration.publicRegistration ? 'Cerrar registro público' : 'Abrir registro público' }}
      </BaseButton>
      <form @submit.prevent="create">
        <label for="invitation-uses">Plazas</label
        ><input
          id="invitation-uses"
          v-model.number="maxUses"
          class="border-line bg-panel focus:border-primary min-h-11 w-full rounded-md border px-3"
          type="number"
          min="1"
          max="10000"
          required
        />
        <label for="invitation-days">Duración en días</label
        ><input
          id="invitation-days"
          v-model.number="days"
          class="border-line bg-panel focus:border-primary min-h-11 w-full rounded-md border px-3"
          type="number"
          min="1"
          max="365"
          required
        />
        <BaseButton type="submit" :disabled="busy">Crear invitación</BaseButton>
      </form>
      <p v-if="link" role="status">
        Comparte este enlace: <a :href="link">{{ link }}</a>
      </p>
      <ul>
        <li v-for="invitation in registration.invitations" :key="invitation.id">
          {{ invitation.uses }} / {{ invitation.maxUses }} plazas · Caduca
          {{ new Date(invitation.expiresAt).toLocaleDateString('es') }}
          <span v-if="invitation.revoked">Revocada</span
          ><BaseButton
            v-else
            :disabled="busy"
            @click="update({ action: 'revoke', id: invitation.id })"
          >
            Revocar invitación
          </BaseButton>
        </li>
      </ul>
      <form @submit.prevent="update({ action: 'grant-admin', userId: administratorId })">
        <label for="administrator-id">Id del usuario que será administrador</label
        ><input
          id="administrator-id"
          v-model="administratorId"
          class="border-line bg-panel focus:border-primary min-h-11 w-full rounded-md border px-3"
          required
        />
        <BaseButton type="submit" :disabled="busy">Autorizar administrador</BaseButton>
      </form>
    </template>
  </section>
</template>
