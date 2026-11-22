<script setup lang="ts">
// A labelled text field of the login (DESIGN.md, Campo): the label sits 6px
// above a 46px box. Every other attribute (type, autocomplete, disabled…)
// reaches the input. The `action` slot puts a control at the end of the row,
// such as «Enviar código» next to the e-mail.
defineOptions({ inheritAttrs: false })
defineProps<{ id: string; label: string }>()
const value = defineModel<string>({ required: true })
</script>

<template>
  <div class="grid gap-1.5">
    <label :for="id" class="text-meta text-muted font-bold">{{ label }}</label>
    <div class="flex items-center gap-2">
      <input
        :id="id"
        v-model="value"
        v-bind="$attrs"
        class="border-ctrl-line bg-panel text-text rounded-field outline-accent placeholder:text-faint disabled:bg-panel2 disabled:text-muted box-border min-h-[46px] w-full min-w-0 flex-1 border px-3.5 font-sans text-[16px] font-bold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed"
      />
      <slot name="action" />
    </div>
  </div>
</template>
