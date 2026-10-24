/**
 * Opciones de Sentry del servidor, compartidas por el Worker (`withSentry` en
 * `sentry.server.config.ts`) y por el destino Node (`initServerErrorTracking`),
 * para que el contrato de privacidad no pueda divergir entre los dos.
 */

const DENIED_HEADERS = ['forwarded', '-ip', 'remote-', 'via', '-user']

export function sentryServerOptions(dsn: string | undefined) {
  return {
    dsn,
    // Línea base de v10 (`sendDefaultPii: false`): en v11 cada categoría que
    // no se fija aquí se recoge por defecto.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: {
        request: { deny: DENIED_HEADERS },
        response: { deny: DENIED_HEADERS },
      },
      httpBodies: [],
      urlQueryParams: { deny: DENIED_HEADERS },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      graphQL: { document: false, variables: false },
    },
    tracesSampleRate: 0.1,
    // Los eventos llevan nuestros tags y la pila; el breadcrumb automático de la
    // integración `Console` guarda los argumentos crudos de cada `console.*`,
    // que pueden traer texto de la respuesta del proveedor.
    integrations: <T extends { name: string }>(defaults: T[]): T[] =>
      defaults.filter((integration) => integration.name !== 'Console'),
  }
}
