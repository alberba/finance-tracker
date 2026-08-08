import { chromium } from '@playwright/test'

const baseUrl = process.env.BENCHMARK_BASE_URL || 'http://127.0.0.1:4322'
const iterations = Number(process.env.BENCHMARK_ITERATIONS || 7)
const cpuSlowdownRate = Number(process.env.BENCHMARK_CPU_RATE || 4)
const latencyMs = Number(process.env.BENCHMARK_LATENCY_MS || 40)
const throughputMbps = Number(process.env.BENCHMARK_THROUGHPUT_MBPS || 10)

function median(values) {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

function round(value) {
  return Math.round(value * 100) / 100
}

function summarize(runs) {
  const metricNames = Object.keys(runs[0])
  return Object.fromEntries(
    metricNames.map((metricName) => [
      metricName,
      round(median(runs.map((run) => run[metricName]))),
    ]),
  )
}

async function installPerformanceObservers(page) {
  await page.addInitScript(() => {
    const metrics = {
      appReadyMs: 0,
      largestContentfulPaintMs: 0,
      longTaskCount: 0,
      longTaskDurationMs: 0,
    }

    const recordAppReady = () => {
      const heading = document.querySelector('#dashboard-title')
      if (!metrics.appReadyMs && heading?.getClientRects().length) {
        metrics.appReadyMs = performance.now()
      }
    }

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        metrics.longTaskCount += 1
        metrics.longTaskDurationMs += entry.duration
      }
    }).observe({ type: 'longtask', buffered: true })

    new PerformanceObserver((list) => {
      const entries = list.getEntries()
      metrics.largestContentfulPaintMs = entries.at(-1)?.startTime || 0
    }).observe({ type: 'largest-contentful-paint', buffered: true })

    new MutationObserver(recordAppReady).observe(document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    })
    document.addEventListener('DOMContentLoaded', recordAppReady, { once: true })

    const benchmarkWindow = /** @type {Window & { __performanceBenchmark: typeof metrics }} */ (
      window
    )
    benchmarkWindow.__performanceBenchmark = metrics
  })
}

async function configureThrottling(page) {
  const session = await page.context().newCDPSession(page)
  const bytesPerSecond = (throughputMbps * 1_000_000) / 8

  await session.send('Network.enable')
  await session.send('Performance.enable')
  await session.send('Network.setCacheDisabled', { cacheDisabled: true })
  await session.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: latencyMs,
    downloadThroughput: bytesPerSecond,
    uploadThroughput: bytesPerSecond,
  })
  await session.send('Emulation.setCPUThrottlingRate', { rate: cpuSlowdownRate })

  return session
}

async function measureRun(browser) {
  const context = await browser.newContext({ serviceWorkers: 'block' })
  const page = await context.newPage()
  await page.route('**/*', async (route) => {
    const requestUrl = new URL(route.request().url())
    if (requestUrl.origin === new URL(baseUrl).origin) {
      await route.continue()
      return
    }
    await route.abort()
  })
  await installPerformanceObservers(page)
  const session = await configureThrottling(page)

  await page.goto(`${baseUrl}/?demo=1`, { waitUntil: 'domcontentloaded' })
  await page.locator('#dashboard-title').waitFor({ state: 'visible' })
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      }),
  )

  const clientMetrics = await page.evaluate(() => {
    const benchmarkWindow = /** @type {Window & { __performanceBenchmark: {
     *   appReadyMs: number
     *   largestContentfulPaintMs: number
     *   longTaskCount: number
     *   longTaskDurationMs: number
     * } }} */ (window)
    const navigation = performance.getEntriesByType('navigation')[0]
    const firstContentfulPaint = performance.getEntriesByName('first-contentful-paint').at(-1)
    const scripts = performance
      .getEntriesByType('resource')
      .filter((entry) => entry.initiatorType === 'script')

    return {
      appReadyMs: benchmarkWindow.__performanceBenchmark.appReadyMs,
      domContentLoadedMs: navigation.domContentLoadedEventEnd,
      firstContentfulPaintMs: firstContentfulPaint?.startTime || 0,
      largestContentfulPaintMs: benchmarkWindow.__performanceBenchmark.largestContentfulPaintMs,
      jsDecodedKb: scripts.reduce((total, entry) => total + entry.decodedBodySize, 0) / 1024,
      jsRequestCount: scripts.length,
      jsTransferKb: scripts.reduce((total, entry) => total + entry.transferSize, 0) / 1024,
      longTaskCount: benchmarkWindow.__performanceBenchmark.longTaskCount,
      longTaskDurationMs: benchmarkWindow.__performanceBenchmark.longTaskDurationMs,
    }
  })
  const performanceMetrics = await session.send('Performance.getMetrics')
  const browserMetrics = Object.fromEntries(
    performanceMetrics.metrics.map(({ name, value }) => [name, value]),
  )

  await context.close()
  return {
    ...clientMetrics,
    scriptDurationMs: (browserMetrics.ScriptDuration || 0) * 1000,
    taskDurationMs: (browserMetrics.TaskDuration || 0) * 1000,
  }
}

const browser = await chromium.launch()
const runs = []

try {
  for (let index = 0; index < iterations; index += 1) {
    runs.push(await measureRun(browser))
  }
} finally {
  await browser.close()
}

console.log(
  JSON.stringify(
    {
      environment: {
        baseUrl,
        cpuSlowdownRate,
        iterations,
        latencyMs,
        throughputMbps,
      },
      median: summarize(runs),
      runs: runs.map((run) =>
        Object.fromEntries(Object.entries(run).map(([name, value]) => [name, round(value)])),
      ),
    },
    null,
    2,
  ),
)
