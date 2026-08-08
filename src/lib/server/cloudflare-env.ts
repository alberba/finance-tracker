import type { D1DatabaseLike } from "./d1-state";

export interface RuntimeEnv {
  finance_tracker_db?: D1DatabaseLike;
  /** v2 relational database (WP1) — Drizzle client factory in `src/db/client.ts`. */
  finance_tracker_db_v2?: D1DatabaseLike;
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
  /** Email of the reserved "legacy owner" user created by WP9's migration tool. */
  LEGACY_OWNER_EMAIL?: string;
  /** Cf-Access team domain (no scheme/path), e.g. `myteam.cloudflareaccess.com`. */
  CF_ACCESS_TEAM_DOMAIN?: string;
  /** Expected `aud` claim of the Cf-Access Application protecting this app. */
  CF_ACCESS_AUD?: string;
  /**
   * Feature flag gating auth enforcement (WP3). Defaults to **off** — when
   * unset or not `"true"`, `src/middleware.ts` still verifies and attaches
   * `Astro.locals.principal` on a best-effort basis, but never blocks a
   * request for a missing/invalid JWT. Flip to `"true"` only at cutover
   * (WP11), once every route consumes `locals.principal` instead of a
   * client-supplied namespace.
   */
  AUTH_ENFORCED?: string;
  /**
   * Test-only principal injection (WP8). When `"true"` **and**
   * `AUTH_ENFORCED !== "true"`, `src/middleware.ts` honors the
   * `X-Test-User-Email` header as a Cf-Access bypass, letting
   * `tests/e2e/fixtures.ts`/local dev provision a principal without a real
   * JWT. Must **never** be set in `wrangler.toml` `[vars]` or any deployed
   * environment — only in `.dev.vars` (gitignored) or ephemeral CI env vars.
   */
  TEST_AUTH_ENABLED?: string;
  /**
   * Base64-encoded AES-256 key (WP12) used by
   * `src/lib/server/crypto/data-encryption.ts` to encrypt/decrypt
   * `integration_credentials.ciphertext`. Required in any environment that
   * writes or reads credentials through that repository.
   */
  DATA_ENCRYPTION_KEY?: string;
  /**
   * Previous AES-256 key (base64), kept only long enough to decrypt rows
   * still encrypted under `DATA_ENCRYPTION_KEY_VERSION - 1` during a key
   * rotation window.
   */
  DATA_ENCRYPTION_KEY_PREVIOUS?: string;
  /** Version number of `DATA_ENCRYPTION_KEY`. Defaults to `1` when unset. */
  DATA_ENCRYPTION_KEY_VERSION?: string;
}

type LocalsWithRuntime = {
  runtime?: {
    env?: RuntimeEnv;
  };
};

export function getD1FromLocals(locals: App.Locals): D1DatabaseLike {
  const db = (locals as LocalsWithRuntime)?.runtime?.env?.finance_tracker_db;
  if (!db) {
    throw new Error("D1 binding 'finance_tracker_db' no está disponible en runtime.");
  }
  return db;
}

export function getRuntimeEnvFromLocals(locals: App.Locals): RuntimeEnv {
  const env = (locals as LocalsWithRuntime)?.runtime?.env;
  if (!env) {
    throw new Error("Runtime env no disponible en locals.runtime.env.");
  }
  return env;
}
