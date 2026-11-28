/**
 * Per-page performance benchmark.
 *
 * The dashboard benchmark (`benchmark-performance.mjs`) answers "how fast does
 * the app start?". This one answers "how fast is each page/section once the app
 * is running?" and uses the same throttling profile, cold contexts and demo
 * data so both reports are comparable.
 *
 * Usage:
 *   BENCHMARK_BASE_URL=http://127.0.0.1:4322 bun run benchmark:pages
 *
 * A cold context is created per iteration. The dashboard loads first, then the
 * sections are opened in order; each section is measured on its first visit so
 * its chunk is not cached yet. `/login` and `/reportes` are measured as direct
 * page loads.
 */

import { chromium } from '@playwright/test'

const baseUrl = process.env.BENCHMARK_BASE_URL || 'http://127.0.0.1:4322'
const iterations = Number(process.env.BENCHMARK_ITERATIONS || 5)
const cpuSlowdownRate = Number(process.env.BENCHMARK_CPU_RATE || 4)
const latencyMs = Number(process.env.BENCHMARK_LATENCY_MS || 40)
const throughputMbps = Number(process.env.BENCHMARK_THROUGHPUT_MBPS || 10)

const sections = [
  ['transactions', 'Movimientos', '/movimientos'],
  ['budget', 'Presupuesto', '/presupuesto'],
  ['wealth', 'Patrimonio', '/patrimonio'],
  ['investment', 'Inversión', '/inversion'],
  ['goals', 'Objetivos', '/objetivos'],
  ['settings', 'Configuración', '/configuracion'],
  ['data', 'Datos', '/datos'],
]

function median(values) {
  const sorted = values.toSorted((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

function round(value) {
  return Math.round(value * 100) / 100
}

function summarize(runs) {
  const metricNames = Object.keys(runs[0]).filter(
    (metricName) => typeof runs[0][metricName] === 'number',
  )
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

    const recordAppReady = (selector) => {
      const target = document.querySelector(selector)
      if (!metrics.appReadyMs && target?.getClientRects().length) {
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

    window.__pageBenchmark = metrics
    window.__markPageReady = recordAppReady
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

async function twoFrames(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      }),
  )
}

async function readScriptTotals(page) {
  return page.evaluate(() => {
    const scripts = performance
      .getEntriesByType('resource')
      .filter((entry) => entry.initiatorType === 'script')
    return {
      jsDecodedKb: scripts.reduce((total, entry) => total + entry.decodedBodySize, 0) / 1024,
      jsRequestCount: scripts.length,
      jsTransferKb: scripts.reduce((total, entry) => total + entry.transferSize, 0) / 1024,
      longTaskCount: window.__pageBenchmark?.longTaskCount || 0,
      longTaskDurationMs: window.__pageBenchmark?.longTaskDurationMs || 0,
    }
  })
}

async function readMetrics(page, session) {
  const client = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0]
    const firstContentfulPaint = performance.getEntriesByName('first-contentful-paint').at(-1)
    return {
      appReadyMs: window.__pageBenchmark?.appReadyMs || 0,
      domContentLoadedMs: navigation?.domContentLoadedEventEnd || 0,
      firstContentfulPaintMs: firstContentfulPaint?.startTime || 0,
      largestContentfulPaintMs: window.__pageBenchmark?.largestContentfulPaintMs || 0,
    }
  })
  const performanceMetrics = await session.send('Performance.getMetrics')
  const browserMetrics = Object.fromEntries(
    performanceMetrics.metrics.map(({ name, value }) => [name, value]),
  )
  return {
    ...client,
    ...(await readScriptTotals(page)),
    scriptDurationMs: (browserMetrics.ScriptDuration || 0) * 1000,
    taskDurationMs: (browserMetrics.TaskDuration || 0) * 1000,
  }
}

async function measureDirectPage(context, path, selector) {
  const page = await context.newPage()
  await installPerformanceObservers(page)
  const session = await configureThrottling(page)

  await page.goto(`${baseUrl}${path}`, { waitUntil: 'domcontentloaded' })
  await page.locator(selector).waitFor({ state: 'visible' })
  await page.evaluate((target) => window.__markPageReady(target), selector)
  await twoFrames(page)

  const metrics = await readMetrics(page, session)
  await page.close()
  return metrics
}

async function measureDashboardAndSections(context) {
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
  await page.evaluate(() => window.__markPageReady('#dashboard-title'))
  await twoFrames(page)
  const dashboard = await readMetrics(page, session)

  const sectionMetrics = {}
  for (const [id, label] of sections) {
    const before = await readScriptTotals(page)
    const beforeBrowser = Object.fromEntries(
      (await session.send('Performance.getMetrics')).metrics.map(({ name, value }) => [
        name,
        value,
      ]),
    )
    const clickStart = await page.evaluate(() => performance.now())
    await page.locator(`[data-nav-item][data-section="${id}"]`).first().click()
    await page.locator(`#${id}-title`).waitFor({ state: 'visible' })
    await twoFrames(page)
    const sectionStart = await page.evaluate(() => performance.now())
    const after = await readScriptTotals(page)
    const performanceMetrics = await session.send('Performance.getMetrics')
    const browserMetrics = Object.fromEntries(
      performanceMetrics.metrics.map(({ name, value }) => [name, value]),
    )
    sectionMetrics[id] = {
      navigationMs: round(sectionStart - clickStart),
      jsDecodedKb: round(after.jsDecodedKb - before.jsDecodedKb),
      jsRequestCount: after.jsRequestCount - before.jsRequestCount,
      jsTransferKb: round(after.jsTransferKb - before.jsTransferKb),
      longTaskCount: after.longTaskCount - before.longTaskCount,
      longTaskDurationMs: round(after.longTaskDurationMs - before.longTaskDurationMs),
      label,
      scriptDurationMs: round(
        ((browserMetrics.ScriptDuration || 0) - (beforeBrowser.ScriptDuration || 0)) * 1000,
      ),
      taskDurationMs: round(
        ((browserMetrics.TaskDuration || 0) - (beforeBrowser.TaskDuration || 0)) * 1000,
      ),
    }
  }

  await page.close()
  return { dashboard, sections: sectionMetrics }
}

const browser = await chromium.launch()
const runs = []
const pageRuns = { login: [], reports: [] }
const directSectionRuns = Object.fromEntries(sections.map(([id]) => [id, []]))

try {
  for (let index = 0; index < iterations; index += 1) {
    const context = await browser.newContext({ serviceWorkers: 'block' })
    runs.push(await measureDashboardAndSections(context))
    pageRuns.login.push(await measureDirectPage(context, '/login', '#access-heading'))
    pageRuns.reports.push(await measureDirectPage(context, '/reportes?demo=1', '#reports-title'))
    await context.close()

    for (const [id, , route] of sections) {
      const sectionContext = await browser.newContext({ serviceWorkers: 'block' })
      directSectionRuns[id].push(
        await measureDirectPage(sectionContext, `${route}?demo=1`, `#${id}-title`),
      )
      await sectionContext.close()
    }
  }
} finally {
  await browser.close()
}

const sectionIds = Object.keys(runs[0].sections)
const output = {
  environment: {
    baseUrl,
    cpuSlowdownRate,
    iterations,
    latencyMs,
    throughputMbps,
  },
  dashboard: summarize(runs.map((run) => run.dashboard)),
  sections: Object.fromEntries(
    sectionIds.map((id) => [id, summarize(runs.map((run) => run.sections[id]))]),
  ),
  directSections: Object.fromEntries(
    sectionIds.map((id) => [id, summarize(directSectionRuns[id])]),
  ),
  login: summarize(pageRuns.login),
  reports: summarize(pageRuns.reports),
}

console.log(JSON.stringify(output, null, 2))
