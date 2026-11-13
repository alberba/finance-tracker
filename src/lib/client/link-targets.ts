/**
 * In-memory registry of the movements an unresolved instrument link is still
 * trying to publish, mapping each fixed target id to the instrument it was
 * linked to at click time (#489/#490).
 *
 * Its only job is to let an ordinary write path recognise a **later explicit
 * unlink**: when a target that the link set to an instrument is published
 * without that instrument, the publication record marks it as unlinked so the
 * late continuation cannot relink it. The registry itself is page-local, but
 * `instrument-link.ts` rehydrates it from the durable intent on startup and
 * reconnection, so the priority survives a reload without persisting a second
 * copy of the link.
 *
 * Entries are scoped by owner and cleared when the signed-in user changes or
 * on logout: a target id from one user's link must never influence another
 * user's publication (#487 review). Terminal intents forget their ids instead
 * of keeping them for the life of the page.
 */

const targetsByUser = new Map<string, Map<string, string>>()

/** Fixes the target ids the link captured when the user pressed Vincular. */
export function rememberLinkTargets(
  ownerUserId: string,
  movementIds: readonly string[],
  instrumentId: string,
): void {
  let targets = targetsByUser.get(ownerUserId)
  if (!targets) {
    targets = new Map()
    targetsByUser.set(ownerUserId, targets)
  }
  for (const id of movementIds) targets.set(id, instrumentId)
}

/** The instrument a still-running link of this user expects on this movement. */
export function linkTargetFor(ownerUserId: string, movementId: string): string | undefined {
  return targetsByUser.get(ownerUserId)?.get(movementId)
}

/** Forgets the target ids of an intent that can no longer publish a link. */
export function forgetLinkTargets(
  ownerUserId: string,
  movementIds: readonly string[] = [...(targetsByUser.get(ownerUserId)?.keys() ?? [])],
): void {
  const targets = targetsByUser.get(ownerUserId)
  if (!targets) return
  for (const id of movementIds) targets.delete(id)
  if (targets.size === 0) targetsByUser.delete(ownerUserId)
}

/** Clears one user's page-local targets, or every user's on a session reset. */
export function resetLinkTargets(ownerUserId?: string): void {
  if (ownerUserId === undefined) {
    targetsByUser.clear()
    return
  }
  targetsByUser.delete(ownerUserId)
}
