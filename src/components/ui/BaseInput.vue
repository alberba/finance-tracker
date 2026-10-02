<script setup lang="ts">
import { computed, useAttrs, type StyleValue } from 'vue'

import { FIELD_CONTROL, FIELD_LABEL } from './field'

// A labelled text, number, date or search input. Other attributes (name,
// type, maxlength, required…) go to the input itself. `amount` is the large
// right-aligned figure of a panel, with its currency after it.
defineOptions({ inheritAttrs: false })

// `class` and `style` place the field (on the label); the rest go to the control.
const attrs = useAttrs()
const controlAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs
  return rest
})

withDefaults(
  defineProps<{
    label: string
    hideLabel?: boolean
    variant?: 'default' | 'amount'
    /** Shown after the value inside the field, e.g. "€". */
    suffix?: string
  }>(),
  { hideLabel: false, variant: 'default', suffix: undefined },
)

const value = defineModel<string>({ required: true })
</script>

<template>
  <label :class="[FIELD_LABEL, $attrs.class]" :style="$attrs.style as StyleValue">
    <span :class="{ 'sr-only': hideLabel }">{{ label }}</span>
    <span class="relative flex items-center">
      <span
        v-if="$slots.leading"
        class="text-text-muted pointer-events-none absolute left-3.5 flex"
        aria-hidden="true"
      >
        <slot name="leading" />
      </span>
      <input
        v-model="value"
        v-bind="controlAttrs"
        :class="[
          FIELD_CONTROL,
          variant === 'amount'
            ? 'font-display h-16 pr-12 text-right text-3xl font-medium tabular-nums'
            : 'text-base',
          $slots.leading ? 'pl-10' : '',
          suffix && variant !== 'amount' ? 'pr-9' : '',
        ]"
      />
      <span
        v-if="suffix"
        class="font-display text-text-muted pointer-events-none absolute right-4"
        :class="variant === 'amount' ? 'text-2xl' : 'text-base'"
        aria-hidden="true"
      >
        {{ suffix }}
      </span>
    </span>
  </label>
</template>
