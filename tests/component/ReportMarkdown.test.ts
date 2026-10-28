import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ReportMarkdown from '../../src/components/reports/ReportMarkdown.vue'

describe('ReportMarkdown', () => {
  it('renderiza el HTML crudo como texto y nunca lo ejecuta', () => {
    const wrapper = mount(ReportMarkdown, {
      props: { source: '<script>alert(1)</script>' },
    })
    expect(wrapper.find('script').exists()).toBe(false)
    expect(wrapper.text()).toContain('<script>alert(1)</script>')
  })

  it('abre enlaces externos fuera de la app y descarta javascript:', () => {
    const wrapper = mount(ReportMarkdown, {
      props: { source: '[documentación](https://example.com) [malo](javascript:alert(1))' },
    })
    const link = wrapper.get('a[href="https://example.com"]')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toBe('noopener noreferrer')
    expect(wrapper.find('a[href^="javascript:"]').exists()).toBe(false)
  })

  it('incrusta solo imágenes de hosts de GitHub', () => {
    const wrapper = mount(ReportMarkdown, {
      props: {
        source:
          '![captura](https://github.com/user-attachments/assets/1) ![otra](https://example.com/x.png)',
      },
    })
    expect(wrapper.findAll('img')).toHaveLength(1)
    expect(wrapper.get('img').attributes('src')).toBe(
      'https://github.com/user-attachments/assets/1',
    )
    expect(wrapper.get('img').attributes('loading')).toBe('lazy')
    expect(wrapper.text()).toContain('otra')
  })

  it('renderiza listas, citas y código sin romper la jerarquía', () => {
    const wrapper = mount(ReportMarkdown, {
      props: { source: '# Título\n\n- uno\n- dos\n\n> cita\n\n```ts\nconst a = 1\n```' },
    })
    expect(wrapper.findAll('h1, h2, h3')).toHaveLength(0)
    expect(wrapper.text()).toContain('Título')
    expect(wrapper.findAll('li')).toHaveLength(2)
    expect(wrapper.find('blockquote').text()).toContain('cita')
    expect(wrapper.get('pre code').text()).toBe('const a = 1')
  })
})
