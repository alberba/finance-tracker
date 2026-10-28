/** Store de «Mis reportes» (#340): lista, novedades y marca local de lectura. */

import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

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
  const fetchedAt = shallowRef<string | null>(null)

  const unseenCount = computed(() => reports.value.filter((report) => report.hasUpdates).length)

  let pending: Promise<void> | null = null

  /** Carga la lista; dos llamadas simultáneas comparten una sola petición. */
  function refresh(options: { force?: boolean } = {}): Promise<void> {
    if (pending) return pending
    if (reports.value.length === 0 || options.force) status.value = 'loading'
    error.value = ''

    pending = runClientHttp(fetchReports())
      .then((response) => {
        reports.value = response.reports
        hasMore.value = response.hasMore
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

  /** Apaga «Nuevo» y los avisos sin esperar al servidor. */
  function markSeenLocally(issueNumber: number, seenAt?: string): void {
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
    fetchedAt,
    unseenCount,
    refresh,
    markSeenLocally,
  }
})
