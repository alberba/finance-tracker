// The sentences and labels Objetivos repeats across its ledger, band and panel.

/** "Fondos indexados y Criptomonedas": names joined the way a sentence reads them. */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
}

/** "dic 2029": goals are due at the end of their target year. */
export function dueLabel(targetYear: number): string {
  return `dic ${targetYear}`
}

/** "38 meses" / "1 mes". */
export function monthsLabel(months: number): string {
  return months === 1 ? '1 mes' : `${months} meses`
}

/** The pace of the portfolio goals and the goals that set it, as one sentence. */
export function portfolioPaceSentence(rate: string, names: string[]): string {
  const verb = names.length > 1 ? 'lo marcan' : 'lo marca'
  return `La cartera tiene que crecer ${rate} al mes para cumplir sus metas; ${verb} ${joinNames(names)}.`
}
