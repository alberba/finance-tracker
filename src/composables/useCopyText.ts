import { shallowRef } from 'vue'

export function useCopyText() {
  const copyStatus = shallowRef('')

  async function copyText(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      copyStatus.value = 'Copiado.'
    } catch {
      copyStatus.value = 'Selecciona el texto para copiarlo.'
    }
  }

  return { copyText, copyStatus }
}
