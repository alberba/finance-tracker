<script setup lang="ts">
// Buttons of the new design (DESIGN.md, «Botón primario» and «Botón
// secundario»): the primary is the one accent pill per view; the secondary
// reads as an underlined link next to it. `danger` paints the secondary in
// --color-loss (Eliminar). Pressed, both shrink to 0.97.
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary'
    danger?: boolean
    type?: 'button' | 'submit'
  }>(),
  { variant: 'secondary', danger: false, type: 'button' },
)
</script>

<template>
  <button
    :type="type"
    class="rounded-pill inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 motion-safe:transition-transform motion-safe:duration-160 motion-safe:ease-out motion-safe:active:scale-[0.97]"
    :class="
      variant === 'primary'
        ? 'bg-accent text-on-accent font-display outline-text px-[22px] text-[14px] font-bold'
        : [
            'outline-accent px-4 text-[14px] font-extrabold underline underline-offset-4',
            danger ? 'text-loss' : 'text-text',
          ]
    "
  >
    <slot />
  </button>
</template>
