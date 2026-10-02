/**
 * Client feature flags (WP7). `PUBLIC_SYNC_V2` gates the new
 * IndexedDB/outbox/`/api/sync` path end to end; it defaults to **off** so
 * the existing `localStorage` + whole-blob `PUT /api/state` path
 * (`src/scripts/state.ts` + `src/scripts/app.ts`) keeps being the one the
 * app actually runs on until cutover (WP11) flips this flag.
 *
 * Astro/Vite only expose env vars prefixed `PUBLIC_` to client bundles —
 * see `src/env.d.ts` for the typed `ImportMetaEnv` entry.
 */

export function isSyncV2Enabled(): boolean {
  const raw = import.meta.env.PUBLIC_SYNC_V2;
  return raw === "true" || raw === "1";
}
