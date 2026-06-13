<script setup lang="ts">
import type { SectionId } from '../scripts/types'
import DashboardSection from './sections/DashboardSection.vue'

const props = withDefaults(
  defineProps<{
    activeSection?: SectionId
  }>(),
  { activeSection: 'dashboard' },
)
</script>

<template>
  <div class="contents" data-finance-workspace>
    <DashboardSection :is-active="props.activeSection === 'dashboard'" />
  </div>
</template>
