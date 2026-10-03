<script setup lang="ts">
// The small monospaced line above a title. `ink` is for the ink surface.
withDefaults(defineProps<{ tone?: 'primary' | 'ink'; as?: 'p' | 'h3' }>(), {
  tone: 'primary',
  as: 'p',
})
</script>

<template>
  <component
    :is="as"
    class="font-mono text-xs tracking-[0.16em] uppercase"
    :class="tone === 'ink' ? 'text-ink-muted' : 'text-primary'"
  >
    <slot />
  </component>
</template>
