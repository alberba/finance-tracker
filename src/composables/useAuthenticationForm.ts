import { useAuthenticationAction } from './useAuthenticationAction'
import { computed, shallowRef, watch } from 'vue'
import {
  authentication,
  authenticationRequest,
  openFinanzas,
  requireAuthenticationResult,
} from '../lib/client/authentication'
import { runClientHttp } from '../lib/client/runtime'
export type AccessMode = 'code' | 'password' | 'register' | 'verify' | 'recover'
export function useAuthenticationForm(
  options: { verifyEmail?: string; initialError?: string } = {},
) {
  const mode = shallowRef<AccessMode>(options.verifyEmail ? 'verify' : 'password')
  const email = shallowRef(options.verifyEmail ?? '')
  const password = shallowRef('')
  const otp = shallowRef('')
  const sent = shallowRef(false)
  const { busy, message, error, run } = useAuthenticationAction()
  error.value = options.initialError ?? ''
  const needsCode = computed(() => ['code', 'verify', 'recover'].includes(mode.value))
  const needsPassword = computed(() => ['password', 'register', 'recover'].includes(mode.value))
  watch(
    email,
    () => {
      sent.value = false
      otp.value = ''
      message.value = ''
      error.value = ''
    },
    { flush: 'sync' },
  )
  function changeMode(value: AccessMode) {
    mode.value = value
    sent.value = false
    otp.value = ''
    message.value = ''
    error.value = ''
  }
  function sendCode() {
    const recipient = email.value
    const requestedMode = mode.value
    return run(async () => {
      await requireAuthenticationResult(
        await authentication.emailOtp.sendVerificationOtp({
          email: recipient,
          type:
            mode.value === 'recover'
              ? 'forget-password'
              : mode.value === 'verify'
                ? 'email-verification'
                : 'sign-in',
        }),
      )
      if (email.value !== recipient || mode.value !== requestedMode) return
      sent.value = true
      message.value = 'Revisa tu correo. El código caduca en 10 minutos.'
    })
  }
  function submit() {
    if (needsCode.value && (!sent.value || !/^[0-9]{6}$/.test(otp.value))) return
    return run(async () => {
      if (mode.value === 'register') {
        await requireAuthenticationResult(
          await authentication.signUp.email({
            email: email.value,
            password: password.value,
            name: email.value.split('@')[0],
            callbackURL: '/',
          }),
        )
        changeMode('verify')
        password.value = ''
        message.value = 'Verifica tu correo con el enlace recibido o solicita un código.'
        return
      }
      if (mode.value === 'recover') {
        await runClientHttp(
          authenticationRequest('/api/recover-access', {
            email: email.value,
            otp: otp.value,
            password: password.value,
          }),
        )
      } else if (mode.value === 'verify') {
        await requireAuthenticationResult(
          await authentication.emailOtp.verifyEmail({ email: email.value, otp: otp.value }),
        )
        const session = await authentication.getSession()
        if (!session.data?.user.emailVerified) {
          changeMode('code')
          message.value = 'Correo verificado. Solicita un código para entrar.'
          return
        }
      } else if (mode.value === 'password') {
        const result = await authentication.signIn.email({
          email: email.value,
          password: password.value,
        })
        if (result.error?.code === 'EMAIL_NOT_VERIFIED') {
          changeMode('verify')
          password.value = ''
          return
        }
        await requireAuthenticationResult(result)
      } else {
        await requireAuthenticationResult(
          await authentication.signIn.emailOtp({ email: email.value, otp: otp.value }),
        )
      }
      openFinanzas()
    })
  }
  function social(provider: 'google' | 'github') {
    return run(async () => {
      await requireAuthenticationResult(
        await authentication.signIn.social({
          provider,
          callbackURL: '/',
          errorCallbackURL: '/login',
        }),
      )
    })
  }
  function passkey() {
    return run(async () => {
      await requireAuthenticationResult(await authentication.signIn.passkey())
      openFinanzas()
    })
  }
  return {
    mode,
    email,
    password,
    otp,
    sent,
    busy,
    message,
    error,
    needsCode,
    needsPassword,
    changeMode,
    sendCode,
    submit,
    social,
    passkey,
  }
}
