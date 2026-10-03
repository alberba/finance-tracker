<script setup lang="ts">
// A row action drawn as an icon. The name is required: it is all a screen
// reader hears. `danger` turns red on hover so a delete never looks harmless.
withDefaults(
  defineProps<{
    label: string
    icon: 'edit' | 'trash' | 'close' | 'chevron-left' | 'chevron-right' | 'resend' | 'calculator'
    tone?: 'default' | 'danger' | 'ink'
    disabled?: boolean
  }>(),
  { tone: 'default', disabled: false },
)

defineEmits<{ click: [event: MouseEvent] }>()

const PATHS = {
  edit: ['M4 20h4L18.5 9.5a2.1 2.1 0 0 0-4-4L4 16v4Z', 'M13.5 6.5l4 4'],
  trash: ['M4 7h16', 'M10 11v6M14 11v6', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3'],
  close: ['M6 6l12 12M18 6L6 18'],
  'chevron-left': ['M15 6l-6 6 6 6'],
  'chevron-right': ['M9 6l6 6-6 6'],
  calculator: [
    'M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z',
    'M8 7h8',
    'M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01',
  ],
  resend: [
    'M20 11a8 8 0 0 0-14.3-4.9L4 8',
    'M4 4v4h4',
    'M4 13a8 8 0 0 0 14.3 4.9L20 16',
    'M20 20v-4h-4',
  ],
} as const

const TONE = {
  default: 'text-text-muted hover:bg-subtle hover:text-text-main',
  danger: 'text-text-muted hover:bg-loss/10 hover:text-loss',
  ink: 'text-ink-text hover:bg-ink-text/10',
} as const
</script>

<template>
  <button
    type="button"
    class="focus-visible:outline-primary inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-40"
    :class="TONE[tone]"
    :aria-label="label"
    :disabled="disabled"
    @click="$emit('click', $event)"
  >
    <svg
      class="size-4.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path v-for="path in PATHS[icon]" :key="path" :d="path" />
    </svg>
  </button>
</template>
