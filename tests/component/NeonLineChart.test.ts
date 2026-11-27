import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import NeonLineChart from '../../src/neon/ui/NeonLineChart.vue'
import { buildLineChart, type LabelledLineChart } from '../../src/neon/ui/line-chart'

const wrappers: Array<ReturnType<typeof mount>> = []
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()))

const geometry = buildLineChart([100, 150, 200])
const chart: LabelledLineChart = {
  ...geometry,
  labels: ['ene', 'feb', 'mar'],
  tickLabels: ['100 €', '150 €', '200 €'],
  readings: [
    { name: 'Enero', value: '100,00 €' },
    { name: 'Febrero', value: '150,00 €' },
    { name: 'Marzo', value: '200,00 €' },
  ],
  label: 'Evolución del patrimonio: de 100,00 € a 200,00 €',
}

function setup() {
  const wrapper = mount(NeonLineChart, { props: { chart }, attachTo: document.body })
  wrappers.push(wrapper)
  const plot = wrapper.get('[role="slider"]')
  // The line spans 400px; the gutter for the gridline values is outside of it.
  wrapper.get('svg').element.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 400, height: 180, right: 400, bottom: 180 }) as DOMRect
  return { wrapper, plot }
}

describe('NeonLineChart exploring', () => {
  it('reads the point nearest to the pointer and clears it on leaving', async () => {
    const { wrapper, plot } = setup()
    await plot.trigger('pointermove', { clientX: 190 })
    expect(wrapper.get('[data-chart-readout]').text()).toBe('Febrero')
    expect(wrapper.emitted('update:active')?.at(-1)).toEqual([1])

    await plot.trigger('pointermove', { clientX: 5 })
    expect(wrapper.get('[data-chart-readout]').text()).toContain('Enero')

    await plot.trigger('pointerleave')
    expect(wrapper.find('[data-chart-readout]').exists()).toBe(false)
    expect(wrapper.emitted('update:active')?.at(-1)).toEqual([null])
  })

  it('stays on the last point when the pointer is over the gridline values', async () => {
    const { wrapper, plot } = setup()
    await plot.trigger('pointermove', { clientX: 450 })
    expect(wrapper.get('[data-chart-readout]').text()).toContain('Marzo')
  })

  it('reads with the arrow keys and announces the value as the slider text', async () => {
    const { wrapper, plot } = setup()
    expect(plot.attributes('aria-valuenow')).toBe('2')
    expect(plot.attributes('aria-valuetext')).toBe('Marzo: 200,00 €')
    await plot.trigger('keydown', { key: 'ArrowLeft' })
    expect(plot.attributes('aria-valuenow')).toBe('1')
    expect(plot.attributes('aria-valuetext')).toBe('Febrero: 150,00 €')
    await plot.trigger('keydown', { key: 'Home' })
    expect(plot.attributes('aria-valuetext')).toBe('Enero: 100,00 €')
    await plot.trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[data-chart-readout]').exists()).toBe(false)
    expect(plot.attributes('aria-valuenow')).toBe('2')
  })
})
