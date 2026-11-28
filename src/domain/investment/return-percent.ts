/** A gain as a share of what went in, in percent; 0 when nothing went in (there is no return to speak of). */
export function returnPercent(gain: number, invested: number): number {
  return invested <= 0 ? 0 : (gain / invested) * 100
}
