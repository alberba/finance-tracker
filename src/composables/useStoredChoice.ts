import { ref, watch, type Ref } from 'vue'

/**
 * A choice remembered on this device. Storage may be blocked (private mode,
 * cleared site data): the choice then starts at its fallback and still applies.
 */
export function useStoredChoice<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): Ref<T> {
  let initial = fallback
  try {
    const stored = localStorage.getItem(key)
    if (stored !== null && (allowed as readonly string[]).includes(stored)) initial = stored as T
  } catch {
    // Not readable: keep the fallback.
  }
  const choice = ref(initial) as Ref<T>
  watch(choice, (value) => {
    try {
      localStorage.setItem(key, value)
    } catch {
      // Not remembered; the choice still applies.
    }
  })
  return choice
}
