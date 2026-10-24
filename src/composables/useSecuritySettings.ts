import { onMounted, shallowRef } from 'vue'
import { runClientHttp } from '../lib/client/runtime'
import { isReadOnlyDemoActive } from '../lib/client/demo-source'
export function useSecuritySettings() {
  const available = shallowRef(false)
  const admin = shallowRef(false)
  onMounted(async () => {
    if (isReadOnlyDemoActive()) return
    try {
      const { authenticationRequest } = await import('../lib/client/authentication-request')
      const session = await runClientHttp(
        authenticationRequest<{
          user: { isAdmin?: boolean }
          authentication?: string
        }>('/api/session'),
      )
      available.value = session.authentication === 'better-auth'
      admin.value = session.user.isAdmin === true
    } catch {
      available.value = false
    }
  })
  return { available, admin }
}
