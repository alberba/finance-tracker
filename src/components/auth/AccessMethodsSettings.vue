<script setup lang="ts">
import { useAccessMethodsSettings } from '../../composables/useAccessMethodsSettings'
const { accounts, passkeys, busy, error, link, addPasskey, removePasskey } =
  useAccessMethodsSettings()
</script>
<template>
  <section aria-labelledby="methods-heading">
    <h3 id="methods-heading">Métodos de acceso</h3>
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
    <button :disabled="busy" @click="link('google')">Vincular Google</button>
    <button :disabled="busy" @click="link('github')">Vincular GitHub</button>
    <button :disabled="busy" @click="addPasskey">Añadir passkey</button>
    <ul>
      <li v-for="key in passkeys" :key="key.id">
        {{ key.name || 'Passkey' }}
        <button :disabled="busy" @click="removePasskey(key.id)">Eliminar passkey</button>
      </li>
    </ul>
    <a href="/login">Configurar o recuperar contraseña</a>
  </section>
</template>
