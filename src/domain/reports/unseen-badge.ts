/**
 * El contador de «Mis reportes» con novedades que pintan los marcos móviles
 * (hoja «Más»): la cifra visible, que llega a «9+», y la frase que lee un lector
 * de pantalla, con la cuenta exacta. `null` cuando no hay novedades.
 */
export interface UnseenBadge {
  text: string
  spoken: string
}

export function unseenBadge(count: number): UnseenBadge | null {
  if (count <= 0) return null
  return {
    text: count > 9 ? '9+' : String(count),
    spoken: count === 1 ? '1 reporte con novedades' : `${count} reportes con novedades`,
  }
}
