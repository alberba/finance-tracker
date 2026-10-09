import { shallowRef } from 'vue'
export function useAuthenticationAction() {
  const busy = shallowRef(false)
  const error = shallowRef('')
  const message = shallowRef('')
  async function run(action: () => Promise<void>) {
    if (busy.value) return
    busy.value = true
    error.value = ''
    message.value = ''
    try {
      await action()
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Inténtalo de nuevo.'
    } finally {
      busy.value = false
    }
  }
  return { busy, error, message, run }
}
