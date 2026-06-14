<script setup lang="ts">
import { useAttrs } from 'vue'

defineOptions({
  inheritAttrs: false,
})

defineProps<{
  title: string
  actionLabel: string
  actionTarget: string
}>()

defineEmits<{
  navigate: [target: string]
}>()

const attrs = useAttrs()
</script>

<template>
  <article
    :class="[
      'flex flex-col gap-3 rounded-lg bg-(--bg-panel) p-4 [box-shadow:var(--shadow-soft)]',
      attrs.class,
    ]"
  >
    <h3 class="font-bold text-text-main">
      {{ title }}
    </h3>

    <slot />

    <button
      type="button"
      class="mt-auto inline-flex items-center gap-1.5 bg-transparent text-primary"
      :data-goto="actionTarget"
      @click="$emit('navigate', actionTarget)"
    >
      {{ actionLabel }}
      <svg
        class="h-4 w-4 transition-transform hover:translate-x-0.75"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        aria-hidden="true"
      >
        <path d="M4 10h11M11 6l4 4-4 4"></path>
      </svg>
    </button>
  </article>
</template>
