<script setup lang="ts">
import NeonAccessField from './NeonAccessField.vue'
import NeonButton from '../ui/NeonButton.vue'

// «Revisa tu correo» of the login: the account exists but its e-mail is not
// verified. The note is a dashed block (DESIGN.md, Estado vacío) naming the
// address; the code is the fallback, folded under «Prefiero usar un código».
defineProps<{ busy: boolean; sent: boolean; message: string }>()
const email = defineModel<string>('email', { required: true })
const otp = defineModel<string>('otp', { required: true })
defineEmits<{ sendCode: []; submit: [] }>()
</script>

<template>
  <div class="grid gap-4">
    <div
      class="border-line rounded-card grid gap-2 border border-dashed px-6 py-[22px]"
      role="note"
      aria-label="Verificación del correo"
    >
      <div class="grid gap-1" role="status">
        <p class="text-soft">Verifica tu correo con el enlace de activación enviado a</p>
        <p class="text-row text-text font-bold [overflow-wrap:anywhere]">{{ email }}</p>
      </div>
      <p class="text-note text-muted">
        Abre el mensaje y pulsa el enlace para activar tu cuenta. Si no lo ves, revisa la carpeta de
        spam.
      </p>
    </div>
    <details class="group">
      <summary
        class="rounded-pill text-text outline-accent flex min-h-11 cursor-pointer list-none items-center justify-center px-4 text-[14px] font-extrabold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden"
      >
        Prefiero usar un código
      </summary>
      <form
        class="grid gap-3 pbs-3"
        :aria-busy="busy"
        aria-label="Verificación por código"
        @submit.prevent="$emit('submit')"
      >
        <NeonAccessField
          id="verify-email"
          v-model="email"
          label="Correo electrónico"
          type="email"
          autocomplete="email"
        >
          <template #action>
            <NeonButton :disabled="busy" @click="$emit('sendCode')">
              {{ sent ? 'Enviar otro código' : 'Enviar código' }}
            </NeonButton>
          </template>
        </NeonAccessField>
        <p v-if="message" role="status" class="text-note text-soft">{{ message }}</p>
        <NeonAccessField
          id="verify-code"
          v-model="otp"
          label="Código de seis cifras"
          :disabled="busy || !sent"
          inputmode="numeric"
          autocomplete="one-time-code"
          pattern="[0-9]{6}"
          maxlength="6"
          required
        />
        <NeonButton variant="primary" type="submit" class="w-full" :disabled="busy || !sent">
          {{ busy ? 'Un momento…' : 'Verificar correo' }}
        </NeonButton>
      </form>
    </details>
  </div>
</template>
