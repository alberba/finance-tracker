import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import NeonAccessForm from '../../src/neon/auth/NeonAccessForm.vue'

const client = vi.hoisted(() => ({
  passwordSignIn: vi.fn(),
  sendCode: vi.fn(),
  openFinanzas: vi.fn(),
}))

vi.mock('../../src/lib/client/authentication', () => ({
  authentication: {
    signIn: { email: client.passwordSignIn },
    emailOtp: { sendVerificationOtp: client.sendCode },
  },
  openFinanzas: client.openFinanzas,
  markAuthenticationReady: vi.fn(),
  requireAuthenticationResult: async (result: { error?: { message: string } }) => {
    if (result.error) throw new Error(result.error.message)
  },
}))

const baseProps = { googleEnabled: false, githubEnabled: false }

function field(wrapper: ReturnType<typeof mount>, label: string) {
  const id = wrapper
    .findAll('label')
    .find((node) => node.text() === label)
    ?.attributes('for')
  return id ? wrapper.find(`#${id}`) : undefined
}

function button(wrapper: ReturnType<typeof mount>, name: string) {
  const found = wrapper.findAll('button').find((node) => node.text() === name)
  if (!found) throw new Error(`Sin botón «${name}»`)
  return found
}

beforeEach(() => {
  vi.resetAllMocks()
  client.sendCode.mockResolvedValue({})
})

describe('NeonAccessForm', () => {
  it('abre con correo y contraseña y cambia al código por correo', async () => {
    const wrapper = mount(NeonAccessForm, { props: baseProps })

    expect(wrapper.get('h1').text()).toBe('Accede a Finanzas')
    expect(field(wrapper, 'Contraseña')?.exists()).toBe(true)
    expect(field(wrapper, 'Código de seis cifras')).toBeUndefined()

    await button(wrapper, 'Código por correo').trigger('click')

    expect(field(wrapper, 'Contraseña')).toBeUndefined()
    expect(field(wrapper, 'Código de seis cifras')?.attributes('disabled')).toBeDefined()
    expect(button(wrapper, 'Código por correo').attributes('aria-pressed')).toBe('true')
  })

  it('muestra el error del servidor cuando las credenciales no valen', async () => {
    client.passwordSignIn.mockResolvedValue({
      error: { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' },
    })
    const wrapper = mount(NeonAccessForm, { props: baseProps })
    await field(wrapper, 'Correo electrónico')!.setValue('ana@example.test')
    await field(wrapper, 'Contraseña')!.setValue('contraseña-mala')

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toBe('El correo o la contraseña no son correctos.')
    expect(client.openFinanzas).not.toHaveBeenCalled()
  })

  it('recupera el acceso con un código y una contraseña nueva', async () => {
    const wrapper = mount(NeonAccessForm, { props: baseProps })

    await button(wrapper, 'Recuperar acceso').trigger('click')

    expect(wrapper.get('h1').text()).toBe('Recupera tu acceso')
    expect(field(wrapper, 'Nueva contraseña')?.attributes('disabled')).toBeDefined()
    await field(wrapper, 'Correo electrónico')!.setValue('ana@example.test')
    await button(wrapper, 'Enviar código').trigger('click')
    await flushPromises()

    expect(client.sendCode).toHaveBeenCalledWith({
      email: 'ana@example.test',
      type: 'forget-password',
    })
    expect(wrapper.get('[role="status"]').text()).toContain('Revisa tu correo')
    expect(field(wrapper, 'Nueva contraseña')?.attributes('disabled')).toBeUndefined()
  })

  it('pide verificar el correo con una nota y la vía del código', () => {
    const wrapper = mount(NeonAccessForm, {
      props: { ...baseProps, verifyEmail: 'pendiente@example.test' },
    })

    expect(wrapper.get('h1').text()).toBe('Revisa tu correo')
    expect(wrapper.get('[role="note"]').text()).toContain('pendiente@example.test')
    expect(wrapper.text()).toContain('Prefiero usar un código')
  })
})
