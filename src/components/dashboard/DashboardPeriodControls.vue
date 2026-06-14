<script setup lang="ts">
import type { DashboardMonthOption } from '../../domain/dashboard/view-model'

defineProps<{
  year: number
  month: number
  months: DashboardMonthOption[]
}>()

const emit = defineEmits<{
  'change-year': [year: number]
  'change-month': [month: number]
}>()

function changeYear(event: Event): void {
  const target = event.target instanceof HTMLInputElement ? event.target : null
  if (!target) {
    return
  }
  emit('change-year', Number(target.value))
}

function changeMonth(event: Event): void {
  const target = event.target instanceof HTMLSelectElement ? event.target : null
  if (!target) {
    return
  }
  emit('change-month', Number(target.value))
}
</script>

<template>
  <div class="dash-period flex flex-wrap items-stretch gap-3">
    <label class="dash-period-field grid gap-1">
      <span class="pl-0.5 text-[0.6rem] font-bold tracking-[0.12em] text-text-faint uppercase">
        Año
      </span>
      <span
        class="dash-period-control relative inline-flex items-center rounded-md border border-(--line) bg-(--bg-panel) [box-shadow:var(--shadow-soft)] focus-within:border-primary focus-within:[box-shadow:0_0_0_3px_var(--ring)]"
      >
        <input
          id="year-display"
          class="w-auto min-w-19.5 appearance-none rounded-md border-0 bg-transparent py-2.25 pr-8.5 pl-3.5 text-[0.95rem] font-semibold text-text-main"
          name="yearDisplay"
          type="number"
          min="2000"
          max="2100"
          autocomplete="off"
          :value="year"
          @change="changeYear"
        />
        <svg
          class="dash-period-icon pointer-events-none absolute right-2.75 h-3.5 w-3.5 text-text-faint"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          aria-hidden="true"
        >
          <rect x="3" y="4.5" width="14" height="12" rx="2"></rect>
          <path d="M3 8h14M7 3v3M13 3v3"></path>
        </svg>
      </span>
    </label>

    <label class="dash-period-field grid gap-1">
      <span class="pl-0.5 text-[0.6rem] font-bold tracking-[0.12em] text-text-faint uppercase">
        Mes
      </span>
      <span
        class="dash-period-control relative inline-flex items-center rounded-md border border-(--line) bg-(--bg-panel) [box-shadow:var(--shadow-soft)] focus-within:border-primary focus-within:[box-shadow:0_0_0_3px_var(--ring)]"
      >
        <select
          id="dashboard-month"
          class="w-auto min-w-23 appearance-none rounded-md border-0 bg-transparent py-2.25 pr-8.5 pl-3.5 text-[0.95rem] font-semibold text-text-main"
          name="dashboardMonth"
          :value="month"
          @change="changeMonth"
        >
          <option v-for="monthOption in months" :key="monthOption.value" :value="monthOption.value">
            {{ monthOption.label }}
          </option>
        </select>
        <svg
          class="dash-period-icon pointer-events-none absolute right-2.75 h-3.5 w-3.5 text-text-faint"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          aria-hidden="true"
        >
          <path d="M5 8l5 5 5-5"></path>
        </svg>
      </span>
    </label>
  </div>
</template>
