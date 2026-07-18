import { onBeforeUnmount, onMounted } from 'vue'

import { subscribeToReportDialogOpen } from '../scripts/report-dialog'

export function useReportDialogTrigger(openDialog: () => void): void {
  let unsubscribe: (() => void) | undefined

  onMounted(() => {
    unsubscribe = subscribeToReportDialogOpen(openDialog)
  })

  onBeforeUnmount(() => {
    unsubscribe?.()
  })
}
