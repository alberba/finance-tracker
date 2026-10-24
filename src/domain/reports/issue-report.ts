export function normalizeText(value: string): string {
  return value.replace(/\r\n/g, '\n').trim()
}

// La descripción es opcional y no tiene mínimo: solo el resumen se valida aquí.
export function getValidationError(summary: string): string | null {
  if (!summary) {
    return 'Revisa el formulario: el resumen es obligatorio.'
  }
  if (summary.length < 5) {
    return 'Revisa el formulario: el resumen debe tener al menos 5 caracteres.'
  }
  return null
}
