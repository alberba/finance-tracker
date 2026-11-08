import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import NeonEmptyState from '../../src/neon/ui/NeonEmptyState.vue'

describe('NeonEmptyState', () => {
  it('muestra la nota y, si se da, la acción', () => {
    const wrapper = mount(NeonEmptyState, {
      slots: {
        default: 'Aún no hay movimientos.',
        action: '<button type="button">Apuntar</button>',
      },
    })

    expect(wrapper.text()).toContain('Aún no hay movimientos.')
    expect(wrapper.get('button').text()).toBe('Apuntar')
  })

  it('sin acción es solo la nota', () => {
    const wrapper = mount(NeonEmptyState, { slots: { default: 'Todo al día.' } })

    expect(wrapper.text()).toBe('Todo al día.')
    expect(wrapper.find('button').exists()).toBe(false)
  })
})
