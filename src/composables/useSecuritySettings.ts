import { onMounted, shallowRef } from 'vue'
import { authenticationRequest } from '../lib/client/authentication'
import { isReadOnlyDemoActive } from '../lib/client/demo-source'
export function useSecuritySettings() {
  const available = shallowRef(false)
  const admin = shallowRef(false)
  onMounted(async () => {
    if (isReadOnlyDemoActive()) return
    try {
      const session = await authenticationRequest<{
        user: { isAdmin?: boolean }
        authentication?: string
      }>('/api/session')
      available.value = session.authentication === 'better-auth'
      admin.value = session.user.isAdmin === true
    } catch {
      available.value = false
    }
  })
  return { available, admin }
}
