<script setup lang="ts">
import { computed } from 'vue'

import { useAccessMethodsSettings } from '../../../composables/useAccessMethodsSettings'
import { useInvitationSettings } from '../../../composables/useInvitationSettings'
import { useSecuritySettings } from '../../../composables/useSecuritySettings'
import { useSessionSettings } from '../../../composables/useSessionSettings'
import NeonButton from '../../ui/NeonButton.vue'
import NeonSettingsBlock from './NeonSettingsBlock.vue'

// Acceso y seguridad: how the user signs in, where they are signed in and, for
// the administrator, who can register. Only with Better Auth sessions.
const { available, admin } = useSecuritySettings()
const methods = useAccessMethodsSettings()
const sessions = useSessionSettings()
const invitations = useInvitationSettings()

const PROVIDERS = [
  { id: 'google', label: 'Google' },
  { id: 'github', label: 'GitHub' },
] as const

const linked = computed(() => methods.accounts.value.map((account) => account.providerId))
const hasPassword = computed(() => linked.value.includes('credential'))

const ROW =
  'border-line grid min-h-16 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-t py-2.5 pointer-fine:hover:bg-panel2'
const TITLE = 'min-w-0 truncate text-[16px] font-bold'
const META = 'text-muted min-w-0 truncate text-meta'
const SUBTITLE = 'text-block-title font-sans font-extrabold'

function lastUse(date: Date): string {
  return new Date(date).toLocaleString('es')
}

const registration = computed(() => invitations.registration.value)
const error = computed(() => methods.error.value || sessions.error.value || invitations.error.value)
</script>

<template>
  <NeonSettingsBlock
    v-if="available"
    id="seguridad"
    title="Acceso y seguridad"
    description="Cómo entras, en qué dispositivos estás y quién puede registrarse."
  >
    <p v-if="error" role="alert" class="text-loss text-note">{{ error }}</p>
    <div class="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] items-start gap-x-8 gap-y-6">
      <div class="grid min-w-0 content-start" data-settings-methods>
        <h3 :class="SUBTITLE">Métodos de acceso</h3>
        <p class="text-muted text-note mbe-1.5">
          Entras con un código a tu correo verificado o con cualquiera de estos métodos.
        </p>
        <div :class="ROW">
          <span class="grid min-w-0">
            <span :class="TITLE">Contraseña</span>
            <span :class="META">{{ hasPassword ? 'Configurada' : 'Sin contraseña' }}</span>
          </span>
          <a
            href="/login"
            class="text-text outline-accent inline-flex min-h-11 items-center px-4 text-[14px] font-extrabold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
            aria-label="Configurar o recuperar la contraseña"
          >
            {{ hasPassword ? 'Cambiar' : 'Configurar' }}
          </a>
        </div>
        <div v-for="provider in PROVIDERS" :key="provider.id" :class="ROW">
          <span class="grid min-w-0">
            <span :class="TITLE">{{ provider.label }}</span>
            <span :class="META">{{
              linked.includes(provider.id) ? 'Vinculado' : 'No vinculado'
            }}</span>
          </span>
          <NeonButton
            v-if="!linked.includes(provider.id)"
            :disabled="methods.busy.value"
            :aria-label="`Vincular ${provider.label}`"
            @click="methods.link(provider.id)"
          >
            Vincular
          </NeonButton>
        </div>
        <div v-for="key in methods.passkeys.value" :key="key.id" :class="ROW">
          <span class="grid min-w-0">
            <span :class="TITLE">{{ key.name || 'Passkey' }}</span>
            <span :class="META">Passkey</span>
          </span>
          <NeonButton
            danger
            :disabled="methods.busy.value"
            :aria-label="`Eliminar la passkey ${key.name || ''}`.trim()"
            @click="methods.removePasskey(key.id)"
          >
            Eliminar
          </NeonButton>
        </div>
        <div class="border-line border-t pbs-2.5">
          <NeonButton :disabled="methods.busy.value" @click="methods.addPasskey">
            Añadir passkey
          </NeonButton>
        </div>
      </div>

      <div class="grid min-w-0 content-start" data-settings-sessions>
        <h3 :class="SUBTITLE">Dispositivos y sesiones</h3>
        <p class="text-muted text-note mbe-1.5">
          Las sesiones caducan tras 30 días de inactividad y se renuevan mientras usas Finanzas.
        </p>
        <div v-for="session in sessions.sessions.value" :key="session.id" :class="ROW">
          <span class="grid min-w-0">
            <span :class="TITLE">
              {{ session.id === sessions.currentId.value ? 'Esta sesión' : 'Otra sesión' }}
            </span>
            <span :class="META">
              {{ session.userAgent || 'Navegador desconocido' }} · último uso
              {{ lastUse(session.updatedAt) }}
            </span>
          </span>
          <NeonButton
            v-if="session.id !== sessions.currentId.value"
            :disabled="sessions.busy.value"
            aria-label="Cerrar esta sesión"
            @click="sessions.revoke(session.token)"
          >
            Cerrar
          </NeonButton>
        </div>
        <div class="border-line border-t pbs-2.5">
          <NeonButton :disabled="sessions.busy.value" @click="sessions.revokeOthers">
            Cerrar las demás sesiones
          </NeonButton>
        </div>
      </div>
    </div>

    <div
      v-if="admin && registration"
      class="border-line grid gap-1 border-t pbs-5"
      data-settings-invitations
    >
      <h3 :class="SUBTITLE">Invitaciones y registro</h3>
      <div class="flex min-h-16 flex-wrap items-center justify-between gap-3 py-2.5">
        <span class="text-[16px]">
          Registro <b>{{ registration.publicRegistration ? 'público' : 'solo por invitación' }}</b>
        </span>
        <NeonButton
          :disabled="invitations.busy.value"
          @click="
            invitations.update({
              action: 'policy',
              publicRegistration: !registration.publicRegistration,
            })
          "
        >
          {{
            registration.publicRegistration ? 'Cerrar registro público' : 'Abrir registro público'
          }}
        </NeonButton>
      </div>
      <div class="grid grid-cols-[170px_210px_auto] items-end gap-3 px-2 pbe-3.5">
        <label class="text-muted text-meta grid gap-1.5 font-bold">
          Plazas
          <input
            v-model.number="invitations.maxUses.value"
            type="number"
            min="1"
            max="10000"
            class="border-ctrl-line bg-panel text-text rounded-field outline-accent font-display box-border min-h-[46px] w-full border px-3.5 text-[16px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
          />
        </label>
        <label class="text-muted text-meta grid gap-1.5 font-bold">
          Duración en días
          <input
            v-model.number="invitations.days.value"
            type="number"
            min="1"
            max="365"
            class="border-ctrl-line bg-panel text-text rounded-field outline-accent font-display box-border min-h-[46px] w-full border px-3.5 text-[16px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
          />
        </label>
        <NeonButton :disabled="invitations.busy.value" @click="invitations.create">
          Crear invitación
        </NeonButton>
      </div>
      <p v-if="invitations.link.value" role="status" class="text-note">
        Comparte este enlace:
        <a :href="invitations.link.value" class="text-accent-text underline">{{
          invitations.link.value
        }}</a>
      </p>
      <div v-for="invitation in registration.invitations" :key="invitation.id" :class="ROW">
        <span class="grid min-w-0">
          <span :class="TITLE">
            {{ invitation.uses }} de {{ invitation.maxUses }} plazas usadas
          </span>
          <span :class="META">
            Caduca el {{ new Date(invitation.expiresAt).toLocaleDateString('es') }}
            <template v-if="invitation.revoked"> · Revocada</template>
          </span>
        </span>
        <NeonButton
          v-if="!invitation.revoked"
          danger
          :disabled="invitations.busy.value"
          aria-label="Revocar invitación"
          @click="invitations.update({ action: 'revoke', id: invitation.id })"
        >
          Revocar
        </NeonButton>
      </div>
    </div>
  </NeonSettingsBlock>
</template>
