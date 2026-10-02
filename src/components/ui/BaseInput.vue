<script setup lang="ts">
import { computed, useAttrs, useId, type StyleValue } from 'vue'

import { FIELD_CONTROL, FIELD_LABEL } from './field'

// A labelled text, number, date or search input. Other attributes (name,
// type, maxlength, required…) go to the input itself. `amount` is the large
// right-aligned figure of a panel, with its currency after it.
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
  <div :class="[FIELD_LABEL, $attrs.class]" :style="$attrs.style as StyleValue">
    <label :for="controlId" :class="{ 'sr-only': hideLabel }">{{ label }}</label>
    <span class="relative flex items-center">
      <span
        v-if="$slots.leading"
        class="text-text-muted pointer-events-none absolute left-3.5 flex"
        aria-hidden="true"
      >
        <slot name="leading" />
      </span>
      <input
        :id="controlId"
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
  </div>
</template>
