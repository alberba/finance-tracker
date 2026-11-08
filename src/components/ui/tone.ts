import type { Tone } from '../../lib/tone'

// The tone itself is shared (src/lib/tone.ts) so view-models can use it; the
// class names below belong to this design.
export { toneOf, type Tone } from '../../lib/tone'

/** Text color of a tone on page surfaces. */
export const TONE_TEXT: Record<Tone, string> = { gain: 'text-gain', loss: 'text-loss' }

/** Text color of a tone on the ink surface, dark in both themes. */
export const INK_TONE_TEXT: Record<Tone, string> = { gain: 'text-ink-gain', loss: 'text-ink-loss' }
