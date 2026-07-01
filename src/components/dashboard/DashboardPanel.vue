<script setup lang="ts">
import { useAttrs } from 'vue'
import RightArrowIcon from '../../assets/icons/right-arrow.svg?component'

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
      <RightArrowIcon class="size-5 shrink-0" />
    </button>
  </article>
</template>
