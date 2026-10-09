<script setup lang="ts">
// The small-caps title of a group of fields or a section in a side panel:
// a `legend` inside a fieldset, an `h3` elsewhere.
withDefaults(defineProps<{ as?: 'legend' | 'h3' }>(), { as: 'legend' })
</script>

<template>
  <component :is="as" class="text-text-muted mb-3 text-xs font-bold tracking-widest uppercase">
    <slot />
  </component>
</template>
