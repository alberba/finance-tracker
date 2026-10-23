import { readFileSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'

// Exercise the installed patch; its handler is private to the pinned plugin.
const source = readFileSync(
  resolve(
    realpathSync('node_modules/@astrojs/cloudflare'),
    '../../@cloudflare/vite-plugin/dist/index.mjs',
  ),
  'utf8',
)
const handlerSource = source.slice(
  source.indexOf('function createRequestHandler(handler)'),
  source.indexOf('function satisfiesMinimumViteVersion'),
)

async function dispatch(method: string, failures: Error[]) {
  const handler = vi.fn(async () => {
    const error = failures.shift()
    if (error) throw error
    return new Response('ok')
  })
  const next = vi.fn()
  const sendResponse = vi.fn()
  const createHandler = runInNewContext(`(${handlerSource})`, {
    getForwardedProto: () => undefined,
    createRequestForIncomingMessage: () => new Request('http://localhost/', { method }),
    toMiniflareRequest: (request: Request) => request,
    warnIfQuickTunnelSseResponse: () => {},
    sendResponse,
  })
  await createHandler(handler)({ method, httpVersionMajor: 1 }, {}, next)
  return { handler, next, sendResponse }
}

const socketError = () => new Error('fetch failed', { cause: { code: 'ECONNRESET' } })

it.each(['GET', 'HEAD'])('retries a disconnected %s once', async (method) => {
  const { handler, next, sendResponse } = await dispatch(method, [socketError()])
  expect(handler).toHaveBeenCalledTimes(2)
  expect(next).not.toHaveBeenCalled()
  expect(sendResponse).toHaveBeenCalledOnce()
})

it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('does not replay a disconnected %s', async (method) => {
  const error = socketError()
  const { handler, next, sendResponse } = await dispatch(method, [error])
  expect(handler).toHaveBeenCalledOnce()
  expect(next).toHaveBeenCalledWith(error)
  expect(sendResponse).not.toHaveBeenCalled()
})

it('propagates a second disconnect instead of retrying indefinitely', async () => {
  const error = socketError()
  const { handler, next } = await dispatch('GET', [socketError(), error])
  expect(handler).toHaveBeenCalledTimes(2)
  expect(next).toHaveBeenCalledWith(error)
})

it('does not retry application errors', async () => {
  const error = new Error('invalid request')
  const { handler, next } = await dispatch('GET', [error])
  expect(handler).toHaveBeenCalledOnce()
  expect(next).toHaveBeenCalledWith(error)
})
