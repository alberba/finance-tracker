import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'

import { useReportsRoute } from '../../src/composables/useReportsRoute'

const Host = defineComponent({
  setup() {
    return { route: useReportsRoute() }
  },
  template: '<a href="/reportes?reporte=10" data-report-entry="10">Reporte 10</a>',
})

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('useReportsRoute', () => {
  it('devuelve el foco a la fila al volver con el botón atrás del navegador', async () => {
    window.history.replaceState(null, '', '/reportes?reporte=10')
    const wrapper = mount(Host, { attachTo: document.body })
    expect(wrapper.vm.route.selectedNumber.value).toBe(10)

    window.history.pushState(null, '', '/reportes')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await nextTick()
    await flushPromises()

    expect(wrapper.vm.route.selectedNumber.value).toBeNull()
    expect(document.activeElement).toBe(wrapper.get('[data-report-entry="10"]').element)
    wrapper.unmount()
  })
})
