import * as Sentry from "@sentry/astro";

Sentry.init({
  dsn: "https://8557422dab61d50fd0c95814431f78f6@o4511755834884096.ingest.de.sentry.io/4511755846680656",
  dataCollection: {
    userInfo: false,
    httpBodies: [],
  },
  sendDefaultPii: false,
  // Enable logs to be sent to Sentry
  enableLogs: true,
  // Define how likely traces are sampled. Adjust this value in production,
  // or use tracesSampler for greater control.
  tracesSampleRate: 0.1,
});
