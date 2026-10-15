import { onMounted, onUnmounted, ref } from 'vue'

/** Wait for the shell's financial bootstrap, including cached offline data. */
export function useFinanceReady() {
  const ready = ref(false)
  let observer: MutationObserver | undefined
  onMounted(() => {
    const root = document.documentElement
    const update = () => {
      ready.value = root.dataset.financeReady === 'true'
      if (ready.value) observer?.disconnect()
    }
    observer = new MutationObserver(update)
    observer.observe(root, { attributes: true, attributeFilter: ['data-finance-ready'] })
    update()
  })
  onUnmounted(() => observer?.disconnect())
  return ready
}
