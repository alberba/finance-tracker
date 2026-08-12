/**
 * Global, read-only demo dataset for the sync-v2 client path (WP8).
 *
 * Demo is code-generated and global regardless of the sync feature flag.
 * It never opens a per-user cache/outbox or talks to D1. Mutations remain
 * local to the isolated demo cache so visitors can explore the interface.
 */

import { buildDemoSeed } from "../../data/demo-seed";
import { isDemoMode } from "../../scripts/demo-mode";
import type { State } from "../../scripts/types";

/**
 * True whenever demo mode is active, independently of the sync rollout flag.
 */
export function isReadOnlyDemoActive(): boolean {
  return isDemoMode();
}

/** The deterministic, synthetic demo dataset — never fetched from the server. */
export function getGlobalDemoState(now: Date = new Date()): State {
  return buildDemoSeed(now);
}
