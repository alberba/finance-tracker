import * as Sentry from '@sentry/cloudflare'
import handler from '@astrojs/cloudflare/entrypoints/server'
import { sentryServerOptions } from './src/lib/server/sentry-options'

/** Bindings this entry reads; the DSN lives in `wrangler.toml` `[vars]`. */
interface WorkerBindings {
  SENTRY_DSN?: string
}

// `@sentry/astro` cannot wrap the Worker with `@astrojs/cloudflare` v14 (its
// Vite transform still targets the pre-v13 virtual entry, getsentry#21901), so
// the Worker entry is wired by hand here — see `README.md`, "Sentry".
export default Sentry.withSentry<WorkerBindings>(
  (env) => sentryServerOptions(env.SENTRY_DSN),
  handler,
)
