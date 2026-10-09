import { onMounted, shallowRef } from 'vue'
import { authentication, requireAuthenticationResult } from '../lib/client/authentication'
import { useAuthenticationAction } from './useAuthenticationAction'
export function useAccessMethodsSettings() {
  const accounts = shallowRef<{ id: string; providerId: string }[]>([])
  const passkeys = shallowRef<{ id: string; name?: string }[]>([])
  const { busy, error, run } = useAuthenticationAction()
  async function load() {
    const result = await authentication.listAccounts()
    await requireAuthenticationResult(result)
    accounts.value = result.data ?? []
    const keys = await authentication.passkey.listUserPasskeys()
    await requireAuthenticationResult(keys)
    passkeys.value = keys.data ?? []
  }
  function link(provider: 'google' | 'github') {
    return run(async () => {
      await requireAuthenticationResult(
        await authentication.linkSocial({ provider, callbackURL: '/' }),
      )
    })
  }
  function addPasskey() {
    return run(async () => {
      await requireAuthenticationResult(
        await authentication.passkey.addPasskey({ name: 'Mi passkey' }),
      )
      await load()
    })
  }
  function removePasskey(id: string) {
    return run(async () => {
      await requireAuthenticationResult(await authentication.passkey.deletePasskey({ id }))
      await load()
    })
  }
  onMounted(() => {
    void run(load)
  })
  return { accounts, passkeys, busy, error, link, addPasskey, removePasskey }
}
