import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import WelcomeGuide from '../../src/components/onboarding/WelcomeGuide.vue'

function guide(accountCompleted = false, movementCompleted = false) {
  return mount(WelcomeGuide, {
    props: {
      open: false,
      accountCompleted,
      movementCompleted,
      complete: accountCompleted && movementCompleted,
    },
  })
}

describe('WelcomeGuide', () => {
  it('explains why the first movement needs an account', () => {
    const wrapper = guide()
    const button = wrapper.findAll('button').find((item) => item.text() === 'Registrar movimiento')!
    expect(button.attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Crea una cuenta para poder registrar movimientos.')
  })

  it('offers the next action after recognizing an existing account', async () => {
    const wrapper = guide(true)
    const button = wrapper.findAll('button').find((item) => item.text() === 'Registrar movimiento')!
    await button.trigger('click')
    expect(wrapper.emitted('movement')).toHaveLength(1)
    expect(wrapper.text()).toContain('✓ Cuenta creada')
  })

  it('acknowledges both existing milestones without requesting new data', async () => {
    const wrapper = guide(true, true)
    expect(wrapper.text()).toContain('✓ Movimiento registrado')
    const button = wrapper.findAll('button').find((item) => item.text() === 'Entendido')!
    await button.trigger('click')
    expect(wrapper.emitted('dismiss')).toHaveLength(1)
    expect(wrapper.findAll('button').map((item) => item.text())).not.toContain('Crear cuenta')
  })

  it('lets the user skip incomplete setup', async () => {
    const wrapper = guide()
    await wrapper
      .findAll('button')
      .find((item) => item.text() === 'Ahora no')!
      .trigger('click')
    expect(wrapper.emitted('dismiss')).toHaveLength(1)
  })
})
