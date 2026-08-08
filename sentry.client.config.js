import * as Sentry from '@sentry/astro'

async function enableReplay() {
  const { replayIntegration } = await import('@sentry/browser')
  Sentry.getClient()?.addIntegration(replayIntegration())
}

function scheduleReplay() {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(() => void enableReplay(), { timeout: 5000 })
    return
  }
  window.setTimeout(() => void enableReplay(), 0)
}

Sentry.init({
  dsn: 'https://8557422dab61d50fd0c95814431f78f6@o4511755834884096.ingest.de.sentry.io/4511755846680656',
  dataCollection: {
    // To disable sending user data and HTTP bodies, uncomment the lines below. For more info visit:
    // https://docs.sentry.io/platforms/javascript/guides/astro/configuration/options/#dataCollection
    // userInfo: false,
    // httpBodies: [],
  },
  integrations: [Sentry.browserTracingIntegration()],
  // Enable logs to be sent to Sentry
  enableLogs: true,
  // Define how likely traces are sampled. Adjust this value in production,
  // or use tracesSampler for greater control.
  tracesSampleRate: 1.0,
  // This sets the sample rate at 10%. You may want to change it to 100% while in development and then sample at a lower rate in production.
  replaysSessionSampleRate: 0.1,
  // If you're not already sampling the entire session, change the sample rate to 100% when sampling sessions where errors occur.
  replaysOnErrorSampleRate: 1.0,
})

window.addEventListener('load', scheduleReplay, { once: true })
