<script setup lang="ts">
// Empty state of the new design (DESIGN.md, Estado vacío): a block with no
// data. A note in the default slot and, when it applies, a secondary button in
// the `action` slot.
</script>

<template>
  <div
    class="border-line rounded-card grid justify-items-start gap-3 border border-dashed px-6 py-[22px]"
    data-empty-state
  >
    <p class="text-muted text-sm"><slot /></p>
    <slot name="action" />
  </div>
</template>
