<script setup lang="ts">
import BaseButton from '../ui/BaseButton.vue'
import { onMounted } from 'vue'
import { markAuthenticationReady } from '../../lib/client/authentication'
import { useAuthenticationForm, type AccessMode } from '../../composables/useAuthenticationForm'
const props = defineProps<{
  invitationError?: string
  googleEnabled: boolean
  githubEnabled: boolean
  verifyEmail?: string
  initialError?: string
}>()
const {
  mode,
  email,
  password,
  otp,
  sent,
  busy,
  message,
  error,
  needsCode,
  needsPassword,
  changeMode,
  sendCode,
  submit,
  social,
  passkey,
} = useAuthenticationForm({ verifyEmail: props.verifyEmail, initialError: props.initialError })
onMounted(markAuthenticationReady)
const methods: { mode: AccessMode; label: string }[] = [
  { mode: 'code', label: 'Código por correo' },
  { mode: 'password', label: 'Contraseña' },
  { mode: 'register', label: 'Crear cuenta' },
]
</script>
<template>
  <div class="grid gap-6">
    <p v-if="invitationError" role="alert">{{ invitationError }}</p>
    <div class="flex flex-wrap gap-2" role="group" aria-label="Método de acceso">
      <BaseButton
        v-for="method in methods"
        :key="method.mode"
        type="button"
        :aria-pressed="mode === method.mode"
        :variant="mode === method.mode ? 'primary' : 'secondary'"
        :disabled="busy"
        @click="changeMode(method.mode)"
      >
        {{ method.label }}
      </BaseButton>
    </div>
    <form class="grid gap-3" aria-label="Acceso a Finanzas" @submit.prevent="submit">
      <label for="access-email">Correo electrónico</label>
      <input
        id="access-email"
        v-model="email"
        class="border-line bg-panel focus:border-primary min-h-11 w-full rounded-md border px-3"
        type="email"
        autocomplete="email"
        required
      />
      <template v-if="needsCode">
        <BaseButton type="button" :disabled="busy || !email" @click="sendCode">
          {{ sent ? 'Enviar otro código' : 'Enviar código' }}
        </BaseButton>
        <label for="access-code">Código de seis cifras</label>
        <input
          id="access-code"
          v-model="otp"
          class="border-line bg-panel focus:border-primary min-h-11 w-full rounded-md border px-3"
          inputmode="numeric"
          autocomplete="one-time-code"
          pattern="[0-9]{6}"
          maxlength="6"
          required
        />
      </template>
      <template v-if="needsPassword">
        <label for="access-password">{{
          mode === 'recover' ? 'Nueva contraseña' : 'Contraseña'
        }}</label>
        <input
          id="access-password"
          v-model="password"
          class="border-line bg-panel focus:border-primary min-h-11 w-full rounded-md border px-3"
          type="password"
          :autocomplete="mode === 'password' ? 'current-password' : 'new-password'"
          :minlength="mode === 'password' ? 8 : 12"
          required
        />
      </template>
      <p v-if="mode === 'recover'">
        La recuperación cerrará las demás sesiones. Elige una nueva contraseña para recuperar
        también el acceso si has perdido tus passkeys.
      </p>
      <BaseButton variant="primary" :disabled="busy" type="submit">
        {{
          busy
            ? 'Un momento…'
            : mode === 'register'
              ? 'Crear cuenta'
              : mode === 'recover'
                ? 'Recuperar acceso'
                : 'Entrar en Finanzas'
        }}
      </BaseButton>
    </form>
    <p v-if="message" role="status">{{ message }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <div class="flex flex-wrap gap-2">
      <BaseButton v-if="googleEnabled" :disabled="busy" @click="social('google')">
        Continuar con Google
      </BaseButton>
      <BaseButton v-if="githubEnabled" :disabled="busy" @click="social('github')">
        Continuar con GitHub
      </BaseButton>
      <BaseButton :disabled="busy" @click="passkey">Entrar con passkey</BaseButton>
    </div>
    <BaseButton type="button" :disabled="busy" @click="changeMode('recover')"
      >Recuperar acceso</BaseButton
    >
    <BaseButton type="button" :disabled="busy" @click="changeMode('verify')">
      Verificar mi correo
    </BaseButton>
  </div>
</template>
