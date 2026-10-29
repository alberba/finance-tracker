/**
 * Ciclo de vida del detalle de un reporte (#340): carga, marca de visto y
 * alta, edición o borrado de aclaraciones. Conserva el texto ante un error y no
 * hace borrado optimista: espera a GitHub.
 */

import { computed, ref, shallowRef, watch, type Ref } from 'vue'

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
  /** Mutaciones en vuelo por número de reporte: el compositor de B no se bloquea por A. */
  const pendingIssues = shallowRef<ReadonlySet<number>>(new Set())
  const pending = computed(
    () => issueNumber.value !== null && pendingIssues.value.has(issueNumber.value),
  )
  let requestToken = 0

  function setPending(number: number, value: boolean): void {
    const next = new Set(pendingIssues.value)
    if (value) next.add(number)
    else next.delete(number)
    pendingIssues.value = next
  }

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
      void markSeen(number, response.detail.fetchedAt, response.detail.report.hasUpdates)
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
  async function markSeen(number: number, fetchedAt: string, hadUpdates: boolean): Promise<void> {
    reportsStore.markSeenLocally(number, fetchedAt, hadUpdates)
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

  /**
   * Ejecuta una mutación del hilo indicado. Si la persona cambia de reporte
   * antes de que responda, el resultado (y el error) no contaminan el hilo B.
   */
  async function mutate<T>(number: number, call: () => Promise<T>): Promise<T | null> {
    setPending(number, true)
    if (issueNumber.value === number) error.value = ''
    try {
      return await call()
    } catch (cause) {
      if (issueNumber.value === number) error.value = messageOf(cause)
      return null
    } finally {
      setPending(number, false)
    }
  }

  /**
   * Mutación sobre el hilo abierto en el momento de invocarla. Devuelve el
   * número y el resultado, o `null` si no hay hilo, la llamada falla o la API
   * responde `ok: false`; en ese caso deja el error solo si sigue siendo el
   * hilo visible.
   */
  async function commit<T extends { ok: true }>(
    call: (number: number) => Promise<T | { ok: false; error: string }>,
  ): Promise<{ number: number; result: T } | null> {
    const number = issueNumber.value
    if (number === null) return null
    const result = await mutate(number, () => call(number))
    if (!result) return null
    if (!result.ok) {
      if (issueNumber.value === number) error.value = result.error
      return null
    }
    return { number, result }
  }

  async function addComment(input: ReportCommentInput): Promise<boolean> {
    const committed = await commit((number) => runClientHttp(postReportComment(number, input)))
    if (!committed) return false
    const { number, result } = committed
    // Si la persona ya abrió otro reporte, la aclaración se publicó en A pero no
    // se aplica a la vista actual: el padre no debe reiniciar el borrador de B.
    if (issueNumber.value !== number || !detail.value) return false
    detail.value = { ...detail.value, thread: [...detail.value.thread, result.comment] }
    return true
  }

  async function updateComment(
    commentId: number,
    input: ReportCommentUpdateInput,
  ): Promise<boolean> {
    const committed = await commit((number) =>
      runClientHttp(patchReportComment(number, commentId, input)),
    )
    if (!committed) return false
    const { number, result } = committed
    if (issueNumber.value !== number) return false
    replaceItem(result.comment)
    return true
  }

  async function removeComment(commentId: number): Promise<boolean> {
    const committed = await commit((number) =>
      runClientHttp(deleteReportComment(number, commentId)),
    )
    if (!committed) return false
    const { number } = committed
    if (issueNumber.value !== number || !detail.value) return false
    detail.value = {
      ...detail.value,
      thread: detail.value.thread.filter((item) => item.id !== commentId),
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
