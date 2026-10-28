/** Store de «Mis reportes» (#340): lista paginada, novedades y marca local de lectura. */

import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'

import type { ReportEntry } from '../domain/reports/report-entry'
import { ApiClientError } from '../lib/client/api-error'
import { runClientHttp } from '../lib/client/runtime'
import { fetchReports } from '../services/reports-api'

export type ReportsStatus = 'idle' | 'loading' | 'ready' | 'error'

export const useReportsStore = defineStore('reports', () => {
  const reports = shallowRef<ReportEntry[]>([])
  const status = ref<ReportsStatus>('idle')
  const error = shallowRef('')
  const hasMore = ref(false)
  const nextCursor = shallowRef<string | null>(null)
  const fetchedAt = shallowRef<string | null>(null)
  /** Lo calcula el servidor sobre todas las filas, no solo sobre la página cargada. */
  const unseenCount = ref(0)
  const loadingMore = ref(false)
  const loadMoreError = shallowRef('')

  let pending: Promise<void> | null = null
  let pendingMore: Promise<void> | null = null
  /** Una recarga invalida las páginas que se estaban añadiendo. */
  let generation = 0

  /** Carga la primera página; dos llamadas simultáneas comparten una sola petición. */
  function refresh(options: { force?: boolean } = {}): Promise<void> {
    if (pending) return pending
    if (reports.value.length === 0 || options.force) status.value = 'loading'
    error.value = ''
    loadMoreError.value = ''
    generation += 1

    pending = runClientHttp(fetchReports())
      .then((response) => {
        reports.value = response.reports
        hasMore.value = response.hasMore
        nextCursor.value = response.nextCursor
        if (response.unseenCount !== undefined) unseenCount.value = response.unseenCount
        fetchedAt.value = response.fetchedAt
        status.value = 'ready'
      })
      .catch((cause: unknown) => {
        error.value =
          cause instanceof ApiClientError ? cause.message : 'No se pudieron cargar tus reportes.'
        status.value = 'error'
      })
      .finally(() => {
        pending = null
      })

    return pending
  }

  /** Añade la página siguiente sin ocultar la lista si falla. */
  function loadMore(): Promise<void> {
    if (pendingMore) return pendingMore
    const cursor = nextCursor.value
    if (!cursor) return Promise.resolve()

    loadMoreError.value = ''
    loadingMore.value = true
    const requested = generation
    pendingMore = runClientHttp(fetchReports({ cursor }))
      .then((response) => {
        if (requested !== generation) return
        const known = new Set(reports.value.map((report) => report.number))
        reports.value = [
          ...reports.value,
          ...response.reports.filter((report) => !known.has(report.number)),
        ]
        hasMore.value = response.hasMore
        nextCursor.value = response.nextCursor
      })
      .catch((cause: unknown) => {
        if (requested !== generation) return
        loadMoreError.value =
          cause instanceof ApiClientError ? cause.message : 'No se pudieron cargar más reportes.'
      })
      .finally(() => {
        loadingMore.value = false
        pendingMore = null
      })

    return pendingMore
  }

  /** Apaga «Nuevo» y los avisos sin esperar al servidor. */
  function markSeenLocally(issueNumber: number, seenAt?: string): void {
    const target = reports.value.find((report) => report.number === issueNumber)
    if (target?.hasUpdates) unseenCount.value = Math.max(0, unseenCount.value - 1)
    reports.value = reports.value.map((report) =>
      report.number === issueNumber
        ? { ...report, hasUpdates: false, lastSeenAt: seenAt ?? report.lastSeenAt }
        : report,
    )
  }

  return {
    reports,
    status,
    error,
    hasMore,
    nextCursor,
    fetchedAt,
    unseenCount,
    loadingMore,
    loadMoreError,
    refresh,
    loadMore,
    markSeenLocally,
  }
})
