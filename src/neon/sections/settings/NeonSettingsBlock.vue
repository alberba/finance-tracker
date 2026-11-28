<script setup lang="ts">
import { inject } from 'vue'

import { BARE_BLOCK } from './settings-layout'

// One apartado of Configuración: title, a line saying what it is for, and its
// content. The id (`cfg-<id>`) is what the index scrolls to. On its own mobile
// screen the screen already says both, so only the content shows.
defineProps<{ id: string; title: string; description?: string }>()
const bare = inject(BARE_BLOCK, false)
</script>

<template>
  <section
    v-if="bare"
    :id="`cfg-${id}`"
    :aria-label="title"
    class="grid min-w-0 gap-4"
    :data-settings-part="id"
  >
    <slot />
  </section>
  <section
    v-else
    :id="`cfg-${id}`"
    :aria-labelledby="`cfg-${id}-title`"
    class="border-line grid scroll-mt-6 gap-4 border-t pbs-7 pbe-3 first:border-t-0 first:pbs-4"
    :data-settings-part="id"
  >
    <div class="grid gap-1">
      <h2 :id="`cfg-${id}-title`" class="text-block-title font-sans font-extrabold">
        {{ title }}
      </h2>
      <p v-if="description" class="text-muted text-note">{{ description }}</p>
    </div>
    <slot />
  </section>
</template>
