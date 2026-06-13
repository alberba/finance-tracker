<script setup lang="ts">
import { computed } from 'vue'

import type { SectionId } from '../scripts/types'
import { useUiStore } from '../stores/ui'
import BudgetSection from './sections/BudgetSection.vue'
import DashboardSection from './sections/DashboardSection.vue'
import DataSection from './sections/DataSection.vue'
import GoalsSection from './sections/GoalsSection.vue'
import ReportsSection from './reports/ReportsSection.vue'
import SettingsSection from './sections/SettingsSection.vue'

const props = withDefaults(
  defineProps<{
    activeSection?: SectionId
  }>(),
  { activeSection: 'dashboard' },
)

const uiStore = useUiStore()
uiStore.setActiveSection(props.activeSection)

const currentSection = computed(() => uiStore.ui.activeSection)
</script>

<template>
  <div class="contents" data-finance-workspace>
    <DashboardSection :is-active="currentSection === 'dashboard'" />
    <BudgetSection :is-active="currentSection === 'budget'" />
    <GoalsSection :is-active="currentSection === 'goals'" />
    <DataSection :is-active="currentSection === 'data'" />
    <ReportsSection :is-active="currentSection === 'reports'" />
    <SettingsSection :is-active="currentSection === 'settings'" />
  </div>
</template>
