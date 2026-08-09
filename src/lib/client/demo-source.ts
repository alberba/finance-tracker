/**
 * Global, read-only demo dataset for the sync-v2 client path (WP8).
 *
 * Legacy behavior (`PUBLIC_SYNC_V2` off, the default — see
 * `src/scripts/demo-mode.ts`): demo is a real, writable D1 row keyed by the
 * `demo` namespace (`src/lib/server/d1-state.ts`), created on first request
 * and mutable like any other namespace. That path is untouched and keeps
 * working exactly as before, per this WP's "keep the legacy demo path
 * working" constraint.
 *
 * New v2 behavior (`PUBLIC_SYNC_V2` on): demo becomes a code-generated,
 * global, **read-only** dataset — `buildDemoSeed()` is called directly on
 * the client, with no D1 row ever created or written for a visitor. This
 * module is the seam: `isReadOnlyDemoActive()` reports whether the current
 * session is in this mode, and `getGlobalDemoState()` returns the dataset.
 * `useSyncStore().enqueueCommand()` consults `isReadOnlyDemoActive()` to
 * reject any attempted mutation instead of queuing it.
 */

import { buildDemoSeed } from "../../data/demo-seed";
import { isDemoMode } from "../../scripts/demo-mode";
import type { State } from "../../scripts/types";
import { isSyncV2Enabled } from "./feature-flags";

/**
 * True only when both the sync-v2 client path is enabled *and* demo mode is
 * active — i.e. exactly the combination that must never touch D1.
 */
export function isReadOnlyDemoActive(): boolean {
  return isSyncV2Enabled() && isDemoMode();
}

/** The deterministic, synthetic demo dataset — never fetched from the server. */
export function getGlobalDemoState(now: Date = new Date()): State {
  return buildDemoSeed(now);
}
