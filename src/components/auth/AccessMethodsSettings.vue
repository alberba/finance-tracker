<script setup lang="ts">
import BaseButton from '../ui/BaseButton.vue'
import { useAccessMethodsSettings } from '../../composables/useAccessMethodsSettings'
const { accounts, passkeys, busy, error, link, addPasskey, removePasskey } =
  useAccessMethodsSettings()
</script>
<template>
  <section
    class="bg-panel border-line grid gap-4 rounded-lg border p-5"
    aria-labelledby="methods-heading"
  >
    <h3 id="methods-heading" class="font-display text-xl font-bold">Métodos de acceso</h3>
    <p>
      Puedes entrar con un código enviado a tu correo verificado y añadir otros métodos cuando
      quieras.
    </p>
    <p v-if="error" role="alert">{{ error }}</p>
    <ul>
      <li v-for="account in accounts" :key="account.id">
        {{ account.providerId === 'credential' ? 'Contraseña' : account.providerId }}
      </li>
    </ul>
    <BaseButton :disabled="busy" @click="link('google')">Vincular Google</BaseButton>
    <BaseButton :disabled="busy" @click="link('github')">Vincular GitHub</BaseButton>
    <BaseButton :disabled="busy" @click="addPasskey">Añadir passkey</BaseButton>
    <ul>
      <li v-for="key in passkeys" :key="key.id">
        {{ key.name || 'Passkey' }}
        <BaseButton :disabled="busy" @click="removePasskey(key.id)">Eliminar passkey</BaseButton>
      </li>
    </ul>
    <a href="/login" class="inline-flex min-h-11 items-center">Configurar o recuperar contraseña</a>
  </section>
</template>
