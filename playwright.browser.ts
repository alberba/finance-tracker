// Local runs use Chromium in CI's Linux image while the app and test runner keep
// the host's Node/native addons. No connection override in CI.
export const browserConnectionOptions = process.env.PLAYWRIGHT_WS_ENDPOINT
  ? { wsEndpoint: process.env.PLAYWRIGHT_WS_ENDPOINT, exposeNetwork: '<loopback>' }
  : undefined
