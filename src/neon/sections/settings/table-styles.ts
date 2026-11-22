// Classes the ledger tables of Configuración share (DESIGN.md, «Fila de libro
// mayor»). The grid columns of each table are added next to them, as literal
// classes, so Tailwind finds them.

/** The column heads: small caps over the rows. */
export const HEAD_ROW =
  'text-muted text-label tracking-label grid min-h-10 min-w-0 items-center gap-x-3 font-sans font-extrabold uppercase'

/** A row of data, with a hover only where there is a pointer. */
export const DATA_ROW =
  'border-line grid min-h-16 min-w-0 items-center gap-x-3 border-t py-2.5 motion-safe:transition-colors motion-safe:duration-160 pointer-fine:hover:bg-panel2'

/** A row that is not data: totals and the add row. */
export const PLAIN_ROW = 'border-line grid min-h-16 min-w-0 items-center gap-x-3 border-t py-2.5'

/** A figure in a total row. */
export const TOTAL_FIGURE =
  'font-display text-end text-[17px] font-semibold tracking-[-0.02em] whitespace-nowrap'

/** The wide tables scroll sideways in a narrow container instead of squeezing. */
export const TABLE_SCROLL = 'overflow-x-auto [scrollbar-width:thin]'

// The mobile screens of Configuración (#444).

/** A tappable control: focus ring and a small press. */
export const PRESS =
  'outline-accent focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-140 motion-safe:active:scale-[0.97]'

/** The card that holds a mobile list: mobile card padding, rows edge to edge. */
export const MOBILE_CARD =
  'bg-panel border-line rounded-card motion-safe:animate-rise min-w-0 border px-3 pbs-1 pbe-1.5'
