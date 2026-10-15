<script setup lang="ts">
import BaseButton from '../ui/BaseButton.vue'
import NumberedBlock from '../ui/NumberedBlock.vue'
import SidePanel from '../ui/SidePanel.vue'

const open = defineModel<boolean>('open', { required: true })
defineProps<{ accountCompleted: boolean; movementCompleted: boolean; complete: boolean }>()
defineEmits<{
  account: []
  movement: []
  dismiss: []
  optional: [section: 'budget' | 'investment' | 'settings']
}>()
</script>

<template>
  <SidePanel
    :open="open"
    kicker="Tu punto de partida"
    title="Bienvenido a tus finanzas"
    title-id="welcome-title"
    @update:open="$emit('dismiss')"
  >
    <p class="text-text-muted text-base">
      Empieza con una cuenta y un movimiento. Con eso ya puedes seguir tu día a día.
    </p>
    <div class="divide-line divide-y">
      <NumberedBlock
        number="01"
        title="Crea una cuenta"
        title-id="welcome-account-title"
        description="Dale un nombre y apunta su saldo inicial. Puede ser tu cuenta bancaria o tu efectivo."
      >
        <p v-if="accountCompleted" class="text-gain text-sm font-semibold">✓ Cuenta creada</p>
        <BaseButton v-else class="active:opacity-80" variant="primary" @click="$emit('account')"
          >Crear cuenta</BaseButton
        >
      </NumberedBlock>
      <NumberedBlock
        number="02"
        title="Registra tu primer movimiento"
        title-id="welcome-movement-title"
        description="Anota un ingreso o un gasto: importe, fecha, cuenta y categoría. Una importación también cuenta."
      >
        <p v-if="movementCompleted" class="text-gain text-sm font-semibold">
          ✓ Movimiento registrado
        </p>
        <BaseButton
          v-else
          class="active:opacity-80"
          :disabled="!accountCompleted"
          variant="primary"
          @click="$emit('movement')"
        >
          Registrar movimiento
        </BaseButton>
        <p v-if="!accountCompleted && !movementCompleted" class="text-text-muted text-sm">
          Crea una cuenta para poder registrar movimientos.
        </p>
      </NumberedBlock>
      <NumberedBlock
        number="03"
        title="A tu ritmo"
        title-id="welcome-optional-title"
        description="Presupuestos, inversión e integraciones son pasos opcionales. Puedes operar manualmente desde el principio."
      >
        <div class="flex flex-wrap gap-2">
          <BaseButton class="active:opacity-80" variant="ghost" @click="$emit('optional', 'budget')"
            >Presupuesto</BaseButton
          >
          <BaseButton
            class="active:opacity-80"
            variant="ghost"
            @click="$emit('optional', 'investment')"
            >Inversión</BaseButton
          >
          <BaseButton
            class="active:opacity-80"
            variant="ghost"
            @click="$emit('optional', 'settings')"
            >Integraciones</BaseButton
          >
        </div>
      </NumberedBlock>
    </div>
    <template #footer>
      <BaseButton
        class="active:opacity-80"
        :variant="complete ? 'primary' : 'secondary'"
        @click="$emit('dismiss')"
      >
        {{ complete ? 'Entendido' : 'Ahora no' }}
      </BaseButton>
    </template>
  </SidePanel>
</template>
