/** Maintenance switch: while `MAINTENANCE_MODE` is "true" every request gets a 503. */

import type { RuntimeEnv } from './cloudflare-env'

const RETRY_AFTER_SECONDS = '3600'

const PAGE = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>En mantenimiento</title>
    <style>
      :root { color-scheme: light dark; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px;
        font: 16px/1.5 system-ui, sans-serif; }
      main { max-width: 28rem; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { margin: 0; opacity: 0.75; }
    </style>
  </head>
  <body>
    <main>
      <h1>En mantenimiento</h1>
      <p>Estamos actualizando la aplicación. Tus datos están a salvo; vuelve a intentarlo más tarde.</p>
    </main>
  </body>
</html>
`

export function isMaintenanceMode(env: RuntimeEnv | undefined): boolean {
  return env?.MAINTENANCE_MODE === 'true'
}

/** 503 for the whole app; API callers get JSON so a queued sync keeps retrying. */
export function maintenanceResponse(request: Request): Response {
  const headers = { 'Cache-Control': 'no-store', 'Retry-After': RETRY_AFTER_SECONDS }
  if (new URL(request.url).pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'La aplicación está en mantenimiento.' }), {
      status: 503,
      headers: { ...headers, 'Content-Type': 'application/json' },
    })
  }
  return new Response(PAGE, {
    status: 503,
    headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' },
  })
}
