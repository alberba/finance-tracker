<script setup lang="ts">
// Switch of the new design: a 46×28 track with a knob, in the accent color
// when on. A real button with role=switch, named by `label`.
defineProps<{ label: string }>()
const on = defineModel<boolean>({ required: true })
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="on"
    :aria-label="label"
    class="outline-accent relative h-7 w-[46px] shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-140 motion-safe:active:scale-[0.96]"
    :class="on ? 'bg-accent' : 'inset-ring-ctrl-line inset-ring'"
    @click="on = !on"
  >
    <span
      class="absolute top-[3px] size-[22px] rounded-full motion-safe:transition-[inset-inline-start] motion-safe:duration-160"
      :class="on ? 'bg-on-accent inset-s-[21px]' : 'bg-muted inset-s-[3px]'"
      aria-hidden="true"
    />
  </button>
</template>
