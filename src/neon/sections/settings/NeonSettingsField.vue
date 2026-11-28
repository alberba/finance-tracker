<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

// Field of the ledger tables of Configuración (DESIGN.md, Campo): it shows the
// saved value and sends it up with `commit` when the user leaves it or presses
// Enter. If the parent does not accept the change, the field goes back to the
// value it was given. With v-model it also follows each keystroke, which is
// how the add rows keep what is typed before «Añadir».
const props = withDefaults(
  defineProps<{
    modelValue: string
    label: string
    /** `figure` paints an amount (Unbounded) and `value` a short setting, both flush to the end. */
    kind?: 'text' | 'figure' | 'value'
    placeholder?: string
    type?: 'text' | 'password' | 'number'
  }>(),
  { kind: 'text', placeholder: undefined, type: 'text' },
)
const emit = defineEmits<{ commit: [value: string]; 'update:modelValue': [value: string] }>()

const text = ref(props.modelValue)
watch(
  () => props.modelValue,
  (value) => (text.value = value),
)

function commit(): void {
  if (text.value === props.modelValue) return
  emit('commit', text.value)
  void nextTick(() => (text.value = props.modelValue))
}
</script>

<template>
  <input
    v-model="text"
    :type="type"
    :inputmode="kind === 'figure' ? 'decimal' : undefined"
    :aria-label="label"
    :placeholder="placeholder"
    autocomplete="off"
    class="border-ctrl-line bg-panel text-text rounded-field outline-accent placeholder:text-faint box-border min-h-[46px] w-full min-w-0 border px-3.5 focus-visible:outline-2 focus-visible:outline-offset-2"
    :class="[
      kind === 'figure'
        ? 'font-display text-end text-[16px] font-semibold'
        : 'font-sans text-[16px] font-bold',
      kind === 'value' ? 'text-end' : '',
    ]"
    @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    @change="commit"
    @keydown.enter="commit"
  />
</template>
