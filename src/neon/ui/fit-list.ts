/**
 * How many leading rows of a list fit in `room` pixels: `bottoms` are the
 * bottom edge of each row measured from the list's top. A row that is cut off
 * is not shown, and neither is anything after it, so the list never has a gap.
 * Half a pixel of slack absorbs the rounding of the browser's layout.
 */
export function fitCount(bottoms: readonly number[], room: number): number {
  const index = bottoms.findIndex((edge) => edge > room + 0.5)
  return index === -1 ? bottoms.length : index
}
