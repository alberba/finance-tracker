/**
 * Drag-to-close rules of the bottom sheets (DESIGN.md, «Hoja»): the sheet
 * follows the finger; upwards it yields less and less (square root); on
 * release it closes past 30 % of its height or with a flick faster than
 * 0,11 px/ms, and otherwise goes back.
 */

/** Share of the sheet's height that, once dragged, closes it. */
export const CLOSE_FRACTION = 0.3

/** Release speed (px/ms) that closes the sheet whatever the distance. */
export const CLOSE_VELOCITY = 0.11

/** A flick counts only if the last movement was this recent (ms) when the finger lifted. */
export const FLICK_WINDOW_MS = 100

/** Upward drag resistance: the offset grows with the square root of the pull. */
const UPWARD_RESISTANCE = 4

/** Width from which the desktop frame (a side panel, not a sheet) shows. */
export const FRAME_QUERY = '(min-width: 61.3125rem)'

/** How far the sheet moves for a finger that has travelled `delta` px. */
export function dragOffset(delta: number): number {
  return delta >= 0 ? delta : -Math.sqrt(-delta) * UPWARD_RESISTANCE
}

export function shouldCloseSheet(offset: number, height: number, velocity: number): boolean {
  if (offset <= 0) return false
  return offset > height * CLOSE_FRACTION || velocity > CLOSE_VELOCITY
}

interface Sample {
  y: number
  at: number
}

/** Velocity (px/ms, positive downwards) between the last two samples of a drag. */
export function releaseVelocity(previous: Sample, last: Sample): number {
  const elapsed = last.at - previous.at
  return elapsed > 0 ? (last.y - previous.y) / elapsed : 0
}

/** Travel (px) up to which a press on the grip is a tap, not a drag. */
export const TAP_SLOP = 8

/** Travel (px) that moves a list sheet between its two heights. */
export const SNAP_DISTANCE = 48

/**
 * What a gesture on the grip of a list sheet (DESIGN.md, «Hoja arrastrable»)
 * does. `delta` is the finger's travel in px (positive downwards) and
 * `velocity` its release speed in px/ms (positive downwards). A tap flips the
 * sheet; a drag up opens it to full height and a drag down brings it back,
 * past `SNAP_DISTANCE` or with a flick; the other direction does nothing.
 */
export function listSheetGesture(
  expanded: boolean,
  delta: number,
  velocity: number,
): 'toggle' | 'expand' | 'collapse' | 'stay' {
  if (Math.abs(delta) <= TAP_SLOP) return 'toggle'
  if (!expanded && delta < 0 && (-delta > SNAP_DISTANCE || -velocity > CLOSE_VELOCITY)) {
    return 'expand'
  }
  if (expanded && delta > 0 && (delta > SNAP_DISTANCE || velocity > CLOSE_VELOCITY)) {
    return 'collapse'
  }
  return 'stay'
}
