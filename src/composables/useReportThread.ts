/**
 * Ciclo de vida del detalle de un reporte (#340): carga, marca de visto y
 * alta, edición o borrado de aclaraciones. Conserva el texto ante un error y no
 * hace borrado optimista: espera a GitHub.
 */

import { ref, shallowRef, watch, type Ref } from 'vue'

import type { ReportDetail, ThreadItem } from '../domain/reports/report-entry'
import { ApiClientError } from '../lib/client/api-error'
import { runClientHttp } from '../lib/client/runtime'
import {
  deleteReportComment,
  fetchReportDetail,
  markReportSeen,
  patchReportComment,
  postReportComment,
  type ReportCommentInput,
  type ReportCommentUpdateInput,
} from '../services/reports-api'
import { useReportsStore } from '../stores/reports'

export type ReportThreadStatus = 'idle' | 'loading' | 'ready' | 'error' | 'notFound' | 'unavailable'

const GENERIC_ERROR = 'No se pudo publicar en GitHub. Tu texto sigue aquí; inténtalo de nuevo.'

function messageOf(cause: unknown): string {
  return cause instanceof ApiClientError ? cause.message : GENERIC_ERROR
}

export function useReportThread(issueNumber: Ref<number | null>) {
  const reportsStore = useReportsStore()
  const detail = shallowRef<ReportDetail | null>(null)
  const status = ref<ReportThreadStatus>('idle')
  const error = shallowRef('')
  const pending = ref(false)
  let requestToken = 0

  function reset(): void {
    detail.value = null
    status.value = 'idle'
    error.value = ''
  }

  async function load(): Promise<void> {
    const number = issueNumber.value
    if (number === null) {
      reset()
      return
    }
    const token = ++requestToken
    status.value = 'loading'
    error.value = ''
    try {
      const response = await runClientHttp(fetchReportDetail(number))
      if (token !== requestToken) return
      detail.value = response.detail
      if (response.detail.report.unavailable) {
        status.value = 'unavailable'
        return
      }
      status.value = 'ready'
      void markSeen(number, response.detail.fetchedAt)
    } catch (cause) {
      if (token !== requestToken) return
      detail.value = null
      if (cause instanceof ApiClientError && cause.status === 404) {
        status.value = 'notFound'
        return
      }
      error.value = messageOf(cause)
      status.value = 'error'
    }
  }

  /**
   * Marca la lectura en el servidor sin bloquear la vista. Si falla, el estado
   * local se mantiene hasta la próxima carga y no se muestra error ([D4]).
   */
  async function markSeen(number: number, fetchedAt: string): Promise<void> {
    reportsStore.markSeenLocally(number, fetchedAt)
    try {
      await runClientHttp(markReportSeen(number, fetchedAt))
    } catch {
      // Silencioso a propósito: la marca es una mejora, no un requisito.
    }
  }

  function replaceItem(item: ThreadItem): void {
    if (!detail.value) return
    detail.value = {
      ...detail.value,
      thread: detail.value.thread.map((current) => (current.id === item.id ? item : current)),
    }
  }

  /** Ejecuta una mutación con el estado `pending`/`error` compartido. */
  async function mutate<T>(call: () => Promise<T>): Promise<T | null> {
    pending.value = true
    error.value = ''
    try {
      return await call()
    } catch (cause) {
      error.value = messageOf(cause)
      return null
    } finally {
      pending.value = false
    }
  }

  async function addComment(input: ReportCommentInput): Promise<boolean> {
    const number = issueNumber.value
    if (number === null) return false
    const result = await mutate(() => runClientHttp(postReportComment(number, input)))
    if (!result) return false
    if (!result.ok) {
      error.value = result.error
      return false
    }
    if (detail.value) {
      detail.value = { ...detail.value, thread: [...detail.value.thread, result.comment] }
    }
    return true
  }

  async function updateComment(
    commentId: number,
    input: ReportCommentUpdateInput,
  ): Promise<boolean> {
    const number = issueNumber.value
    if (number === null) return false
    const result = await mutate(() => runClientHttp(patchReportComment(number, commentId, input)))
    if (!result) return false
    if (!result.ok) {
      error.value = result.error
      return false
    }
    replaceItem(result.comment)
    return true
  }

  async function removeComment(commentId: number): Promise<boolean> {
    const number = issueNumber.value
    if (number === null) return false
    const result = await mutate(() => runClientHttp(deleteReportComment(number, commentId)))
    if (!result) return false
    if (!result.ok) {
      error.value = result.error
      return false
    }
    if (detail.value) {
      detail.value = {
        ...detail.value,
        thread: detail.value.thread.filter((item) => item.id !== commentId),
      }
    }
    return true
  }

  watch(issueNumber, () => void load(), { immediate: true })

  return {
    detail,
    status,
    error,
    pending,
    load,
    addComment,
    updateComment,
    removeComment,
  }
}
