<script setup lang="ts">
// The app's button. `primary` is the one main action of a screen or panel;
// `secondary` and `ghost` sit beside it; `danger` is for destructive actions.
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
    type?: 'button' | 'submit'
    disabled?: boolean
  }>(),
  { variant: 'secondary', type: 'button', disabled: false },
)

defineEmits<{ click: [event: MouseEvent] }>()

const VARIANT = {
  primary: 'bg-primary-fill text-on-primary hover:bg-primary-fill-hover border-transparent',
  secondary: 'border-line-strong bg-panel text-text-main hover:border-primary',
  ghost: 'border-transparent text-text-main hover:bg-subtle',
  danger: 'border-transparent bg-loss/10 text-loss hover:bg-loss/15',
} as const
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    class="focus-visible:outline-primary inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border px-4 text-sm font-bold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:text-base"
    :class="VARIANT[variant]"
    @click="$emit('click', $event)"
  >
    <slot />
  </button>
</template>
