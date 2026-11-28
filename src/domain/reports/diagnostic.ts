export const REPORT_SCREENS = [
  'dashboard',
  'transactions',
  'budget',
  'wealth',
  'investment',
  'goals',
  'settings',
  'data',
  'reports',
  'unknown',
] as const

export type ReportScreen = (typeof REPORT_SCREENS)[number]
export const reportScreenLabels: Record<ReportScreen, string> = {
  dashboard: 'Dashboard',
  transactions: 'Movimientos',
  budget: 'Presupuesto',
  wealth: 'Patrimonio',
  investment: 'Inversión',
  goals: 'Objetivos',
  settings: 'Configuración',
  data: 'Datos',
  reports: 'Mis reportes',
  unknown: 'Pantalla sin identificar',
}

export const diagnosticLabels = {
  insufficient: 'Evidencia insuficiente',
  'recurring-clear': 'No hay movimientos recurrentes por confirmar',
  'recurring-pending': 'Hay movimientos recurrentes por confirmar',
  'filters-active': 'Hay filtros activos',
  'filters-reduce': 'Los filtros ocultan movimientos del periodo',
  'filters-none': 'El registro no tiene filtros activos',
  'registry-empty': 'No hay filas visibles en el registro',
  'registry-folded': 'Hay movimientos en meses plegados',
  'budget-categorized':
    'Hay movimientos asignados a una categoría del presupuesto en el mes contable',
  'budget-uncategorized': 'Hay movimientos sin categoría del presupuesto en el mes contable',
  'budget-accounting-month': 'Hay movimientos cuyo mes contable difiere del mes de su fecha',
  'budget-empty': 'No hay movimientos para comprobar en este mes contable',
  'wealth-calculated': 'Hay valoraciones calculadas con movimientos y cierres anteriores',
  'wealth-snapshot': 'Hay valoraciones tomadas del cierre guardado',
  'wealth-no-snapshot': 'El periodo no tiene un cierre guardado',
  'position-visible': 'Hay filas de posición visibles para el periodo',
  'position-grouped': 'La vista agrupa posiciones de varias cuentas en una fila',
  'position-instrument': 'Hay movimientos atribuidos por el vínculo del instrumento',
  'position-category': 'Hay movimientos atribuidos por su categoría',
  'position-outside-period': 'Hay posiciones que quedan fuera del periodo',
  'position-empty': 'No hay filas de posición visibles para el periodo',
  'goals-linked': 'Hay objetivos con categoría de ahorro vinculada',
  'goals-unlinked': 'Hay objetivos sin categoría de ahorro vinculada',
  'goals-no-period': 'El objetivo no tiene un periodo completo',
  'settings-saved': 'Configuración guardada en el dispositivo',
  'settings-rejected': 'El último guardado de configuración no se aplicó',
  'import-running': 'Importación en curso',
  'import-complete': 'Importación completada',
  'import-skipped': 'La importación omitió elementos sin cuenta o categoría',
  'import-failed': 'La importación falló',
  'reports-create-complete': 'Se guardó el último reporte',
  'reports-create-failed': 'Falló el alta del reporte',
  'reports-follow-failed': 'Falló el seguimiento del reporte',
  'reports-thread-failed': 'Falló el hilo del reporte',
  'sync-pending': 'Sincronización pendiente',
} as const

export type DiagnosticCode = keyof typeof diagnosticLabels
export type DiagnosticStep = ReportScreen | DiagnosticCode

export const DIAGNOSTIC_OPTIONS = [
  'search',
  'type',
  'expense',
  'income',
  'saving',
  'investment',
  'account',
  'category',
  'date',
  'older',
  'simple',
  'twr',
  'weight',
  'gain',
  'change',
  'asc',
  'desc',
  '1m',
  '3m',
  '6m',
  '1a',
  '2a',
  'todo',
  'ytd',
  '1y',
  '2y',
  '3y',
  '5y',
  'all',
  'accounts',
  'investments',
  'liabilities',
  'custom',
] as const

export const DIAGNOSTIC_SUBVIEWS = [
  'registry',
  'subscriptions',
  'month',
  'review',
  'prepare',
  'year',
  'year-quarter',
  'year-month',
  'home',
  'months',
  'close',
  'history',
  'accounts',
  'mix',
  'positions',
  'asset',
  'asset-movements',
  'detail',
  'index',
  'assets',
  'liabilities',
  'categories',
  'recurring',
  'preferences',
  'security',
  'connections',
  'account',
  'list',
  'thread',
  'import',
  'sync',
] as const

export interface ScreenDiagnostic {
  subview?: (typeof DIAGNOSTIC_SUBVIEWS)[number]
  year?: number
  month?: number
  fromYear?: number
  fromMonth?: number
  options?: Array<(typeof DIAGNOSTIC_OPTIONS)[number]>
  checks: DiagnosticCode[]
}

export interface ReportDiagnostic {
  screen: ReportScreen
  capturedAt: string
  version: string
  device: 'mobile' | 'desktop'
  load: 'starting' | 'ready' | 'error'
  sync: { revision: number; pending: number } | null
  section: ScreenDiagnostic
  steps: DiagnosticStep[]
  sentryEventId?: string
}

export const reportTopics = {
  load: 'Error de carga',
  calculation: 'Error de cálculo',
  missing: 'Datos ausentes',
  save: 'Error de guardado',
  sync: 'Error de sincronización',
} as const
export type ReportTopic = keyof typeof reportTopics

export function publicReportSummary(
  type: 'bug' | 'feature' | 'enhancement',
  screen: ReportScreen,
  topic?: ReportTopic,
) {
  const kind = type === 'bug' ? (topic ? reportTopics[topic] : 'Incidencia') : 'Mejora'
  return `${kind} en ${reportScreenLabels[screen]}`
}

export function describeDiagnostic(report: ReportDiagnostic): string {
  const { section, sync } = report
  const period =
    section.year === undefined
      ? null
      : [section.year, section.month?.toString().padStart(2, '0')].filter(Boolean).join('-')
  const start =
    section.fromYear === undefined
      ? null
      : [section.fromYear, section.fromMonth?.toString().padStart(2, '0')].filter(Boolean).join('-')
  const loadLabel = {
    starting: 'Arranque incompleto',
    ready: 'Datos cargados',
    error: 'Error de carga',
  }
  return [
    [reportScreenLabels[report.screen], section.subview].filter(Boolean).join(' · '),
    `${report.capturedAt} · Versión ${report.version} · ${report.device === 'mobile' ? 'Móvil' : 'Escritorio'}`,
    loadLabel[report.load],
    sync
      ? `Revisión ${sync.revision} · ${sync.pending} pendientes de sincronización`
      : 'Sincronización: evidencia insuficiente',
    period && `Periodo ${start ? `${start} → ` : ''}${period}`,
    section.options?.length && `Opciones activas: ${section.options.join(', ')}`,
    ...section.checks.map((code) => diagnosticLabels[code]),
    report.steps.length &&
      `Pasos observados: ${report.steps
        .map(
          (code) =>
            diagnosticLabels[code as DiagnosticCode] ?? reportScreenLabels[code as ReportScreen],
        )
        .join(' → ')}`,
    report.sentryEventId && `Referencia Sentry ${report.sentryEventId}`,
  ]
    .filter(Boolean)
    .join('\n')
}
