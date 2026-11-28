/**
 * Sincroniza los avisos de «Mis reportes» (#340) con el markup estático de
 * Astro: contador en la hoja «Más» y punto sobre su botón.
 */

import { watch } from 'vue'

import { unseenBadge } from '../../domain/reports/unseen-badge'
import { pinia } from '../../stores/pinia'
import { useReportsStore } from '../../stores/reports'

export function initReportsBadge(): void {
  const store = useReportsStore(pinia)

  watch(
    () => store.unseenCount,
    (count) => {
      const badge = unseenBadge(count)
      document.querySelectorAll<HTMLElement>('[data-reports-badge-dot]').forEach((dot) => {
        dot.hidden = count === 0
      })
      // The «Más» sheet: a pill holding the visible count and its spoken
      // sentence, and a description of the «Más» button for the news.
      document.querySelectorAll<HTMLElement>('[data-reports-count-badge]').forEach((pill) => {
        pill.hidden = badge === null
      })
      document.querySelectorAll<HTMLElement>('[data-reports-count]').forEach((text) => {
        text.textContent = badge?.text ?? ''
      })
      document.querySelectorAll<HTMLElement>('[data-reports-count-spoken]').forEach((spoken) => {
        spoken.textContent = badge?.spoken ?? ''
      })
      const more = document.querySelector<HTMLElement>('[data-mobile-more-trigger]')
      if (more) more.dataset.reportsUpdates = count > 0 ? 'true' : 'false'
    },
    { immediate: true },
  )
}
