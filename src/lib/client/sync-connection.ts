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
 * Runs `task` while no other tab (or client in this page) touches the same
 * user's outbox and read model: concurrent flushes would resend a command and
 * a bootstrap taken mid-flush would render without it.
 */
export function withSyncLock<T>(userId: string, task: () => Promise<T>): Promise<T> {
  const name = `finance-tracker-sync:${userId}`
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
  if (locks) return locks.request(name, task) as Promise<T>
  const previous = localLocks.get(name) ?? Promise.resolve()
  const run = previous.then(task, task)
  const settled = run.catch(() => {})
  localLocks.set(name, settled)
  void settled.then(() => {
    if (localLocks.get(name) === settled) localLocks.delete(name)
  })
  return run
}
