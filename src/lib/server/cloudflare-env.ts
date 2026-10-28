import { env as cloudflareEnv } from 'cloudflare:workers'

export interface RuntimeEnv {
  BETTER_AUTH_URL?: string
  BETTER_AUTH_SECRET?: string
  RESEND_API_KEY?: string
  RESEND_FROM?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  GITHUB_CLIENT_ID?: string
  GITHUB_CLIENT_SECRET?: string
  /** Loopback-only external mail server for real Worker E2E. */
  TEST_RESEND_URL?: string
  /** v2 relational database (WP1) — Drizzle client factory in `src/db/client.ts`. */
  finance_tracker_db_v2?: unknown
  GITHUB_ISSUE_TOKEN?: string
  GITHUB_TOKEN?: string
  GITHUB_OWNER?: string
  GITHUB_REPO?: string
  /**
   * Login de la cuenta que publica las aclaraciones, para tokens de GitHub App
   * que no pueden llamar a `/user` (#340 [D1]). Opcional.
   */
  GITHUB_BOT_LOGIN?: string
  SENTRY_DSN?: string
  MARKET_DATA_PROVIDER?: string
  TWELVE_DATA_API_KEY?: string
  COINGECKO_API_KEY?: string
  COINGECKO_API_PLAN?: string
  MARKET_QUOTE_STALE_MINUTES?: string
  MARKET_QUOTE_CACHE_SECONDS?: string
  /**
   * Test-only principal injection. The middleware additionally requires a
   * loopback request origin, so a deployed flag cannot enable impersonation.
   */
  TEST_AUTH_ENABLED?: string
  /**
   * Base64-encoded AES-256 key (WP12) used by
   * `src/lib/server/crypto/data-encryption.ts` to encrypt/decrypt
   * `integration_credentials.ciphertext`. Required in any environment that
   * writes or reads credentials through that repository.
   */
  DATA_ENCRYPTION_KEY?: string
  /**
   * Previous AES-256 key (base64), kept only long enough to decrypt rows
   * still encrypted under `DATA_ENCRYPTION_KEY_VERSION - 1` during a key
   * rotation window.
   */
  DATA_ENCRYPTION_KEY_PREVIOUS?: string
  /** Version number of `DATA_ENCRYPTION_KEY`. Defaults to `1` when unset. */
  DATA_ENCRYPTION_KEY_VERSION?: string
  /** Trusted client-IP header behind a self-hosted proxy; defaults to `cf-connecting-ip`. */
  CLIENT_IP_HEADER?: string
  /** "true" answers every request with a 503 maintenance page (see `maintenance.ts`). */
  MAINTENANCE_MODE?: string
}

type LocalsWithTestRuntime = { runtimeEnv?: RuntimeEnv }

/**
 * Astro 6+ exposes Cloudflare bindings through `cloudflare:workers` rather
 * than `locals.runtime.env`. `runtimeEnv` is an explicit Vitest-only seam;
 * production request code never populates it.
 */
export function getRuntimeEnv(locals?: App.Locals): RuntimeEnv {
  return (locals as LocalsWithTestRuntime | undefined)?.runtimeEnv ?? (cloudflareEnv as RuntimeEnv)
}

export function getRuntimeEnvFromLocals(locals: App.Locals): RuntimeEnv {
  return getRuntimeEnv(locals)
}
