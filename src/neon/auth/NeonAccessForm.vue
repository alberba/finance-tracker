<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'

import { useCopyText } from '../../composables/useCopyText'
import { useAuthenticationForm, type AccessMode } from '../../composables/useAuthenticationForm'
import { markAuthenticationReady } from '../../lib/client/authentication-ready'
import NeonButton from '../ui/NeonButton.vue'
import NeonAccessField from './NeonAccessField.vue'
import { accessErrorText } from './access-errors'
import NeonProviderIcon from './NeonProviderIcon.vue'
import NeonVerifyEmail from './NeonVerifyEmail.vue'

// The login. No artboard: it is built from DESIGN.md
// (Campo, Botón primario, Botón de icono, Segmentado, Estado vacío). The flow itself (modes,
// codes, Better Auth calls) is the shared useAuthenticationForm.
const props = defineProps<{
  invitationError?: string
  googleEnabled: boolean
  githubEnabled: boolean
  verifyEmail?: string
  initialError?: string
  initialReference?: string
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
  reference,
  needsCode,
  needsPassword,
  changeMode,
  sendCode,
  submit,
  social,
  passkey,
} = useAuthenticationForm({
  verifyEmail: props.verifyEmail,
  initialError: props.initialError,
  initialReference: props.initialReference,
})

const COPY: Record<AccessMode, { heading: string; lede: string; submit: string }> = {
  password: {
    heading: 'Accede a Finanzas',
    lede: 'Entra con tu correo y tu contraseña.',
    submit: 'Entrar en Finanzas',
  },
  code: {
    heading: 'Accede a Finanzas',
    lede: 'Te mandamos un código al correo y entras sin recordar otra contraseña.',
    submit: 'Entrar en Finanzas',
  },
  register: {
    heading: 'Crea tu cuenta',
    lede: 'Tu correo y una contraseña. Así de sencillo.',
    submit: 'Crear cuenta',
  },
  verify: {
    heading: 'Revisa tu correo',
    lede: 'Un último paso para empezar.',
    submit: 'Verificar correo',
  },
  recover: {
    heading: 'Recupera tu acceso',
    lede: 'Te enviamos un código para que elijas una contraseña nueva.',
    submit: 'Recuperar acceso',
  },
}
const { copyText, copyStatus } = useCopyText()
const copy = computed(() => COPY[mode.value])

/** Password or code: the two ways into an existing account, as a segmented control. */
const METHODS = [
  { value: 'password', label: 'Contraseña' },
  { value: 'code', label: 'Código por correo' },
] as const
const signingIn = computed(() => mode.value === 'password' || mode.value === 'code')
const offersProviders = computed(() => signingIn.value || mode.value === 'register')
/** The other ways in, as Botón de icono: the OAuth ones only when configured. */
const providers = computed(() => [
  ...(props.googleEnabled
    ? [{ id: 'google', label: 'Continuar con Google', signIn: () => social('google') } as const]
    : []),
  ...(props.githubEnabled
    ? [{ id: 'github', label: 'Continuar con GitHub', signIn: () => social('github') } as const]
    : []),
  { id: 'passkey', label: 'Entrar con passkey', signIn: passkey } as const,
])

const heading = ref<HTMLHeadingElement>()
watch(mode, () => nextTick(() => heading.value?.focus({ preventScroll: true })))
onMounted(markAuthenticationReady)
</script>

<template>
  <div :data-access-mode="mode" class="grid w-full min-w-0 gap-6">
    <header class="grid gap-2">
      <h1
        id="access-heading"
        ref="heading"
        tabindex="-1"
        class="font-display text-text outline-accent tracking-h1 text-[30px] leading-[1.1] font-bold focus-visible:outline-2 focus-visible:outline-offset-4"
      >
        {{ copy.heading }}
      </h1>
      <p class="text-lede text-soft leading-[1.45]">{{ copy.lede }}</p>
    </header>

    <div
      v-if="signingIn"
      class="bg-panel2 rounded-pill flex gap-0.75 p-0.75"
      role="group"
      aria-label="Método de acceso"
    >
      <button
        v-for="method in METHODS"
        :key="method.value"
        type="button"
        class="rounded-pill text-soft pointer-fine:hover:text-text aria-pressed:bg-sel-bg aria-pressed:text-sel-text outline-accent min-h-9 min-w-0 flex-1 px-2 text-sm font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed motion-safe:transition-[transform,background-color,color] motion-safe:duration-140 motion-safe:ease-out motion-safe:active:scale-[0.96] pointer-coarse:min-h-11"
        :aria-pressed="mode === method.value"
        :disabled="busy"
        @click="changeMode(method.value)"
      >
        {{ method.label }}
      </button>
    </div>

    <NeonVerifyEmail
      v-if="mode === 'verify'"
      v-model:otp="otp"
      v-model:email="email"
      :sent="sent"
      :busy="busy"
      :message="sent ? message : ''"
      @send-code="sendCode"
      @submit="submit"
    />

    <p v-if="error" class="text-note text-loss font-bold" role="alert">
      {{ accessErrorText(error) }}
    </p>
    <div v-if="error && reference" class="text-muted text-note grid gap-1">
      <p>
        Referencia técnica <code class="text-soft break-all">{{ reference }}</code>
      </p>
      <NeonButton class="justify-self-start" @click="copyText(reference)">
        Copiar referencia técnica
      </NeonButton>
      <p v-if="copyStatus" role="status">{{ copyStatus }}</p>
    </div>
    <p v-if="invitationError" class="text-note text-loss font-bold" role="alert">
      {{ invitationError }}
    </p>

    <form
      v-if="mode !== 'verify'"
      class="grid gap-4"
      :aria-busy="busy"
      aria-label="Acceso a Finanzas"
      @submit.prevent="submit"
    >
      <NeonAccessField
        id="access-email"
        v-model="email"
        label="Correo electrónico"
        type="email"
        autocomplete="email"
        placeholder="tu@correo.com"
        required
      >
        <template v-if="needsCode" #action>
          <NeonButton :disabled="busy || !email" @click="sendCode">
            {{ sent ? 'Enviar otro código' : 'Enviar código' }}
          </NeonButton>
        </template>
      </NeonAccessField>
      <p v-if="message" class="text-note text-soft" role="status">{{ message }}</p>
      <NeonAccessField
        v-if="needsCode"
        id="access-code"
        v-model="otp"
        label="Código de seis cifras"
        :disabled="!sent || busy"
        inputmode="numeric"
        autocomplete="one-time-code"
        pattern="[0-9]{6}"
        maxlength="6"
        required
      />
      <NeonAccessField
        v-if="needsPassword"
        id="access-password"
        v-model="password"
        :label="mode === 'recover' ? 'Nueva contraseña' : 'Contraseña'"
        :disabled="busy || (needsCode && !sent)"
        type="password"
        :autocomplete="mode === 'password' ? 'current-password' : 'new-password'"
        :minlength="mode === 'password' ? 8 : 12"
        required
      />
      <p v-if="mode === 'register'" class="text-meta text-muted">
        Usa al menos 12 caracteres. Después te pediremos verificar tu correo.
      </p>
      <p v-if="mode === 'recover'" class="text-meta text-muted">
        Recuperar el acceso cierra las demás sesiones. La contraseña nueva también te sirve si has
        perdido tus passkeys.
      </p>
      <NeonButton
        variant="primary"
        type="submit"
        class="mbs-1 w-full"
        :disabled="busy || (needsCode && !sent)"
      >
        {{ busy ? 'Un momento…' : copy.submit }}
      </NeonButton>
    </form>

    <div v-if="offersProviders" class="grid justify-items-center gap-3">
      <p class="text-label text-muted tracking-label font-extrabold uppercase">O entra con</p>
      <div class="flex gap-3">
        <button
          v-for="provider in providers"
          :key="provider.id"
          type="button"
          class="border-ctrl-line text-text pointer-fine:hover:bg-panel2 outline-accent grid size-11 cursor-pointer place-items-center rounded-full border focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 motion-safe:transition-transform motion-safe:duration-160 motion-safe:ease-out motion-safe:active:scale-[0.97]"
          :aria-label="provider.label"
          :disabled="busy"
          @click="provider.signIn"
        >
          <NeonProviderIcon :provider="provider.id" />
        </button>
      </div>
    </div>

    <div class="border-line flex flex-wrap items-center justify-center gap-x-1 border-bs pbs-4">
      <template v-if="signingIn">
        <span class="text-note text-muted">¿No tienes cuenta?</span>
        <NeonButton class="px-2" :disabled="busy" @click="changeMode('register')">
          Crear cuenta
        </NeonButton>
      </template>
      <template v-else-if="mode === 'register'">
        <span class="text-note text-muted">¿Ya tienes cuenta?</span>
        <NeonButton class="px-2" :disabled="busy" @click="changeMode('password')"
          >Entrar</NeonButton
        >
      </template>
      <NeonButton v-if="offersProviders" :disabled="busy" @click="changeMode('recover')">
        Recuperar acceso
      </NeonButton>
      <NeonButton v-else :disabled="busy" @click="changeMode('password')">
        Volver al inicio de sesión
      </NeonButton>
    </div>
  </div>
</template>
