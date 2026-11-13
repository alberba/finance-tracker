import type { VueWrapper } from '@vue/test-utils'
import { defineComponent, h, ref, type Component } from 'vue'

/**
 * Los paneles se abren desde su padre con `panel.value?.openNew()` (API expuesta
 * con `defineExpose`). Este host hace lo mismo que los padres de producción: un
 * botón llama a `openNew()` por la referencia de plantilla, así el test abre el
 * panel pulsando en el DOM en vez de leer `wrapper.vm`.
 */
export function panelWithOpener(panel: Component): Component {
  return defineComponent({
    inheritAttrs: false,
    setup(_, { attrs }) {
      const panelRef = ref<{ openNew: () => void } | null>(null)
      return () =>
        h('div', [
          h(
            'button',
            { type: 'button', 'data-open-panel': '', onClick: () => panelRef.value?.openNew() },
            'Abrir panel',
          ),
          h(panel, { ...attrs, ref: panelRef }),
        ])
    },
  })
}

export async function openPanel(wrapper: VueWrapper): Promise<void> {
  await wrapper.get('[data-open-panel]').trigger('click')
}
