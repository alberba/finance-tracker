import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

/** Whether a media query matches, kept in step as the viewport changes. */
export function useMediaQuery(query: string): Ref<boolean> {
  const list = typeof window === 'undefined' ? null : window.matchMedia(query)
  const matches = ref(list?.matches ?? true)
  const onChange = (event: MediaQueryListEvent) => {
    matches.value = event.matches
  }
  onMounted(() => list?.addEventListener('change', onChange))
  onBeforeUnmount(() => list?.removeEventListener('change', onChange))
  return matches
}
