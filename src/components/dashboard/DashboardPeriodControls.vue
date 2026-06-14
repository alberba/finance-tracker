<script setup lang="ts">
import { computed } from 'vue'
import type { DashboardMonthOption } from '../../domain/dashboard/view-model'
import DashboardPeriodField from './DashboardPeriodField.vue'

const props = defineProps<{
  year: number
  years: number[]
  month: number
  months: DashboardMonthOption[]
}>()

defineEmits<{
  'change-year': [year: number]
  'change-month': [month: number]
}>()

const yearOptions = computed(() => props.years.map((year) => ({ value: year, label: year })))
</script>

<template>
  <div class="text-text-main flex flex-wrap gap-4">
    <DashboardPeriodField
      id="year-display"
      name="yearDisplay"
      label="Año"
      :model-value="year"
      :options="yearOptions"
      :disabled="years.length <= 1"
      @update:model-value="$emit('change-year', $event)"
    />

    <DashboardPeriodField
      id="dashboard-month"
      name="dashboardMonth"
      label="Mes"
      :model-value="month"
      :options="months"
      @update:model-value="$emit('change-month', $event)"
    />
  </div>
</template>
