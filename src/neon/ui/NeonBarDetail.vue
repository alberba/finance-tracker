<script setup lang="ts">
import { useBarTitleSlot } from './bar-title-slot'
import NeonDetailHeader from './NeonDetailHeader.vue'

// The detail header («‹ VWCE», DESIGN.md, «Cabecera de detalle») in the mobile
// top bar, for a detail opened without a page load. The bar is static markup
// of the frame, so this teleports the header into its title slot; while it is
// there the brand and the controls on the right give way (NeonTopBar). Unlike
// NeonBarTitle this is the real header, not a copy: the arrow and the heading
// live in the bar. Without a bar (a test, the desktop frame) it stays in place.
defineProps<{
  label: string
  backHref: string
  backLabel: string
  titleId?: string
}>()

const emit = defineEmits<{ back: [event: MouseEvent] }>()

const slot = useBarTitleSlot()
</script>

<template>
  <Teleport :to="slot ?? 'body'" :disabled="!slot">
    <div class="-ms-3 min-w-0" data-bar-title data-bar-detail>
      <NeonDetailHeader
        :label="label"
        :back-href="backHref"
        :back-label="backLabel"
        :title-id="titleId"
        @back="emit('back', $event)"
      />
    </div>
  </Teleport>
</template>
