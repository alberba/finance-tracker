<script setup lang="ts">
import BaseButton from '../ui/BaseButton.vue'

defineProps<{ email: string; busy: boolean; sent: boolean; message: string }>()
const otp = defineModel<string>('otp', { required: true })
defineEmits<{ sendCode: []; submit: [] }>()
</script>

<template>
  <div class="grid gap-6">
    <div
      class="grid justify-items-center gap-4 text-center"
      role="note"
      aria-label="Verificación del correo"
    >
      <div class="bg-primary/10 text-primary grid size-16 place-items-center rounded-full">
        <svg
          class="size-7"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 6 9 7 9-7" />
        </svg>
      </div>
      <div class="grid gap-2" role="status">
        <p>Verifica tu correo con el enlace que hemos enviado a</p>
        <p class="font-bold [overflow-wrap:anywhere]">{{ email }}</p>
      </div>
      <p class="text-text-muted max-w-xs text-sm leading-relaxed">
        Abre el mensaje y pulsa el enlace para activar tu cuenta. Si no lo ves, revisa la carpeta de
        spam.
      </p>
    </div>
    <details class="border-line border-bs pbs-4">
      <summary
        class="text-primary focus-visible:outline-primary flex min-h-11 cursor-pointer items-center justify-center text-sm font-bold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 active:opacity-70"
      >
        Prefiero usar un código
      </summary>
      <form
        class="grid gap-3 pbs-4"
        :aria-busy="busy"
        aria-label="Verificación por código"
        @submit.prevent="$emit('submit')"
      >
        <div class="flex items-stretch gap-2">
          <input
            :value="email"
            aria-label="Correo electrónico"
            type="email"
            readonly
            class="border-line bg-subtle min-h-12 w-full min-w-0 flex-1 rounded-md border px-3"
          />
          <BaseButton :disabled="busy" @click="$emit('sendCode')"
            ><span class="text-xs">{{
              sent ? 'Enviar otro código' : 'Enviar código'
            }}</span></BaseButton
          >
        </div>
        <p v-if="message" role="status" class="text-gain text-sm">{{ message }}</p>
        <label for="verify-code">Código de seis cifras</label>
        <input
          id="verify-code"
          v-model="otp"
          :disabled="busy || !sent"
          inputmode="numeric"
          autocomplete="one-time-code"
          pattern="[0-9]{6}"
          maxlength="6"
          required
          class="border-line bg-panel focus-visible:outline-primary disabled:bg-subtle min-h-12 w-full rounded-md border px-3 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed"
        />
        <BaseButton variant="primary" type="submit" :disabled="busy || !sent">{{
          busy ? 'Un momento…' : 'Verificar correo'
        }}</BaseButton>
      </form>
    </details>
  </div>
</template>
