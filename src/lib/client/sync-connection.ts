import { Effect, Exit } from 'effect'

interface SyncConnectionCallbacks {
  changed: () => void
  online: () => void
  offline: () => void
}

/** Reconciles foreground devices even when a notification or connection is lost. */
export function watchSyncConnection(callbacks: SyncConnectionCallbacks): () => void {
  if (typeof window === 'undefined') return () => {}
  const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden'
  const refresh = () => {
    if (visible()) callbacks.changed()
  }
  window.addEventListener('online', callbacks.online)
  window.addEventListener('offline', callbacks.offline)
  window.addEventListener('focus', refresh)
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', refresh)
  const timer = setInterval(refresh, 5000)
  timer.unref?.()
  return () => {
    clearInterval(timer)
    window.removeEventListener('online', callbacks.online)
    window.removeEventListener('offline', callbacks.offline)
    window.removeEventListener('focus', refresh)
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', refresh)
  }
}

/** How long ago the server last confirmed this device is up to date. */
export function describeCheckAge(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return `hace ${seconds} s`
  const minutes = Math.floor(seconds / 60)
  return minutes < 60 ? `hace ${minutes} min` : `hace ${Math.floor(minutes / 60)} h`
}

const localLocks = new Map<string, Promise<unknown>>()

/**
 * Runs an effect while no other tab (or client in this page) touches the same
 * user's outbox and read model: concurrent flushes would resend a command and
 * a bootstrap taken mid-flush would render without it.
 *
 * The browser's Web Locks API only speaks `Promise`, so this adapter is the
 * one bridge between both worlds: it captures the Effect context, hands the
 * whole program to the lock holder, and replays the `Exit` back into the
 * typed channel — no error is lost or widened.
 */
export const withSyncLock = <A, E, R>(
  userId: string,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.gen(function* () {
    const context = yield* Effect.context<R>()
    const name = `finance-tracker-sync:${userId}`
    const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
    const program = () =>
      Effect.runPromiseExit(Effect.provideContext(effect, context)) as Promise<Exit.Exit<A, E>>

    let exit: Exit.Exit<A, E>
    if (locks) {
      exit = (yield* Effect.promise(() => locks.request(name, program))) as Exit.Exit<A, E>
    } else {
      const previous = localLocks.get(name) ?? Promise.resolve()
      const run = previous.then(program, program)
      const settled = run.catch(() => {})
      localLocks.set(name, settled)
      void settled.then(() => {
        if (localLocks.get(name) === settled) localLocks.delete(name)
      })
      exit = yield* Effect.promise(() => run)
    }

    return yield* Exit.match(exit, {
      onSuccess: (value) => Effect.succeed(value),
      onFailure: (cause) => Effect.failCause(cause),
    })
  })
