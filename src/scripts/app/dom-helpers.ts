export function getRequiredElement<T extends Element>(id: string): T {
  const element = document.getElementById(id)
  if (!element) {
    throw new Error(`Elemento requerido no encontrado: #${id}`)
  }
  return element as unknown as T
}

export function getEventElement(target: EventTarget | null): Element | null {
  return target instanceof Element ? target : null
}

export function hasSelectionWithin(container: Element): boolean {
  const selection = window.getSelection()
  if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
    const range = selection.getRangeAt(0)
    const ancestor = range.commonAncestorContainer
    if (ancestor && container.contains(ancestor)) {
      return true
    }
  }

  const activeElement = document.activeElement
  if (
    activeElement &&
    container.contains(activeElement) &&
    (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) &&
    typeof activeElement.selectionStart === 'number' &&
    typeof activeElement.selectionEnd === 'number'
  ) {
    return activeElement.selectionEnd > activeElement.selectionStart
  }

  return false
}
