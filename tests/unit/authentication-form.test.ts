import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthenticationForm } from '../../src/composables/useAuthenticationForm'

const client = vi.hoisted(() => ({
  passwordSignIn: vi.fn(),
  sendCode: vi.fn(),
  verifyEmail: vi.fn(),
  openFinanzas: vi.fn(),
}))

vi.mock('../../src/lib/client/authentication', () => ({
  authentication: {
    signIn: { email: client.passwordSignIn },
    emailOtp: { sendVerificationOtp: client.sendCode, verifyEmail: client.verifyEmail },
  },
  authenticationRequest: vi.fn(),
  openFinanzas: client.openFinanzas,
  requireAuthenticationResult: async (result: { error?: { message: string } }) => {
    if (result.error) throw new Error(result.error.message)
  },
}))

beforeEach(() => {
  vi.resetAllMocks()
  client.sendCode.mockResolvedValue({})
})

describe('authentication form', () => {
  it('opens verification when password login reports an unverified account', async () => {
    client.passwordSignIn.mockResolvedValue({
      error: { code: 'EMAIL_NOT_VERIFIED', message: 'Email not verified' },
    })
    const form = useAuthenticationForm()
    form.email.value = 'pending@example.test'
    form.password.value = 'pending-password'

    await form.submit()

    expect(form.mode.value).toBe('verify')
    expect(client.openFinanzas).not.toHaveBeenCalled()
  })

  it('requires a new code when the recipient changes after sending', async () => {
    const form = useAuthenticationForm()
    form.changeMode('code')
    form.email.value = 'first@example.test'
    await form.sendCode()
    form.otp.value = '123456'

    form.email.value = 'second@example.test'

    expect(form.sent.value).toBe(false)
    expect(form.otp.value).toBe('')
    expect(form.message.value).toBe('')
  })

  it('does not verify an account before a code has been sent', async () => {
    const form = useAuthenticationForm({ verifyEmail: 'pending@example.test' })

    await form.submit()

    expect(client.verifyEmail).not.toHaveBeenCalled()
  })

  it('does not enable a code delivered to an address edited during the request', async () => {
    let finish = () => {}
    client.sendCode.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({})
        }),
    )
    const form = useAuthenticationForm()
    form.changeMode('code')
    form.email.value = 'first@example.test'
    const sending = form.sendCode()
    form.email.value = 'second@example.test'
    finish()
    await sending

    expect(form.sent.value).toBe(false)
  })
})
