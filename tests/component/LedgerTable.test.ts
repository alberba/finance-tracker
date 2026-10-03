import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { h } from 'vue'

import LedgerTable, { type LedgerColumn } from '../../src/components/ui/LedgerTable.vue'

interface Row {
  id: string
  name: string
  value: number
}

const rows: Row[] = [
  { id: 'fondos', name: 'Fondos', value: 600 },
  { id: 'oro', name: 'Oro', value: 300 },
]

const columns: LedgerColumn<Row>[] = [
  { key: 'name', label: 'Activo', rowHeader: true, value: (row) => row.name },
  { key: 'weight', label: 'Peso', hideBelow: 'sm', value: () => '50 %' },
  { key: 'value', label: 'Valor', align: 'right', value: (row) => `${row.value} €` },
]

function mountTable(props: Record<string, unknown> = {}, slots: Record<string, unknown> = {}) {
  return mount(LedgerTable<Row>, {
    props: {
      columns,
      rows,
      rowKey: (row: Row) => row.id,
      label: 'Posiciones',
      rowAttrs: (row: Row) => ({ 'data-position': row.id }),
      ...props,
    },
    slots,
  })
}

describe('LedgerTable', () => {
  it('pinta cabecera, filas con su encabezado de fila y los valores', () => {
    const wrapper = mountTable()

    expect(wrapper.get('table').attributes('aria-label')).toBe('Posiciones')
    expect(wrapper.findAll('thead th').map((th) => th.text())).toEqual(['Activo', 'Peso', 'Valor'])
    const first = wrapper.get('[data-position="fondos"]')
    expect(first.get('th[scope="row"]').text()).toBe('Fondos')
    expect(first.findAll('td').map((td) => td.text())).toEqual(['50 %', '600 €'])
  })

  it('alinea las cifras a la derecha y oculta columnas secundarias en móvil', () => {
    const wrapper = mountTable()

    const [, weight, value] = wrapper.findAll('thead th')
    expect(weight.classes()).toEqual(expect.arrayContaining(['hidden', 'sm:table-cell']))
    expect(value.classes()).toContain('text-right')
  })

  it('un slot de celda sustituye al valor plano', () => {
    const wrapper = mountTable({}, { 'cell-value': ({ row }: { row: Row }) => h('strong', `${row.value}!`) })

    expect(wrapper.get('[data-position="oro"] strong').text()).toBe('300!')
  })

  it('muestra el estado vacío en lugar de la tabla', () => {
    const wrapper = mountTable({ rows: [], emptyText: 'Aún no hay posiciones.' })

    expect(wrapper.find('table').exists()).toBe(false)
    expect(wrapper.get('[data-ledger-empty]').text()).toBe('Aún no hay posiciones.')
  })

  it('añade la fila de total cuando hay slots de total', () => {
    const plain = mountTable()
    const withTotal = mountTable({}, { 'total-name': 'Total', 'total-value': '900 €' })

    expect(plain.find('tfoot').exists()).toBe(false)
    expect(withTotal.get('[data-ledger-total]').findAll('td').map((td) => td.text())).toEqual([
      'Total',
      '',
      '900 €',
    ])
  })

  describe('filas desplegables', () => {
    const expandLabel = (row: Row, open: boolean) => `${open ? 'Ocultar' : 'Ver'} detalle de ${row.name}`

    function mountExpandable(expanded: string | null = null) {
      return mountTable(
        { expandLabel, expanded, 'onUpdate:expanded': () => {} },
        { detail: ({ row }: { row: Row }) => h('p', { 'data-detail': row.id }, `Detalle ${row.name}`) },
      )
    }

    it('cada fila tiene un botón con nombre y estado de despliegue', () => {
      const wrapper = mountExpandable('oro')

      const fondos = wrapper.get('[data-position="fondos"] button')
      const oro = wrapper.get('[data-position="oro"] button')
      expect(fondos.attributes('aria-label')).toBe('Ver detalle de Fondos')
      expect(fondos.attributes('aria-expanded')).toBe('false')
      expect(oro.attributes('aria-label')).toBe('Ocultar detalle de Oro')
      expect(oro.attributes('aria-expanded')).toBe('true')
    })

    it('muestra el detalle solo de la fila desplegada', () => {
      const wrapper = mountExpandable('oro')

      expect(wrapper.findAll('[data-ledger-detail]')).toHaveLength(1)
      expect(wrapper.get('[data-detail]').text()).toBe('Detalle Oro')
    })

    it('se despliega pulsando en cualquier punto de la fila', async () => {
      const wrapper = mountExpandable()

      await wrapper.get('[data-position="fondos"] td').trigger('click')

      expect(wrapper.emitted('update:expanded')).toEqual([['fondos']])
    })

    it('se despliega y pliega con su botón, sin contar el clic dos veces', async () => {
      const open = mountExpandable()
      await open.get('[data-position="oro"] button').trigger('click')

      const close = mountExpandable('oro')
      await close.get('[data-position="oro"] button').trigger('click')

      expect(open.emitted('update:expanded')).toEqual([['oro']])
      expect(close.emitted('update:expanded')).toEqual([[null]])
    })

    it('el botón responde al teclado como cualquier botón', async () => {
      const wrapper = mountExpandable()
      const button = wrapper.get('[data-position="fondos"] button')

      expect(button.element.tagName).toBe('BUTTON')
      expect(button.attributes('type')).toBe('button')
    })

    it('sin expandLabel las filas no se despliegan', async () => {
      const wrapper = mountTable()

      await wrapper.get('[data-position="fondos"] td').trigger('click')

      expect(wrapper.find('[data-position="fondos"] button').exists()).toBe(false)
      expect(wrapper.emitted('update:expanded')).toBeUndefined()
    })
  })

  it('agrupa las filas bajo una fila de grupo con su título y su resumen', () => {
    const wrapper = mountTable({
      rows: undefined,
      groups: [
        { key: 'sep', title: 'Septiembre 2026', summary: '1 movimiento', rows: [rows[0]] },
        { key: 'ago', title: 'Agosto 2026', summary: '1 movimiento', rows: [rows[1]] },
      ],
    })

    const groups = wrapper.findAll('tbody')
    expect(groups).toHaveLength(2)
    const header = groups[0].get('[data-ledger-group]')
    expect(header.get('th').attributes('scope')).toBe('colgroup')
    expect(header.text()).toContain('Septiembre 2026')
    expect(header.text()).toContain('1 movimiento')
    expect(groups[1].find('[data-position="oro"]').exists()).toBe(true)
  })

  it('muestra el estado vacío cuando ningún grupo tiene filas', () => {
    const wrapper = mountTable({ rows: undefined, groups: [], emptyText: 'Sin movimientos.' })

    expect(wrapper.get('[data-ledger-empty]').text()).toBe('Sin movimientos.')
  })

  it('deja sustituir la cabecera de una columna y marcar filas', () => {
    const wrapper = mountTable(
      { rowClass: (row: Row) => (row.id === 'oro' ? 'is-picked' : '') },
      { 'head-name': () => h('span', { 'data-custom-head': '' }, 'Todo') },
    )

    expect(wrapper.get('thead [data-custom-head]').text()).toBe('Todo')
    expect(wrapper.get('[data-position="oro"]').classes()).toContain('is-picked')
  })
})
