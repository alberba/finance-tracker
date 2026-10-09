/// <reference types="vite-svg-loader" />

import type { AuthPrincipal } from './lib/server/auth/principal'

declare global {
  interface ImportMetaEnv {
    /**
     * Feature flag (WP7) gating the IndexedDB/outbox `/api/sync` client path.
     * Defaults to off (unset/anything but `"true"`/`"1"`) — see
     * `src/lib/client/feature-flags.ts`.
     */
    readonly PUBLIC_SYNC_V2?: string
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv
  }

  namespace App {
    interface Locals {
      /** Test-only binding injection; production uses `cloudflare:workers`. */
      runtimeEnv?: Omit<
        import('./lib/server/cloudflare-env').RuntimeEnv,
        'finance_tracker_db' | 'finance_tracker_db_v2'
      > & {
        finance_tracker_db?: unknown
        finance_tracker_db_v2?: unknown
      }
      /**
       * Populated by `src/middleware.ts` once a `Cf-Access-Jwt-Assertion`
       * header verifies successfully. Public demo navigation is the only
       * application request for which it may be absent.
       */
      principal?: AuthPrincipal
    }
  }
}

export {}
