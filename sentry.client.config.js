import * as Sentry from '@sentry/astro'

Sentry.init({
  dsn: 'https://f69ab9e853e8908f49a260af8ed822d4@o4511755834884096.ingest.de.sentry.io/4511972407902288',
  dataCollection: {
    userInfo: false,
    httpBodies: [],
  },
  sendDefaultPii: false,
  integrations: [Sentry.browserTracingIntegration()],
  // Enable logs to be sent to Sentry
  enableLogs: true,
  // Define how likely traces are sampled. Adjust this value in production,
  // or use tracesSampler for greater control.
  tracesSampleRate: 0.1,
  // Financial screens are never recorded without an explicit consent flow.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
})
