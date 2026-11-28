import type {
  DiagnosticCode,
  DiagnosticStep,
  ReportScreen,
  ScreenDiagnostic,
} from '../../domain/reports/diagnostic'

const WINDOW_MS = 15 * 60 * 1000
const MAX_STEPS = 8
const IMPORT_MARKER = 'financeReportImport'
const steps: Array<{ code: DiagnosticStep; time: number }> = []
const outcomes = new Map<string, DiagnosticCode>()

export function observeReportStep(code: DiagnosticStep): void {
  if (typeof window === 'undefined') return
  if (steps.at(-1)?.code === code) return
  steps.push({ code, time: Date.now() })
  if (steps.length > MAX_STEPS) steps.shift()
}

export function observeReportOutcome(
  screen: ReportScreen,
  code: DiagnosticCode,
  subview?: ScreenDiagnostic['subview'],
): void {
  outcomes.set(subview ? `${screen}/${subview}` : screen, code)
  observeReportStep(code)
}

export function lastReportOutcome(
  screen: ReportScreen,
  subview?: ScreenDiagnostic['subview'],
): DiagnosticCode | undefined {
  return outcomes.get(subview ? `${screen}/${subview}` : screen)
}

export function recentReportSteps(): DiagnosticStep[] {
  return steps.filter((step) => Date.now() - step.time < WINDOW_MS).map((step) => step.code)
}

/** JSON restore reloads this history entry to rebuild the local read model. */
export function carryImportThroughReload(code: 'import-complete' | 'import-skipped'): void {
  try {
    history.replaceState({ ...history.state, [IMPORT_MARKER]: { code, time: Date.now() } }, '')
  } catch {
    // The import already succeeded. A browser can deny history writes.
  }
}

export function resumeImportObservation(): void {
  const marker: unknown = history.state?.[IMPORT_MARKER]
  if (!marker) return
  try {
    const state = { ...history.state }
    delete state[IMPORT_MARKER]
    history.replaceState(state, '')
  } catch {
    // Ignore stale or inaccessible history.
  }
  if (typeof marker !== 'object' || !('code' in marker) || !('time' in marker)) return
  if (
    (marker.code === 'import-complete' || marker.code === 'import-skipped') &&
    typeof marker.time === 'number' &&
    Date.now() - marker.time < WINDOW_MS
  ) {
    observeReportOutcome('data', marker.code)
  }
}
