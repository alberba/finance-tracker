export * from 'authentication-external-fetch'
import { betterFetch as externalFetch } from 'authentication-external-fetch'
const endpoints = new Set([
  'https://github.com/login/oauth/access_token',
  'https://api.github.com/user',
  'https://api.github.com/user/emails',
  'https://oauth2.googleapis.com/token',
  'https://www.googleapis.com/oauth2/v3/certs',
])
export function betterFetch(url, options) {
  if (endpoints.has(String(url))) {
    const port = Number(import.meta.env.AUTH_TEST_PORT ?? 4466) + 1
    return externalFetch(
      `http://127.0.0.1:${port}/oauth?endpoint=${encodeURIComponent(String(url))}`,
      options,
    )
  }
  return externalFetch(url, options)
}
