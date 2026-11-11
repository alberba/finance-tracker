<script setup lang="ts">
// A screenshot waiting to be sent, or kept on an edited reply: its name and a
// button to take it out (DESIGN.md, «Chip de filtro» shape: a pill of 44px).
defineProps<{ name: string }>()
defineEmits<{ remove: [] }>()
</script>

<template>
  <li
    class="border-ctrl-line inline-flex min-h-11 items-center gap-1 rounded-full border ps-3.5 pe-1 text-[14px] font-bold"
  >
    <svg
      class="text-muted size-4 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15.5 9.5h.01" />
    </svg>
    <span class="min-w-0 truncate">{{ name }}</span>
    <button
      type="button"
      class="outline-accent grid size-9 shrink-0 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-160 motion-safe:ease-out motion-safe:active:scale-[0.97]"
      :aria-label="`Quitar ${name}`"
      @click="$emit('remove')"
    >
      <svg
        class="size-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  </li>
</template>
