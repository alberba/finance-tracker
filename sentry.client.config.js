import * as Sentry from '@sentry/astro'

Sentry.init({
  dsn: 'https://f69ab9e853e8908f49a260af8ed822d4@o4511755834884096.ingest.de.sentry.io/4511972407902288',
  // Línea base de v10 (`sendDefaultPii: false`): en v11 cada categoría que
  // no se fija aquí se recoge por defecto.
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: {
      request: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
      response: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
    },
    httpBodies: [],
    urlQueryParams: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
    genAI: { inputs: false, outputs: false },
    databaseQueryData: false,
    graphQL: { document: false, variables: false },
  },
  integrations: [Sentry.browserTracingIntegration()],
  // Define how likely traces are sampled. Adjust this value in production,
  // or use tracesSampler for greater control.
  tracesSampleRate: 0.1,
  // Financial screens are never recorded without an explicit consent flow.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
})
