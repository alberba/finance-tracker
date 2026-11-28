const REPORT_DIALOG_OPEN_EVENT = 'finance:open-report-dialog'

export function requestReportDialogOpen(): void {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new Event(REPORT_DIALOG_OPEN_EVENT))
}

export function subscribeToReportDialogOpen(callback: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => undefined
  }

  window.addEventListener(REPORT_DIALOG_OPEN_EVENT, callback)
  return () => window.removeEventListener(REPORT_DIALOG_OPEN_EVENT, callback)
}
