import { describe, expect, it } from 'vitest'
import { getValidationError } from '../../src/domain/reports/issue-report'

describe('validación del formulario de reporte', () => {
  it('no exige descripción: un reporte con solo resumen es válido', () => {
    expect(getValidationError('El filtro no guarda')).toBeNull()
  })

  it('exige un resumen no vacío', () => {
    expect(getValidationError('')).toBe('Revisa el formulario: el resumen es obligatorio.')
  })

  it('exige al menos 5 caracteres de resumen', () => {
    expect(getValidationError('abc')).toBe(
      'Revisa el formulario: el resumen debe tener al menos 5 caracteres.',
    )
  })
})
