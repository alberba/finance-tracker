export function normalizeText(value: string): string {
  return value.replace(/\r\n/g, '\n').trim()
}

export function getValidationError(summary: string, description: string): string | null {
  if (!summary || !description) {
    return 'Revisa el formulario: resumen y descripción son obligatorios.'
  }
  if (summary.length < 5) {
    return 'Revisa el formulario: el resumen debe tener al menos 5 caracteres.'
  }
  if (description.length < 12) {
    return 'Revisa el formulario: la descripción debe tener al menos 12 caracteres.'
  }
  return null
}
