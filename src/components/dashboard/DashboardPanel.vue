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
      'flex min-w-0 flex-col gap-4 rounded-xl border border-(--line) bg-(--bg-panel) p-4 [box-shadow:var(--shadow-soft)] sm:p-5',
      attrs.class,
    ]"
  >
    <h3 class="font-display text-text-main text-base font-bold">
      {{ title }}
    </h3>

    <slot />

    <button
      type="button"
      class="text-primary mt-auto inline-flex min-h-11 w-fit items-center gap-1.5 rounded-lg bg-transparent px-1 text-sm font-semibold transition-colors hover:bg-(--primary-light)"
      :data-goto="actionTarget"
      @click="$emit('navigate', actionTarget)"
    >
      {{ actionLabel }}
      <RightArrowIcon class="size-5 shrink-0" />
    </button>
  </article>
</template>
