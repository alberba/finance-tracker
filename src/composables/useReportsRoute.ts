/**
 * Adaptador de `window` para la ruta de «Mis reportes» (#340): lee y escribe
 * `?reporte=<n>` y escucha `popstate`. Es el único módulo de esta zona que toca
 * `location`/`history`.
 */

import { onBeforeUnmount, onMounted, ref } from 'vue'

const PARAM = 'reporte'
const NUMBER_PATTERN = /^\d{1,9}$/

function readSelected(pathname: string, search: string): number | null {
  if (!pathname.replace(/\/+$/, '').endsWith('/reportes')) return null
  const raw = new URLSearchParams(search).get(PARAM)
  if (!raw || !NUMBER_PATTERN.test(raw)) return null
  return Number(raw)
}

export function useReportsRoute() {
  const selectedNumber = ref<number | null>(
    readSelected(window.location.pathname, window.location.search),
  )

  function sync(): void {
    selectedNumber.value = readSelected(window.location.pathname, window.location.search)
  }

  function write(issueNumber: number | null): void {
    const url = new URL(window.location.href)
    if (issueNumber === null) url.searchParams.delete(PARAM)
    else url.searchParams.set(PARAM, String(issueNumber))
    window.history.pushState(null, '', `${url.pathname}${url.search}${url.hash}`)
    selectedNumber.value = issueNumber
  }

  function select(issueNumber: number): void {
    write(issueNumber)
  }

  function backToList(): void {
    write(null)
  }

  onMounted(() => window.addEventListener('popstate', sync))
  onBeforeUnmount(() => window.removeEventListener('popstate', sync))

  return { selectedNumber, select, backToList }
}
