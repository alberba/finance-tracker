<script setup lang="ts" generic="T extends string | number">
import { FIELD_CONTROL, FIELD_LABEL } from './field'

export interface SelectOption<V extends string | number = string> {
  value: V
  label: string
}

// A labelled select with the app's own arrow. Options come from `options`, or
// from the default slot when they need groups. Other attributes go to the
// select itself.
defineOptions({ inheritAttrs: false })

withDefaults(
  defineProps<{
    label: string
    options?: SelectOption<T>[]
    hideLabel?: boolean
  }>(),
  { options: () => [], hideLabel: false },
)

const value = defineModel<T>({ required: true })
</script>

<template>
  <label :class="FIELD_LABEL">
    <span :class="{ 'sr-only': hideLabel }">{{ label }}</span>
    <span class="relative flex items-center">
      <select v-model="value" v-bind="$attrs" :class="[FIELD_CONTROL, 'cursor-pointer appearance-none pr-10']">
        <slot>
          <option v-for="option in options" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </slot>
      </select>
      <svg
        class="text-text-muted pointer-events-none absolute right-3.5 size-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </span>
  </label>
</template>
