import * as Sentry from '@sentry/cloudflare'
import handler from '@astrojs/cloudflare/entrypoints/server'

/** Bindings this entry reads; the DSN lives in `wrangler.toml` `[vars]`. */
interface WorkerBindings {
  SENTRY_DSN?: string
}

// `@sentry/astro` cannot wrap the Worker with `@astrojs/cloudflare` v14 (its
// Vite transform still targets the pre-v13 virtual entry, getsentry#21901), so
// the Worker entry is wired by hand here — see `README.md`, "Sentry".
export default Sentry.withSentry<WorkerBindings>(
  (env) => ({
    dsn: env.SENTRY_DSN,
    dataCollection: {
      userInfo: false,
      httpBodies: [],
    },
    sendDefaultPii: false,
    enableLogs: true,
    tracesSampleRate: 0.1,
    // Los eventos llevan nuestros tags y la pila; el breadcrumb automático de la
    // integración `Console` guarda los argumentos crudos de cada `console.*`,
    // que pueden traer texto de la respuesta del proveedor.
    integrations: (defaults) => defaults.filter((integration) => integration.name !== 'Console'),
  }),
  handler,
)
