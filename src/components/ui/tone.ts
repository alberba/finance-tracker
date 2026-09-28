/** Gain or loss: the sign of a figure, always shown with its sign too. */
export type Tone = 'gain' | 'loss'

export function toneOf(value: number): Tone {
  return value >= 0 ? 'gain' : 'loss'
}

/** Text color of a tone on page surfaces. */
export const TONE_TEXT: Record<Tone, string> = { gain: 'text-gain', loss: 'text-loss' }

/** Text color of a tone on the ink surface, dark in both themes. */
export const INK_TONE_TEXT: Record<Tone, string> = { gain: 'text-ink-gain', loss: 'text-ink-loss' }
