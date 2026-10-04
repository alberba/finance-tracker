import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import LedgerInput from '../../src/components/ui/LedgerInput.vue'

describe('LedgerInput', () => {
  it('es un campo de importe con nombre propio', () => {
    const wrapper = mount(LedgerInput, { props: { label: 'Presupuesto de Ocio en marzo' } })

    const input = wrapper.get('input')
    expect(input.attributes('aria-label')).toBe('Presupuesto de Ocio en marzo')
    expect(input.attributes('type')).toBe('text')
    expect(input.attributes('inputmode')).toBe('decimal')
    expect(input.attributes('autocomplete')).toBe('off')
  })

  it('pasa valor, atributos y escuchadores al input', async () => {
    const changes: string[] = []
    const wrapper = mount(LedgerInput, {
      props: { label: 'Snapshot de Cuenta' },
      attrs: {
        value: '120,5',
        name: 'snapshot-cuenta',
        'aria-invalid': 'true',
        'data-budget-cell': '',
        onChange: (event: Event) => changes.push((event.target as HTMLInputElement).value),
      },
    })

    const input = wrapper.get('input')
    expect((input.element as HTMLInputElement).value).toBe('120,5')
    expect(input.attributes('name')).toBe('snapshot-cuenta')
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(input.attributes()).toHaveProperty('data-budget-cell')

    await input.setValue('80')
    expect(changes).toEqual(['80'])
  })
})
