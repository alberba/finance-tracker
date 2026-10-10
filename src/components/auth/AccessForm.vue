<script setup lang="ts">
import VerifyEmailPanel from './VerifyEmailPanel.vue'
import AccessProviderIcon from './AccessProviderIcon.vue'
import BaseButton from '../ui/BaseButton.vue'
import { computed, onMounted } from 'vue'
import { markAuthenticationReady } from '../../lib/client/authentication'
import { useAuthenticationForm } from '../../composables/useAuthenticationForm'
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
const heading = computed(
  () =>
    ({
      code: 'Accede a Finanzas',
      password: 'Accede a Finanzas',
      register: 'Crea tu cuenta',
      verify: 'Revisa tu correo',
      recover: 'Recupera tu acceso',
    })[mode.value],
)
const description = computed(
  () =>
    ({
      code: 'Recibe un código en tu correo y entra sin recordar otra contraseña.',
      password: 'Entra con tu correo y contraseña.',
      register: 'Tu correo y una contraseña. Así de sencillo.',
      verify: 'Un último paso para empezar.',
      recover: 'Te enviaremos un código para que puedas elegir una nueva contraseña.',
    })[mode.value],
)
</script>
<template>
  <Transition name="access-view" mode="out-in" appear>
    <div :key="mode" :data-access-mode="mode" class="access-flow grid w-full min-w-0 gap-6">
      <header class="grid gap-2 text-center">
        <h2 id="access-heading" class="font-display text-access-title leading-tight">
          {{ heading }}
        </h2>
        <p class="text-text-muted text-sm leading-relaxed">{{ description }}</p>
      </header>
      <VerifyEmailPanel
        v-if="mode === 'verify'"
        v-model:otp="otp"
        :email="email"
        :sent="sent"
        :busy="busy"
        :message="sent ? message : ''"
        @send-code="sendCode"
        @submit="submit"
      />
      <p
        v-if="message && mode !== 'verify'"
        class="bg-gain/10 text-gain rounded-md p-4 text-sm"
        role="status"
      >
        {{ message }}
      </p>
      <p v-if="error" class="bg-loss/10 text-loss rounded-md p-4 text-sm" role="alert">
        {{ error }}
      </p>
      <p v-if="invitationError" role="alert">{{ invitationError }}</p>
      <form
        v-if="mode !== 'verify'"
        class="grid gap-3"
        :aria-busy="busy"
        aria-label="Acceso a Finanzas"
        @submit.prevent="submit"
      >
        <label for="access-email">Correo electrónico</label>
        <div class="flex items-stretch gap-2">
          <input
            id="access-email"
            v-model="email"
            class="border-line bg-panel focus-visible:outline-primary disabled:bg-subtle disabled:text-text-muted min-h-12 w-full min-w-0 flex-1 rounded-md border px-3 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed"
            type="email"
            autocomplete="email"
            placeholder="tu@correo.com"
            required
          />
          <BaseButton
            v-if="needsCode"
            type="button"
            class="shrink-0 active:opacity-70"
            :disabled="busy || !email"
            @click="sendCode"
          >
            <span class="text-xs">{{ sent ? 'Enviar otro código' : 'Enviar código' }}</span>
          </BaseButton>
        </div>
        <template v-if="needsCode">
          <label for="access-code">Código de seis cifras</label>
          <input
            id="access-code"
            v-model="otp"
            :disabled="!sent || busy"
            class="border-line bg-panel focus-visible:outline-primary disabled:bg-subtle disabled:text-text-muted min-h-12 w-full rounded-md border px-3 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed"
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
            :disabled="busy || (needsCode && !sent)"
            class="border-line bg-panel focus-visible:outline-primary disabled:bg-subtle disabled:text-text-muted min-h-12 w-full rounded-md border px-3 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed"
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
        <p v-if="mode === 'register'" class="text-text-muted text-xs">
          Usa al menos 12 caracteres. Después te pediremos verificar tu correo.
        </p>
        <BaseButton
          variant="primary"
          class="mbs-2 min-h-12 active:opacity-70"
          :disabled="busy || (needsCode && !sent)"
          type="submit"
        >
          {{
            busy
              ? 'Un momento…'
              : mode === 'register'
                ? 'Crear cuenta'
                : mode === 'verify'
                  ? 'Verificar correo'
                  : mode === 'recover'
                    ? 'Recuperar acceso'
                    : 'Entrar en Finanzas'
          }}
        </BaseButton>
      </form>
      <p
        v-if="mode === 'password' || mode === 'code' || mode === 'register'"
        class="text-text-muted flex flex-wrap items-center justify-center gap-1 text-sm"
      >
        {{ mode === 'register' ? '¿Ya tienes cuenta?' : '¿No tienes cuenta?' }}
        <button
          type="button"
          class="text-primary focus-visible:outline-primary min-h-11 cursor-pointer font-bold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 active:opacity-70 disabled:opacity-50"
          :disabled="busy"
          @click="changeMode(mode === 'register' ? 'password' : 'register')"
        >
          {{ mode === 'register' ? 'Entrar' : 'Crear cuenta' }}
        </button>
      </p>
      <div
        v-if="mode === 'code' || mode === 'password' || mode === 'register'"
        class="border-line flex flex-wrap justify-center gap-3 border-bs pbs-6"
      >
        <p class="text-text-muted w-full text-center text-xs">O continúa con otro método</p>
        <BaseButton
          v-if="googleEnabled"
          icon-only
          class="shrink-0"
          aria-label="Continuar con Google"
          :disabled="busy"
          @click="social('google')"
        >
          <AccessProviderIcon provider="google" />
        </BaseButton>
        <BaseButton
          v-if="githubEnabled"
          icon-only
          class="shrink-0"
          aria-label="Continuar con GitHub"
          :disabled="busy"
          @click="social('github')"
        >
          <AccessProviderIcon provider="github" />
        </BaseButton>
        <BaseButton
          icon-only
          class="shrink-0"
          aria-label="Entrar con passkey"
          :disabled="busy"
          @click="passkey"
          ><AccessProviderIcon provider="passkey"
        /></BaseButton>
      </div>
      <div class="border-line flex flex-wrap justify-center gap-2 border-bs pbs-4">
        <BaseButton
          v-if="mode === 'code'"
          variant="ghost"
          :disabled="busy"
          @click="changeMode('password')"
          >Acceder con contraseña</BaseButton
        >
        <BaseButton
          v-if="mode === 'password' || mode === 'register'"
          variant="ghost"
          :disabled="busy"
          @click="changeMode('code')"
          >Código por correo</BaseButton
        >
        <BaseButton
          v-if="mode !== 'recover' && mode !== 'verify'"
          variant="ghost"
          class="text-xs active:opacity-70"
          type="button"
          :disabled="busy"
          @click="changeMode('recover')"
          >Recuperar acceso</BaseButton
        >
        <BaseButton
          v-if="mode === 'verify' || mode === 'recover'"
          variant="ghost"
          class="text-xs active:opacity-70"
          :disabled="busy"
          @click="changeMode('password')"
          >Volver al inicio de sesión</BaseButton
        >
      </div>
    </div>
  </Transition>
</template>

<style scoped>
@media (prefers-reduced-motion: no-preference) {
  .access-view-enter-active {
    transition:
      opacity var(--motion-view) var(--ease-out),
      transform var(--motion-view) var(--ease-out);
  }

  .access-view-enter-from {
    opacity: 0;
    transform: translateX(var(--motion-distance));
  }

  .access-view-leave-active {
    transition: opacity calc(var(--motion-view) / 3) var(--ease-out);
  }

  .access-view-leave-to {
    opacity: 0;
  }

  .access-flow :deep(button) {
    transition:
      transform var(--motion-fast) var(--ease-out),
      background-color var(--motion-fast) var(--ease-out),
      border-color var(--motion-fast) var(--ease-out),
      opacity var(--motion-fast) var(--ease-out);
  }

  .access-flow :deep(button:enabled:active) {
    transform: scale(0.97);
  }

  @media (hover: hover) and (pointer: fine) {
    .access-flow :deep(button:enabled:hover) {
      transform: translateY(calc(var(--motion-distance) * -0.125));
    }

    .access-flow :deep(button:enabled:hover:active) {
      transform: scale(0.97);
    }
  }
}
</style>
