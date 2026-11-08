/** Gain or loss: the sign of a figure, always shown with its sign too. */
export type Tone = 'gain' | 'loss'

export function toneOf(value: number): Tone {
  return value >= 0 ? 'gain' : 'loss'
}
