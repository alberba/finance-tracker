/** A deletion waiting for the user to confirm it in the dialog of the page. */
export interface PendingDeletion {
  title: string
  confirmLabel: string
  /** What is lost, in a sentence. */
  message: string
  run: () => void
}

/** The confirmation that removes a recurring rule. */
export function ruleDeletion(
  row: { name: string; amount: string },
  run: () => void,
): PendingDeletion {
  return {
    title: '¿Eliminar esta regla?',
    confirmLabel: 'Eliminar regla',
    message: `${row.name}, ${row.amount}. Deja de generar pendientes; los movimientos ya registrados se mantienen. Si solo quieres detenerla, páusala.`,
    run,
  }
}
