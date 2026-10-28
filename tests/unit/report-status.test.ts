import { describe, expect, it } from 'vitest'

import type { IssueNode, ReportEntry } from '../../src/domain/reports/report-entry'
import {
  buildAvailableEntry,
  describeReportStatus,
  resolveFollowed,
} from '../../src/domain/reports/report-status'

const REPO = 'acme/finance-tracker'

function node(overrides: Partial<IssueNode> & { number: number }): IssueNode {
  return {
    url: `https://github.com/${REPO}/issues/${overrides.number}`,
    title: `Issue ${overrides.number}`,
    state: 'OPEN',
    stateReason: null,
    repository: { nameWithOwner: REPO },
    ...overrides,
  }
}

function duplicate(number: number, duplicateOf: IssueNode | null): IssueNode {
  return node({ number, state: 'CLOSED', stateReason: 'DUPLICATE', duplicateOf })
}

const BASE = { submittedAt: '2026-10-01T00:00:00.000Z', lastSeenAt: '2026-10-02T00:00:00.000Z', hasUpdates: false, statusChangedAt: null }

describe('resolveFollowed', () => {
  it('no sigue una issue abierta aunque tenga campos de duplicada', () => {
    const root = node({ number: 1, duplicateOf: node({ number: 2 }) })
    expect(resolveFollowed(root, REPO)).toEqual({ duplicateLinkUnavailable: false })
  })

  it('sigue una principal abierta', () => {
    const root = duplicate(1, node({ number: 2 }))
    const result = resolveFollowed(root, REPO)
    expect(result.followed?.number).toBe(2)
    expect(result.duplicateLinkUnavailable).toBe(false)
  })

  it('sigue la cadena hasta tres saltos', () => {
    const root = duplicate(1, duplicate(2, duplicate(3, node({ number: 4 }))))
    expect(resolveFollowed(root, REPO).followed?.number).toBe(4)
  })

  it('se corta a los tres saltos sin marcar el enlace como roto', () => {
    const root = duplicate(1, duplicate(2, duplicate(3, duplicate(4, node({ number: 5 })))))
    const result = resolveFollowed(root, REPO)
    expect(result.followed?.number).toBe(4)
    expect(result.duplicateLinkUnavailable).toBe(false)
  })

  it('muestra el estado de la principal cuando está completada', () => {
    const root = duplicate(1, node({ number: 2, state: 'CLOSED', stateReason: 'COMPLETED' }))
    expect(resolveFollowed(root, REPO).followed?.stateReason).toBe('COMPLETED')
  })

  it('marca el enlace roto cuando falta la principal', () => {
    const result = resolveFollowed(duplicate(1, null), REPO)
    expect(result.followed).toBeUndefined()
    expect(result.duplicateLinkUnavailable).toBe(true)
  })

  it('marca el enlace roto cuando la principal es de otro repositorio', () => {
    const foreign = node({ number: 2, repository: { nameWithOwner: 'other/repo' } })
    const result = resolveFollowed(duplicate(1, foreign), REPO)
    expect(result.followed).toBeUndefined()
    expect(result.duplicateLinkUnavailable).toBe(true)
  })

  it('marca el enlace roto cuando hay un ciclo', () => {
    const first = duplicate(1, null)
    const second = duplicate(2, first)
    ;(first as IssueNode).duplicateOf = second
    const result = resolveFollowed(first, REPO)
    expect(result.followed?.number).toBe(2)
    expect(result.duplicateLinkUnavailable).toBe(true)
  })

  it('conserva el último nodo accesible cuando un salto intermedio está roto', () => {
    const root = duplicate(1, duplicate(2, null))
    const result = resolveFollowed(root, REPO)
    expect(result.followed?.number).toBe(2)
    expect(result.duplicateLinkUnavailable).toBe(true)
  })

  it('no se deja engañar por el título ni por un label «duplicate»', () => {
    const root = node({ number: 1, title: 'duplicate: ya existe' })
    expect(resolveFollowed(root, REPO)).toEqual({ duplicateLinkUnavailable: false })
  })
})

describe('describeReportStatus', () => {
  function available(overrides: Partial<Extract<ReportEntry, { unavailable?: false }>> = {}): ReportEntry {
    return {
      number: 10,
      url: 'https://github.com/acme/finance-tracker/issues/10',
      title: 'Algo',
      state: 'OPEN',
      stateReason: null,
      ...BASE,
      ...overrides,
    }
  }

  it.each([
    ['OPEN', null, 'Abierto', 'warn'],
    ['CLOSED', 'COMPLETED', 'Cerrado · Completado', 'gain'],
    ['CLOSED', 'NOT_PLANNED', 'Cerrado · No planificado', 'neutral'],
    ['CLOSED', null, 'Cerrado', 'neutral'],
  ] as const)('describe el estado %s/%s', (state, stateReason, headline, tone) => {
    const description = describeReportStatus(available({ state, stateReason }))
    expect(description.headline).toBe(headline)
    expect(description.tone).toBe(tone)
  })

  it('trata una reapertura como abierta', () => {
    const description = describeReportStatus(available({ state: 'OPEN', stateReason: 'REOPENED' }))
    expect(description.headline).toBe('Abierto')
    expect(description.tone).toBe('warn')
  })

  it('describe una entrada que sigue a su principal', () => {
    const description = describeReportStatus(
      available({
        state: 'CLOSED',
        stateReason: 'DUPLICATE',
        followed: {
          number: 20,
          url: 'https://github.com/acme/finance-tracker/issues/20',
          title: 'Principal',
          state: 'OPEN',
          stateReason: null,
        },
      }),
    )
    expect(description.headline).toBe('Se sigue en #20')
    expect(description.secondary).toBe('#10 · Cerrado como duplicado')
    expect(description.tone).toBe('warn')
    expect(description.warning).toBeNull()
  })

  it('avisa cuando el enlace a la principal no está disponible', () => {
    const description = describeReportStatus(
      available({ state: 'CLOSED', stateReason: 'DUPLICATE', duplicateLinkUnavailable: true }),
    )
    expect(description.headline).toBe('Cerrado como duplicado')
    expect(description.warning).toBe('El enlace a la principal no está disponible.')
  })

  it('describe una entrada no disponible sin inventar estado', () => {
    const description = describeReportStatus({
      number: 30,
      unavailable: true,
      ...BASE,
    })
    expect(description.headline).toBe('Reporte #30')
    expect(description.state).toBeNull()
    expect(description.warning).toBe('Este reporte ya no está disponible en GitHub')
  })
})

describe('buildAvailableEntry', () => {
  it('copia los datos de la original y añade el seguimiento', () => {
    const entry = buildAvailableEntry(
      duplicate(1, node({ number: 2 })),
      { followed: node({ number: 2 }), duplicateLinkUnavailable: false },
      { ...BASE, statusChangedAt: '2026-10-03T00:00:00.000Z' },
    )
    expect(entry).toMatchObject({
      number: 1,
      state: 'CLOSED',
      followed: { number: 2 },
      statusChangedAt: '2026-10-03T00:00:00.000Z',
    })
  })
})
