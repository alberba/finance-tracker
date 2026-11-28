import { onBeforeUnmount, onMounted, shallowRef, type ShallowRef } from 'vue'

/** How far the page is scrolled (px), kept in step while the caller is mounted. */
export function useWindowScroll(): ShallowRef<number> {
  const y = shallowRef(typeof window === 'undefined' ? 0 : window.scrollY)
  const onScroll = () => {
    y.value = window.scrollY
  }
  onMounted(() => {
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
  })
  onBeforeUnmount(() => window.removeEventListener('scroll', onScroll))
  return y
}
