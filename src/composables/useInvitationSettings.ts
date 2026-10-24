import { onMounted, shallowRef } from 'vue'
import { authenticationRequest } from '../lib/client/authentication'
import { runClientHttp } from '../lib/client/runtime'
import { useAuthenticationAction } from './useAuthenticationAction'
export function useInvitationSettings() {
  interface Registration {
    publicRegistration: boolean
    invitations: {
      id: string
      uses: number
      maxUses: number
      expiresAt: string
      revoked: boolean
    }[]
  }
  const registration = shallowRef<Registration | null>(null)
  const maxUses = shallowRef(5)
  const days = shallowRef(7)
  const link = shallowRef('')
  const administratorId = shallowRef('')
  const { busy, error, run } = useAuthenticationAction()
  async function load() {
    registration.value = await runClientHttp(
      authenticationRequest<Registration>('/api/admin/registration'),
    )
  }
  function create() {
    return run(async () => {
      const invitation = await runClientHttp(
        authenticationRequest<{ url: string }>('/api/admin/registration', {
          action: 'create',
          maxUses: maxUses.value,
          days: days.value,
        }),
      )
      link.value = invitation.url
      await load()
    })
  }
  function update(body: unknown) {
    return run(async () => {
      await runClientHttp(authenticationRequest('/api/admin/registration', body))
      await load()
    })
  }
  onMounted(() => {
    void run(load)
  })
  return { registration, maxUses, days, link, administratorId, busy, error, create, update }
}
