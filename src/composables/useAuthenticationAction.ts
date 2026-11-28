import { shallowRef } from 'vue'
export function useAuthenticationAction() {
  const busy = shallowRef(false)
  const error = shallowRef('')
  const message = shallowRef('')
  const reference = shallowRef('')
  async function run(action: () => Promise<void>) {
    if (busy.value) return
    busy.value = true
    error.value = ''
    reference.value = ''
    message.value = ''
    try {
      await action()
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Inténtalo de nuevo.'
      if (
        cause instanceof Error &&
        typeof cause.cause === 'string' &&
        /^[a-f0-9]{32}$/.test(cause.cause)
      ) {
        reference.value = cause.cause
      }
    } finally {
      busy.value = false
    }
  }
  return { busy, error, message, reference, run }
}
