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
 */

const targets = new Map<string, string>()

/** Fixes the target ids the link captured when the user pressed Vincular. */
export function rememberLinkTargets(movementIds: readonly string[], instrumentId: string): void {
  for (const id of movementIds) targets.set(id, instrumentId)
}

/** The instrument a still-running link expects on this movement, if any. */
export function linkTargetFor(movementId: string): string | undefined {
  return targets.get(movementId)
}
