import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ProgressBar from '../../src/components/dashboard/ProgressBar.vue'

describe('ProgressBar', () => {
  it('publica el progreso por ARIA y conserva la precisión visual', () => {
    const wrapper = mount(ProgressBar, { props: { value: 42.345 } })
    const progressbar = wrapper.get('[role="progressbar"]')

    expect(progressbar.attributes()).toMatchObject({
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-valuenow': '42',
    })
    expect(progressbar.get('.progress-fill').attributes('style')).toContain('width: 42.34%')
  })

  it('actualiza el contrato cuando cambia el valor', async () => {
    const wrapper = mount(ProgressBar, { props: { value: 25 } })

    await wrapper.setProps({ value: 75.5 })

    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('76')
    expect(wrapper.get('.progress-fill').attributes('style')).toContain('width: 75.50%')
  })
})
