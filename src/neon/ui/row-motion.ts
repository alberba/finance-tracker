/**
 * Motion of the rows of a list (DESIGN.md, Movimiento).
 *
 * On arrival the rows come in one after another (`anim-row`), and the bars in
 * them draw themselves a beat later (`anim-wipe`). Only the first few rows
 * wait; the rest come in with the last of them.
 *
 * While the list is in use, a row that is added opens its own room and one
 * that leaves folds away, so the rows around it slide instead of jumping.
 * These are the `enter` and `leave` hooks of a `<TransitionGroup :css="false">`.
 * When many rows change at once (a filter, a month switched), the list just
 * swaps: a wave of rows folding would hide what changed.
 */

/** When the first row comes in, after its card has started to rise. */
const ROW_START = 260
const ROW_STEP = 35
/** Rows past this one come in with it. */
const ROW_CAP = 8

export function rowDelay(index: number): number {
  return ROW_START + Math.min(index, ROW_CAP) * ROW_STEP
}

/** The bar of a row starts drawing once its row is in. */
export function barDelay(index: number): number {
  return rowDelay(index) + 140
}

/** More rows changing together than this and the list swaps without motion. */
const BATCH_LIMIT = 3
const OPEN = 320
const FOLD = 240
const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)'

type Done = () => void
type Change = { element: HTMLElement; done: Done; kind: 'enter' | 'leave' }
let batch: Change[] = []

function reducedMotion(): boolean {
  return typeof matchMedia !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** The row's height and the box around it, so folding takes all of it. */
function box(element: HTMLElement): Keyframe {
  const style = getComputedStyle(element)
  return {
    height: `${element.offsetHeight}px`,
    minHeight: style.minHeight,
    paddingTop: style.paddingTop,
    paddingBottom: style.paddingBottom,
    borderTopWidth: style.borderTopWidth,
    opacity: 1,
  }
}

const FOLDED: Keyframe = {
  height: '0px',
  minHeight: '0px',
  paddingTop: '0px',
  paddingBottom: '0px',
  borderTopWidth: '0px',
  opacity: 0,
}

function play(change: Change): void {
  const { element, done, kind } = change
  const open = box(element)
  element.style.overflow = 'clip'
  const animation = element.animate(kind === 'enter' ? [FOLDED, open] : [open, FOLDED], {
    duration: kind === 'enter' ? OPEN : FOLD,
    easing: EASE,
  })
  const finish = () => {
    element.style.overflow = ''
    done()
  }
  animation.onfinish = finish
  animation.oncancel = finish
}

function flush(): void {
  const changes = batch
  batch = []
  if (changes.length > BATCH_LIMIT || reducedMotion()) {
    for (const change of changes) change.done()
    return
  }
  for (const change of changes) play(change)
}

function queue(change: Change): void {
  if (!batch.length) queueMicrotask(flush)
  batch.push(change)
}

export function rowEnter(element: Element, done: Done): void {
  queue({ element: element as HTMLElement, done, kind: 'enter' })
}

export function rowLeave(element: Element, done: Done): void {
  queue({ element: element as HTMLElement, done, kind: 'leave' })
}
