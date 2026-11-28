import { onBeforeUnmount, onMounted, watch } from 'vue'
import { version } from '../../../package.json'
import { useFinanceReady } from '../../composables/useFinanceReady'
import {
  type ReportDiagnostic,
  type ReportScreen,
  type ScreenDiagnostic,
} from '../../domain/reports/diagnostic'
import { recentApiErrorEventId } from '../../lib/client/error-reporting'
import {
  observeReportStep,
  recentReportSteps,
  resumeImportObservation,
} from '../../lib/client/report-observations'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useSyncStore } from '../../stores/sync'
import { useUiStore } from '../../stores/ui'
import { FRAME_QUERY } from '../ui/sheet-drag'

type ReadScreen = () => ScreenDiagnostic | undefined
const readers = new Map<ReportScreen, Set<ReadScreen>>()

/** A section or its active subview can provide the facts its own controls expose. */
export function useScreenDiagnostic(screen: ReportScreen, read: ReadScreen): void {
  onMounted(() => {
    const active = readers.get(screen) ?? new Set<ReadScreen>()
    active.add(read)
    readers.set(screen, active)
  })
  onBeforeUnmount(() => {
    const active = readers.get(screen)
    active?.delete(read)
    if (!active?.size) readers.delete(screen)
  })
}

export function useReportDiagnostic() {
  const ui = useUiStore()
  const financial = useFinancialStateStore()
  const sync = useSyncStore()
  const ready = useFinanceReady()
  const screen = (): ReportScreen => (ui.page === 'reports' ? 'reports' : ui.ui.activeSection)

  onMounted(() => {
    resumeImportObservation()
    watch(screen, observeReportStep, { immediate: true, flush: 'sync' })
    watch(
      () => sync.pendingCount > 0,
      (pending) => {
        if (pending) observeReportStep('sync-pending')
      },
      { immediate: true },
    )
  })

  function capture(): ReportDiagnostic {
    const location = screen()
    const load = financial.status === 'error' ? 'error' : ready.value ? 'ready' : 'starting'
    const base: Omit<ReportDiagnostic, 'section'> = {
      screen: location,
      capturedAt: new Date().toISOString(),
      version,
      device: window.matchMedia(FRAME_QUERY).matches ? 'desktop' : 'mobile',
      load,
      sync:
        sync.userId !== null && (ready.value || sync.revision > 0 || sync.pendingCount > 0)
          ? { revision: sync.revision, pending: sync.pendingCount }
          : null,
      steps: recentReportSteps(),
      sentryEventId: recentApiErrorEventId(),
    }
    if (base.sync?.pending && base.steps.at(-1) !== 'sync-pending') {
      base.steps = [...base.steps, 'sync-pending' as const].slice(-8)
    }

    let section: ScreenDiagnostic = { checks: ['insufficient'] }
    try {
      if (load === 'ready') {
        for (const read of readers.get(location) ?? []) {
          const evidence = read()
          if (evidence) {
            section = evidence
            break
          }
        }
      }
    } catch {
      // An unavailable view model must never prevent opening the report.
    }
    return { ...base, section }
  }

  return { capture }
}
