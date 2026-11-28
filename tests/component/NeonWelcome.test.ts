import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'

const accountCompleted = ref(false)
const movementCompleted = ref(false)
const welcome = {
  ready: ref(true),
  open: ref(true),
  accountCompleted,
  movementCompleted,
  complete: computed(() => accountCompleted.value && movementCompleted.value),
  canResume: ref(false),
  dismiss: vi.fn(),
  resume: vi.fn(),
}
const navigation = { createAccount: vi.fn(), createMovement: vi.fn(), navigateTo: vi.fn() }

vi.mock('../../src/composables/useWelcome', () => ({ useWelcome: () => welcome }))
vi.mock('../../src/composables/useSetupNavigation', () => ({
  useSetupNavigation: () => navigation,
}))

const { default: NeonWelcome } = await import('../../src/neon/onboarding/NeonWelcome.vue')

function button(wrapper: ReturnType<typeof mount>, name: string) {
  return wrapper.findAll('button').find((item) => item.text() === name)!
}

/** The panel finished closing: the step it was closed for goes on. */
function finishClosing(wrapper: ReturnType<typeof mount>) {
  wrapper.findComponent({ name: 'NeonDetailPanel' }).vm.$emit('closed')
}

describe('NeonWelcome', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    welcome.open.value = true
    welcome.accountCompleted.value = false
    welcome.movementCompleted.value = false
    welcome.canResume.value = false
    vi.clearAllMocks()
  })

  it('explains why the first movement needs an account', () => {
    const wrapper = mount(NeonWelcome)

    expect(button(wrapper, 'Registrar movimiento').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Crea una cuenta para poder registrar movimientos.')
  })

  it('closes the welcome and opens the account form', async () => {
    const wrapper = mount(NeonWelcome)

    await button(wrapper, 'Crear cuenta').trigger('click')

    expect(welcome.dismiss).toHaveBeenCalledOnce()
    expect(navigation.createAccount).not.toHaveBeenCalled()
    finishClosing(wrapper)
    expect(navigation.createAccount).toHaveBeenCalledOnce()
  })

  it('offers the next step once the account exists', async () => {
    welcome.accountCompleted.value = true
    const wrapper = mount(NeonWelcome)

    expect(wrapper.text()).toContain('✓ Cuenta creada')
    await button(wrapper, 'Registrar movimiento').trigger('click')
    finishClosing(wrapper)
    expect(navigation.createMovement).toHaveBeenCalledOnce()
  })

  it('acknowledges both steps without asking for new data', async () => {
    welcome.accountCompleted.value = true
    welcome.movementCompleted.value = true
    const wrapper = mount(NeonWelcome)

    expect(wrapper.text()).toContain('✓ Movimiento registrado')
    expect(wrapper.findAll('button').map((item) => item.text())).not.toContain('Crear cuenta')
    await button(wrapper, 'Entendido').trigger('click')
    expect(welcome.dismiss).toHaveBeenCalledOnce()
  })

  it('lets the user skip and pick the welcome up again', async () => {
    const wrapper = mount(NeonWelcome)
    await button(wrapper, 'Ahora no').trigger('click')
    expect(welcome.dismiss).toHaveBeenCalledOnce()

    welcome.open.value = false
    welcome.canResume.value = true
    await wrapper.vm.$nextTick()
    await button(wrapper, 'Retomar bienvenida').trigger('click')
    expect(welcome.resume).toHaveBeenCalledOnce()
  })

  it('sends the integrations step to the connections of Configuración', async () => {
    const wrapper = mount(NeonWelcome)

    await button(wrapper, 'Integraciones').trigger('click')
    finishClosing(wrapper)

    expect(navigation.navigateTo).toHaveBeenCalledWith('settings')
  })
})
