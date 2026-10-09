import { showToast } from '../scripts/toast'

/** Toast for Vue islands: the shell's single `#toast` (see scripts/toast.ts). */
export function useToast() {
  return { showToast }
}
