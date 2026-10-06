<script setup lang="ts">
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
  <div class="access-form">
    <p v-if="invitationError" role="alert">{{ invitationError }}</p>
    <div class="access-methods" role="group" aria-label="Método de acceso">
      <button
        v-for="method in methods"
        :key="method.mode"
        type="button"
        :aria-pressed="mode === method.mode"
        :disabled="busy"
        @click="changeMode(method.mode)"
      >
        {{ method.label }}
      </button>
    </div>
    <form aria-label="Acceso a Finanzas" @submit.prevent="submit">
      <label for="access-email">Correo electrónico</label>
      <input id="access-email" v-model="email" type="email" autocomplete="email" required />
      <template v-if="needsCode">
        <button type="button" :disabled="busy || !email" @click="sendCode">
          {{ sent ? 'Enviar otro código' : 'Enviar código' }}
        </button>
        <label for="access-code">Código de seis cifras</label>
        <input
          id="access-code"
          v-model="otp"
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
      <button class="btn btn-primary" :disabled="busy" type="submit">
        {{
          busy
            ? 'Un momento…'
            : mode === 'register'
              ? 'Crear cuenta'
              : mode === 'recover'
                ? 'Recuperar acceso'
                : 'Entrar en Finanzas'
        }}
      </button>
    </form>
    <p v-if="message" role="status">{{ message }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <div class="access-methods">
      <button v-if="googleEnabled" :disabled="busy" @click="social('google')">
        Continuar con Google
      </button>
      <button v-if="githubEnabled" :disabled="busy" @click="social('github')">
        Continuar con GitHub
      </button>
      <button :disabled="busy" @click="passkey">Entrar con passkey</button>
    </div>
    <button type="button" :disabled="busy" @click="changeMode('recover')">Recuperar acceso</button>
    <button type="button" :disabled="busy" @click="changeMode('verify')">
      Verificar mi correo
    </button>
  </div>
</template>
<style scoped>
.access-form {
  display: grid;
  gap: 1.5rem;
}
.access-methods {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.access-form form {
  display: grid;
  gap: 0.75rem;
}
.access-form input {
  width: 100%;
}
.access-methods button[aria-pressed='true'] {
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 0.4rem;
}
</style>
