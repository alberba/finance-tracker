import { describe, expect, it } from 'vitest'

import type {
  AvailableReportEntry,
  ReportEntry,
  ThreadItem,
  UnavailableReportEntry,
} from '../../src/domain/reports/report-entry'
import {
  composerNote,
  countsLine,
  detailStatus,
  reportRow,
  threadNote,
  threadPerson,
} from '../../src/neon/sections/reports/view-model'

const BASE = {
  submittedAt: '2026-10-18T08:32:00.000Z',
  lastSeenAt: '2026-10-24T11:00:00.000Z',
  hasUpdates: false,
  statusChangedAt: null,
}

function entry(overrides: Partial<AvailableReportEntry> = {}): AvailableReportEntry {
  return {
    number: 901,
    url: 'https://github.com/example/finance-tracker/issues/901',
    title: 'El gráfico de gastos no respeta el filtro de mes',
    state: 'OPEN',
    stateReason: null,
    ...BASE,
    ...overrides,
  }
}

const MAIN = {
  number: 887,
  url: 'https://github.com/example/finance-tracker/issues/887',
  title: 'Exportar movimientos a PDF y CSV',
  state: 'OPEN' as const,
  stateReason: null,
}

const UNAVAILABLE: UnavailableReportEntry = { number: 812, unavailable: true, ...BASE }

describe('reportRow', () => {
  it('un reporte abierto lleva el punto de acento', () => {
    expect(reportRow(entry())).toMatchObject({
      status: 'Abierto',
      dot: 'accent',
      meta: 'Enviado el 18 oct 2026',
      isNew: false,
      title: 'El gráfico de gastos no respeta el filtro de mes',
    })
  })

  it('completado en verde, el resto cerrado en gris', () => {
    expect(reportRow(entry({ state: 'CLOSED', stateReason: 'COMPLETED' }))).toMatchObject({
      status: 'Cerrado · Completado',
      dot: 'gain',
    })
    expect(reportRow(entry({ state: 'CLOSED', stateReason: 'NOT_PLANNED' }))).toMatchObject({
      status: 'Cerrado · No planificado',
      dot: 'muted',
    })
  })

  it('un duplicado con principal dice dónde se sigue y cuál es su estado', () => {
    const row = reportRow(
      entry({ number: 902, state: 'CLOSED', stateReason: 'DUPLICATE', followed: MAIN }),
    )
    expect(row.status).toBe('Se sigue en #887 · Abierto')
    expect(row.dot).toBe('accent')
    expect(row.meta).toBe('Cerrado como duplicado · enviado el 18 oct 2026')
  })

  it('un duplicado sin enlace a la principal lo avisa en la fila', () => {
    const row = reportRow(
      entry({ state: 'CLOSED', stateReason: 'DUPLICATE', duplicateLinkUnavailable: true }),
    )
    expect(row.status).toBe('Cerrado como duplicado')
    expect(row.meta).toBe('Sin enlace a la principal · enviado el 18 oct 2026')
  })

  it('un reporte que ya no existe en GitHub no tiene punto ni título', () => {
    expect(reportRow(UNAVAILABLE)).toMatchObject({
      title: null,
      status: 'Este reporte ya no está disponible en GitHub',
      dot: null,
      meta: 'Enviado el 18 oct 2026',
    })
  })

  it('«Nuevo» sale de las novedades sin ver', () => {
    expect(reportRow(entry({ hasUpdates: true })).isNew).toBe(true)
  })
})

describe('detailStatus', () => {
  it('apunta a la issue del hilo en GitHub', () => {
    const status = detailStatus(entry(), null)
    expect(status.link).toEqual({
      href: 'https://github.com/example/finance-tracker/issues/901',
      label: 'Ver #901 en GitHub',
    })
    expect(status.follow).toBeNull()
  })

  it('un duplicado muestra el salto y enlaza a la principal', () => {
    const report = entry({ number: 902, state: 'CLOSED', stateReason: 'DUPLICATE', followed: MAIN })
    const status = detailStatus(report, MAIN)
    expect(status.headline).toBe('Se sigue en #887 · Abierto')
    expect(status.follow).toEqual({
      from: '#902',
      to: '#887',
      title: 'Exportar movimientos a PDF y CSV',
      secondary: '#902 · Cerrado como duplicado',
    })
    expect(status.link?.label).toBe('Ver #887 en GitHub')
  })

  it('un reporte que ya no existe solo avisa', () => {
    const status = detailStatus(UNAVAILABLE, null)
    expect(status).toMatchObject({
      dot: null,
      link: null,
      warning: 'Este reporte ya no está disponible en GitHub',
    })
  })

  it('el enlace roto a la principal es un aviso, no un salto', () => {
    const status = detailStatus(
      entry({ state: 'CLOSED', stateReason: 'DUPLICATE', duplicateLinkUnavailable: true }),
      null,
    )
    expect(status.warning).toBe('El enlace a la principal no está disponible.')
    expect(status.follow).toBeNull()
  })
})

describe('threadPerson', () => {
  const item = (overrides: Partial<ThreadItem> = {}): ThreadItem => ({
    id: 1,
    kind: 'maintainer',
    author: 'ana-mantenimiento',
    createdAt: '2026-10-19T09:40:00.000Z',
    editedAt: null,
    text: 'Gracias.',
    attachments: [],
    editable: false,
    ...overrides,
  })

  it('el mantenedor lleva la inicial de su login', () => {
    expect(threadPerson(item())).toMatchObject({
      initial: 'A',
      role: 'Mantenedor',
      own: false,
      edited: false,
    })
  })

  it('la aclaración propia se firma «Tú» y puede estar editada', () => {
    expect(
      threadPerson(item({ kind: 'reporter', author: 'Tú', editedAt: '2026-10-20T10:00:00.000Z' })),
    ).toMatchObject({ initial: 'Tú', role: 'Aclaración del reportero', own: true, edited: true })
  })
})

describe('textos del hilo', () => {
  it('el hilo de un duplicado es el de la principal', () => {
    const report: ReportEntry = entry({
      number: 902,
      state: 'CLOSED',
      stateReason: 'DUPLICATE',
      followed: MAIN,
    })
    expect(threadNote(report)).toBe(
      'Hilo de #887, la principal: respuestas del mantenedor y tus aclaraciones.',
    )
    expect(composerNote(report)).toBe('Se publica en #887, donde sigue tu reporte.')
  })

  it('sin principal, el hilo es el del propio reporte', () => {
    expect(threadNote(entry())).toBe('Respuestas del mantenedor y tus aclaraciones.')
    expect(composerNote(entry())).toBe('Se añade al hilo de #901 en GitHub.')
  })
})

describe('countsLine', () => {
  it('cuenta los enviados y, si los hay, los que traen novedades', () => {
    expect(countsLine(6, 0)).toEqual({ sent: 6, news: null })
    expect(countsLine(6, 2)).toEqual({ sent: 6, news: 2 })
  })
})
