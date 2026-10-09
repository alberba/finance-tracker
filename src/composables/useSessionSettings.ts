import { onMounted, shallowRef } from 'vue'
import { authentication, requireAuthenticationResult } from '../lib/client/authentication'
import { useAuthenticationAction } from './useAuthenticationAction'
export function useSessionSettings() {
  const sessions = shallowRef<
    { id: string; token: string; userAgent?: string | null; updatedAt: Date; expiresAt: Date }[]
  >([])
  const currentId = shallowRef('')
  const { busy, error, run } = useAuthenticationAction()
  async function load() {
    const current = await authentication.getSession()
    currentId.value = current.data?.session.id ?? ''
    const result = await authentication.listSessions()
    await requireAuthenticationResult(result)
    sessions.value = result.data ?? []
  }
  function revoke(token: string) {
    return run(async () => {
      await requireAuthenticationResult(await authentication.revokeSession({ token }))
      await load()
    })
  }
  function revokeOthers() {
    return run(async () => {
      await requireAuthenticationResult(await authentication.revokeOtherSessions())
      await load()
    })
  }
  onMounted(() => {
    void run(load)
  })
  return { sessions, currentId, busy, error, revoke, revokeOthers }
}
