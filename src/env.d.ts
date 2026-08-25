/// <reference types="vite-svg-loader" />

import type { AuthPrincipal } from "./lib/server/auth/principal";

declare global {
  interface ImportMetaEnv {
    /**
     * Feature flag (WP7) gating the IndexedDB/outbox `/api/sync` client path.
     * Defaults to off (unset/anything but `"true"`/`"1"`) — see
     * `src/lib/client/feature-flags.ts`.
     */
    readonly PUBLIC_SYNC_V2?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  namespace App {
    interface Locals {
      /** Test-only binding injection; production uses `cloudflare:workers`. */
      runtimeEnv?: {
        finance_tracker_db?: unknown;
        finance_tracker_db_v2?: unknown;
        GITHUB_ISSUE_TOKEN?: string;
        GITHUB_TOKEN?: string;
        GITHUB_OWNER?: string;
        GITHUB_REPO?: string;
        MARKET_DATA_PROVIDER?: string;
        TWELVE_DATA_API_KEY?: string;
        COINGECKO_API_KEY?: string;
        COINGECKO_API_PLAN?: string;
        MARKET_QUOTE_STALE_MINUTES?: string;
        MARKET_QUOTE_CACHE_SECONDS?: string;
        LEGACY_OWNER_EMAIL?: string;
        CF_ACCESS_TEAM_DOMAIN?: string;
        /** Access Application AUD tag, or several comma-separated (production app + the previews-only Worker policy app). */
        CF_ACCESS_AUD?: string;
        /** Test-only principal injection (WP8) — see `src/middleware.ts`. Never set outside `.dev.vars`/CI. */
        TEST_AUTH_ENABLED?: string;
        DATA_ENCRYPTION_KEY?: string;
        DATA_ENCRYPTION_KEY_PREVIOUS?: string;
        DATA_ENCRYPTION_KEY_VERSION?: string;
      };
      /**
       * Populated by `src/middleware.ts` once a `Cf-Access-Jwt-Assertion`
       * header verifies successfully. Public demo navigation is the only
       * application request for which it may be absent.
       */
      principal?: AuthPrincipal;
    }
  }
}

export {};
