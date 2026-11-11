import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

/**
 * The id of the last element of `ids` whose top has gone above a line a bit
 * under the top of the window: the apartado being read. Empty until the page
 * has laid out; the first id is the fallback once it has.
 */
export function useScrollSpy(ids: Readonly<Ref<readonly string[]>>): Ref<string> {
  const current = ref('')
  const LINE = 120

  function update(): void {
    let found = ids.value[0] ?? ''
    for (const id of ids.value) {
      const element = document.getElementById(id)
      if (element && element.getBoundingClientRect().top <= LINE) found = id
    }
    // At the very bottom the last apartado wins even if it is too short to reach the line.
    const atBottom =
      window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2
    if (atBottom && ids.value.length) found = ids.value[ids.value.length - 1]
    current.value = found
  }

  onMounted(() => {
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('scroll', update)
    window.removeEventListener('resize', update)
  })

  return current
}
