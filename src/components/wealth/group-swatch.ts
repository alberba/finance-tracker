import type { SnapshotKind } from '../../scripts/types'

/** Swatch of each snapshot group, shared by the band, the ledger and the history. */
export const GROUP_SWATCH: Record<SnapshotKind, string> = {
  accounts: 'bg-text-faint',
  investments: 'bg-invest',
  liabilities: 'bg-accent',
}
