<script setup lang="ts" generic="T extends string | number">
import { computed, useAttrs, useId, type StyleValue } from 'vue'

import { FIELD_CONTROL, FIELD_LABEL } from './field'

export interface SelectOption<V extends string | number = string> {
  value: V
  label: string
}

// A labelled select with the app's own arrow. Options come from `options`, or
// from the default slot when they need groups. Other attributes go to the
// select itself.
defineOptions({ inheritAttrs: false })

// `class` and `style` place the field (on its wrapper); the rest go to the
// control. The label points at the control with `for`, so the control's name
// is the label alone, never the label plus the chosen value.
const attrs = useAttrs()
const generatedId = useId()
const controlId = computed(() => String(attrs.id ?? generatedId))
const controlAttrs = computed(() => {
  const { class: _class, style: _style, id: _id, ...rest } = attrs
  return rest
})

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
  <div :class="[FIELD_LABEL, $attrs.class]" :style="$attrs.style as StyleValue">
    <label :for="controlId" :class="{ 'sr-only': hideLabel }">{{ label }}</label>
    <span class="relative flex items-center">
      <select
        :id="controlId"
        v-model="value"
        v-bind="controlAttrs"
        :class="[FIELD_CONTROL, 'cursor-pointer appearance-none pr-10 text-base']"
      >
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
  </div>
</template>
