<script setup lang="ts">
import { onMounted, shallowRef } from 'vue'

import { fetchSession, type ClientSession } from '../../../lib/client/session'
import { runClientHttp } from '../../../lib/client/runtime'
import { isDemoMode } from '../../../scripts/demo-mode'
import { logOut } from '../../../scripts/app/logout'
import NeonButton from '../../ui/NeonButton.vue'
import NeonSettingsBlock from './NeonSettingsBlock.vue'

// Cuenta: who is signed in and «Cerrar sesión», so signing out does not depend
// on the frame having a user menu.
const session = shallowRef<ClientSession | null>(null)
const busy = shallowRef(false)
const failed = shallowRef(false)
const demo = isDemoMode()

onMounted(async () => {
  if (demo) return
  session.value = await runClientHttp(fetchSession()).catch(() => null)
})

async function signOut(): Promise<void> {
  busy.value = true
  failed.value = false
  try {
    // Left alone when the user keeps pending changes: stay and try again.
    if (!(await logOut(session.value))) busy.value = false
  } catch (error) {
    console.error('No se pudo cerrar sesión.', error)
    failed.value = true
    busy.value = false
  }
}
</script>

<template>
  <NeonSettingsBlock
    v-if="!demo"
    id="cuenta"
    title="Cuenta"
    description="Con quién has entrado y cómo salir de este dispositivo."
  >
    <div
      class="border-line flex min-h-16 flex-wrap items-center justify-between gap-3 border-t py-2.5"
      data-settings-account
    >
      <span class="grid min-w-0">
        <span class="truncate text-[16px] font-bold" data-account-email>
          {{ session?.user?.email ?? 'Usuario' }}
        </span>
        <span class="text-muted text-meta"
          >Cerrar sesión borra la caché local de este dispositivo</span
        >
      </span>
      <NeonButton danger :disabled="busy" @click="signOut">Cerrar sesión</NeonButton>
    </div>
    <p v-if="failed" role="alert" class="text-loss text-note">No se pudo cerrar sesión.</p>
  </NeonSettingsBlock>
</template>
