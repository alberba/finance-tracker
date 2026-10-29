import type { VueWrapper } from '@vue/test-utils'

/**
 * Botón único con ese texto visible. Falla si no existe o si hay varios: un
 * `find` opcional dejaría pasar el test sin pulsar nada.
 */
export function buttonByText(wrapper: VueWrapper, label: string) {
  const matches = wrapper.findAll('button').filter((button) => button.text() === label)
  if (matches.length !== 1) {
    throw new Error(`Se esperaba un botón «${label}» y se encontraron ${matches.length}.`)
  }
  return matches[0]
}
