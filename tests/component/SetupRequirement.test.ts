import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import SetupRequirement from '../../src/components/onboarding/SetupRequirement.vue'

const navigation = vi.hoisted(() => ({ createAccount: vi.fn(), editCategories: vi.fn() }))
vi.mock('../../src/composables/useSetupNavigation', () => ({
  useSetupNavigation: () => navigation,
}))

describe('SetupRequirement', () => {
  it('explains the requirement and opens account creation directly', async () => {
    const wrapper = mount(SetupRequirement, { props: { message: 'Necesitas una cuenta.' } })
    expect(wrapper.get('[role="status"]').text()).toContain('Necesitas una cuenta.')
    expect(wrapper.get('button').text()).toBe('Crear cuenta')
    await wrapper.get('button').trigger('click')
    expect(navigation.createAccount).toHaveBeenCalledOnce()
  })

  it('routes the category action to category settings', async () => {
    const wrapper = mount(SetupRequirement, {
      props: { message: 'Faltan categorías.', action: 'Editar categorías', target: 'categories' },
    })
    await wrapper.get('button').trigger('click')
    expect(navigation.editCategories).toHaveBeenCalledOnce()
  })
})
