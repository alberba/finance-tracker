import { Effect } from 'effect'

import { authentication, requireAuthenticationResult } from '../../lib/client/authentication'
import { wipeAllClientData, wipeLegacyClientData } from '../../lib/client/wipe'
import { pinia } from '../../stores/pinia'
import { useSyncStore } from '../../stores/sync'

/** What the session lookup told about who is signed in; null when it failed. */
export interface LogoutSession {
  user?: { id?: string | null } | null
}

/**
 * Signs the user out and leaves for the login page. Pending changes that
 * cannot be synced first are only dropped if the user agrees; resolves to
 * false then (nothing was done), true once the page is on its way out.
 * Shared by the sidebar menu and the account block of Configuración.
 */
export async function logOut(session: LogoutSession | null): Promise<boolean> {
  const syncStore = useSyncStore(pinia)
  if (syncStore.userId) {
    try {
      await syncStore.prepareLogout()
    } catch {
      const discardPending = window.confirm(
        'Hay cambios pendientes que no se pudieron sincronizar. ¿Descartarlos definitivamente y cerrar sesión?',
      )
      if (!discardPending) return false
    }
  }
  await requireAuthenticationResult(await authentication.signOut())
  if (syncStore.userId) await syncStore.logout({ discardPending: true })
  else if (session?.user?.id) await Effect.runPromise(wipeAllClientData(session.user.id))
  else wipeLegacyClientData()
  window.location.href = '/login'
  return true
}
