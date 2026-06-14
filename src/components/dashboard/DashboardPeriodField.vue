<script setup lang="ts">
import DropdownIcon from '../../assets/icons/dropdown.svg?component'

interface PeriodOption {
  value: number
  label: string | number
}

withDefaults(
  defineProps<{
    label: string
    id: string
    name: string
    modelValue: number
    options: PeriodOption[]
    disabled?: boolean
  }>(),
  {
    disabled: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

function onChange(event: Event): void {
  const target = event.target instanceof HTMLSelectElement ? event.target : null
  if (!target) {
    return
  }
  emit('update:modelValue', Number(target.value))
}
</script>

<template>
  <label class="grid gap-1">
    <span class="text-text-faint text-[0.6rem] font-bold uppercase">
      {{ label }}
    </span>
    <span
      class="focus-within:border-primary relative inline-flex items-center rounded-md bg-(--bg-panel) px-2 shadow-(--shadow-soft) focus-within:shadow-[0_0_0_3px_var(--ring)]"
    >
      <select
        :id="id"
        class="appearance-none rounded-md border-0 bg-transparent py-2"
        :name="name"
        :value="modelValue"
        :disabled="disabled"
        @change="onChange"
      >
        <option v-for="option in options" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
      <DropdownIcon />
    </span>
  </label>
</template>
