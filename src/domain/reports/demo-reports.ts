/**
 * Reportes ficticios de la demo (#340). Fechas y URLs constantes: la E2E
 * visual compara snapshots, así que nada aquí puede depender de «ahora».
 */

import type { ReportDetail } from './report-entry'

const EXAMPLE_REPO = 'https://github.com/example/finance-tracker/issues'

export const DEMO_REPORTS: ReportDetail[] = [
  {
    report: {
      number: 901,
      url: `${EXAMPLE_REPO}/901`,
      title: 'El gráfico de gastos no respeta el filtro de mes',
      state: 'OPEN',
      stateReason: null,
      submittedAt: '2026-10-18T08:32:00.000Z',
      lastSeenAt: '2026-10-24T11:00:00.000Z',
      hasUpdates: false,
      statusChangedAt: null,
    },
    threadIssue: {
      number: 901,
      url: `${EXAMPLE_REPO}/901`,
      title: 'El gráfico de gastos no respeta el filtro de mes',
      state: 'OPEN',
      stateReason: null,
    },
    thread: [
      {
        id: 9101,
        kind: 'maintainer',
        author: 'ana-mantenimiento',
        createdAt: '2026-10-19T07:40:00.000Z',
        editedAt: null,
        text: 'Gracias por el detalle. Lo reproducimos con el filtro de octubre; lo revisamos esta semana.',
        attachments: [],
        editable: false,
      },
      {
        id: 9102,
        kind: 'reporter',
        author: 'Tú',
        createdAt: '2026-10-20T18:05:00.000Z',
        editedAt: null,
        text: 'Ocurre solo en móvil, con el mes anterior seleccionado.',
        attachments: [],
        editable: false,
      },
    ],
    canComment: false,
    original:
      '### Resumen\nEl gráfico de gastos no respeta el filtro de mes\n\n### Problema o solicitud\nAl elegir octubre, el gráfico sigue sumando los gastos de septiembre.',
    issueDescription:
      '## Problema\nEl gráfico de gastos ignora el filtro de mes del Dashboard y suma también el mes anterior.\n\n## Resultado esperado\nQue el gráfico solo incluya los gastos del mes elegido.',
    fetchedAt: '2026-10-24T12:00:00.000Z',
  },
  {
    report: {
      number: 902,
      url: `${EXAMPLE_REPO}/902`,
      title: 'Añadir exportación a PDF de los movimientos',
      state: 'CLOSED',
      stateReason: 'DUPLICATE',
      submittedAt: '2026-10-21T16:10:00.000Z',
      lastSeenAt: '2026-10-24T11:00:00.000Z',
      hasUpdates: false,
      followed: {
        number: 887,
        url: `${EXAMPLE_REPO}/887`,
        title: 'Exportar movimientos a PDF y CSV',
        state: 'OPEN',
        stateReason: null,
      },
      statusChangedAt: '2026-10-22T09:20:00.000Z',
    },
    threadIssue: {
      number: 887,
      url: `${EXAMPLE_REPO}/887`,
      title: 'Exportar movimientos a PDF y CSV',
      state: 'OPEN',
      stateReason: null,
    },
    thread: [
      {
        id: 9201,
        kind: 'maintainer',
        author: 'ana-mantenimiento',
        createdAt: '2026-10-23T10:15:00.000Z',
        editedAt: null,
        text: 'Unificado en esta petición: PDF y CSV saldrán del mismo exportador.',
        attachments: [],
        editable: false,
      },
    ],
    canComment: false,
    original:
      '### Resumen\nAñadir exportación a PDF de los movimientos\n\n### Problema o solicitud\nMe gustaría descargar mis movimientos en PDF.',
    issueDescription: null,
    fetchedAt: '2026-10-24T12:00:00.000Z',
  },
]
