/**
 * In-memory registry of the movements a live instrument link is still trying
 * to publish (#489), mapping each fixed target id to the instrument it was
 * linked to at click time.
 *
 * Its only job is to let an ordinary write path recognise a **later explicit
 * unlink**: when a target that the link set to an instrument is published
 * without that instrument, the publication record marks it as unlinked so the
 * late continuation cannot relink it. The registry is deliberately not
 * persisted: resuming an unresolved link across a reload belongs to #490/#491.
 */

const targets = new Map<string, string>()

/** Fixes the target ids the link captured when the user pressed Vincular. */
export function rememberLinkTargets(movementIds: readonly string[], instrumentId: string): void {
  for (const id of movementIds) targets.set(id, instrumentId)
}

/** Stops tracking once the link has finished (or was invalidated). */
export function forgetLinkTargets(movementIds: readonly string[]): void {
  for (const id of movementIds) targets.delete(id)
}

/** The instrument a still-running link expects on this movement, if any. */
export function linkTargetFor(movementId: string): string | undefined {
  return targets.get(movementId)
}
