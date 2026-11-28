import { shallowRef } from 'vue'

/**
 * A movement another view asked to open in Movimientos (a row of the home's
 * «Movimientos»): set before navigating, taken once by the registry when it is
 * on screen, which opens its detail panel. Module-level so the dashboard and
 * the registry share it whatever Vue app each is mounted in.
 */
const requested = shallowRef<string | null>(null)

export function useMovementDetailRequest() {
  return {
    requested,
    request(id: string): void {
      requested.value = id
    },
    /** Hands over the requested id once, and clears it. */
    take(): string | null {
      const id = requested.value
      requested.value = null
      return id
    },
  }
}
