<script setup lang="ts">
import { computed } from 'vue'

import type { SectionId } from '../scripts/types'
import { useUiStore } from '../stores/ui'
import BudgetSection from './sections/BudgetSection.vue'
import DashboardSection from './sections/DashboardSection.vue'

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
  </div>
</template>
