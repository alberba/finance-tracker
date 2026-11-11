/** A deletion waiting for the user to confirm it in the dialog of the page. */
export interface PendingDeletion {
  title: string
  confirmLabel: string
  /** What is lost, in a sentence. */
  message: string
  run: () => void
}
