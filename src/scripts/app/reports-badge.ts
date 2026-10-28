/**
 * Sincroniza los avisos de «Mis reportes» (#340) con el markup estático de
 * Astro: contador en la hoja «Más» y punto sobre su botón.
 */

import { watch } from 'vue'

import { pinia } from '../../stores/pinia'
import { useReportsStore } from '../../stores/reports'

export function initReportsBadge(): void {
  const store = useReportsStore(pinia)

  watch(
    () => store.unseenCount,
    (count) => {
      document.querySelectorAll<HTMLElement>('[data-reports-badge]').forEach((badge) => {
        badge.textContent = count > 9 ? '9+' : String(count)
        badge.hidden = count === 0
      })
      document.querySelectorAll<HTMLElement>('[data-reports-badge-dot]').forEach((dot) => {
        dot.hidden = count === 0
      })
      const more = document.querySelector<HTMLElement>('[data-mobile-more-trigger]')
      if (more) more.dataset.reportsUpdates = count > 0 ? 'true' : 'false'
    },
    { immediate: true },
  )
}
