# Performance optimization report

Date: 2026-08-08

## Outcome

The dashboard now becomes usable 361 ms sooner under the benchmark profile. Startup JavaScript transfer fell by 75.71 kB, scripting time fell by 367.87 ms, and time spent in long tasks fell by 649 ms.

The improvement comes from two measured changes:

1. Only the active Vue section is mounted. The dashboard remains eager, while the other seven sections load on first navigation.
2. Sentry error reporting and browser tracing still initialize immediately, but Session Replay loads during browser idle time instead of on the startup critical path. This follows Sentry's supported late `addIntegration` pattern.

## Benchmark method

The benchmark is implemented in `scripts/benchmark-performance.mjs` and exposed as `pnpm benchmark:performance`.

Each result is the median of seven cold Chromium contexts against the production Cloudflare worker build with:

- 4x CPU slowdown
- 40 ms network latency
- 10 Mbps download and upload throughput
- service workers and browser cache disabled
- third-party requests blocked
- deterministic demo data

The benchmark captures navigation and paint timing, the first visible dashboard heading (`appReadyMs`), JavaScript resource sizes, Chrome scripting/task duration, and browser long tasks. Medians reduce the effect of process startup and local worker variance; all runs, including the slower first run, remain in the sample.

Reproduce it with:

```sh
SENTRY_AUTH_TOKEN='' pnpm build
pnpm exec wrangler dev dist/_worker.js/index.js \
  --assets dist \
  --local \
  --ip 127.0.0.1 \
  --port 4322 \
  --compatibility-flags nodejs_compat
pnpm benchmark:performance
pnpm benchmark:pages
```

## Before and after

| Metric                    |      Before |       After |     Change |
| ------------------------- | ----------: | ----------: | ---------: |
| Dashboard app-ready       |  1,179.4 ms |    818.3 ms | **-30.6%** |
| DOM content loaded        |    479.3 ms |    400.0 ms | **-16.5%** |
| Startup JS transferred    |   276.00 kB |   200.29 kB | **-27.4%** |
| Startup JS decoded        |   843.90 kB |   570.79 kB | **-32.4%** |
| JavaScript scripting time |   569.69 ms |   201.82 ms | **-64.6%** |
| Main-thread task time     | 1,757.26 ms | 1,061.20 ms | **-39.6%** |
| Long-task duration        |    1,449 ms |      800 ms | **-44.8%** |
| First contentful paint    |      224 ms |      240 ms |     +16 ms |
| Largest contentful paint  |      340 ms |      356 ms |     +16 ms |
| Startup JS requests       |           7 |          11 |         +4 |

The intentional tradeoff is four additional, smaller startup module requests. FCP and LCP each moved by one 16 ms frame, while interactivity and main-thread work improved substantially.

## Bundle evidence

| Production chunk            |    Before |     After |     Change |
| --------------------------- | --------: | --------: | ---------: |
| Vue workspace, raw          | 428.15 kB | 269.39 kB | **-37.1%** |
| Vue workspace, gzip         | 131.68 kB |  89.63 kB | **-31.9%** |
| Sentry startup client, raw  | 275.58 kB | 149.50 kB | **-45.8%** |
| Sentry startup client, gzip |  90.53 kB |  50.94 kB | **-43.7%** |

The seven deferred section chunks range from 4.70 kB to 49.24 kB raw. The 130.28 kB Replay chunk still loads after startup during an idle callback, so Replay capability is preserved without blocking the dashboard.

## Bottlenecks found

### Eager route sections

`FinanceWorkspace.vue` statically imported and mounted all eight sections. Hidden sections still initialized Pinia stores, financial view models, document listeners, intersection observers, forms, tables, and chart dependencies. This accounted for the oversized 428.15 kB workspace chunk and a large share of startup scripting.

### Eager Session Replay

`sentry.client.config.js` initialized `replayIntegration()` synchronously. Source-map inspection showed the initial Sentry route chunk contained Replay and browser instrumentation code and weighed 275.58 kB raw.

## Verification

- `pnpm check`: 0 errors, warnings, or hints
- `pnpm lint`: passed
- `pnpm test:unit`: 95 tests passed, 98.29% statement coverage in the covered finance core
- `pnpm build`: passed
- Targeted Playwright navigation/dashboard checks: 4 passed
- Wider section regression sample: 27 passed; 12 failed on existing date-sensitive fixtures, stale totals/DOM contracts, or brittle interaction helpers rather than the new loading boundary
- Delayed Replay chunk: confirmed to load after startup idle

Additional targeted tests exposed three more existing test/product expectation mismatches outside this optimization: a test submits the removed `enhancement` option, a sidebar test expects nine icons while eight sections are configured, and one modal test tries to navigate while a native modal dialog is still open and intercepting input.

## Remaining opportunities

The next largest startup cost is the eager dashboard itself, especially charts and shared financial-state code. A future pass could measure lazy Chart.js initialization and route-aware CSS loading, but those changes should be evaluated separately because they can trade faster startup for delayed chart rendering.

## Per-page pass (2026-11-17)

This pass targeted every page, not only the dashboard. `pnpm benchmark:pages` was added to
measure direct loads (`/movimientos`, `/presupuesto`, `/patrimonio`, `/inversion`,
`/objetivos`, `/configuracion`, `/datos`, `/login`, `/reportes`) and first navigation to each
section with the same throttling profile as the dashboard benchmark.

### What changed

- Chart.js now loads from an idle callback and only registers the line-chart pieces. The
  204 kB (69 kB gzip) chunk left the startup path; the dashboard canvas is drawn a few
  milliseconds later while the rest of the page is already interactive.
- `/login` skips the Better Auth `getSession` query when there is no session cookie, and the
  auth client loads on demand instead of during the first paint. The unit test that edited
  the recipient during an in-flight request now waits for the request to start (the import
  adds one microtask).
- The workspace is the only startup session lookup; the shell mirrors `syncStore.email` and
  resolves the session only when signing out. The auth client used for logout is dynamic, and
  `loadSession` shares an in-flight lookup for any other caller.
- Stock Events credential discovery moved from the global workspace mount to the Inversión
  section, and the reports badge refresh waits for an idle window (and is skipped on
  `/reportes`, which refreshes the list itself).
- `Subscriptions`, the non-default Inversión/Configuración tabs and the report detail/panel
  are separate chunks mounted on first use. Once visited they stay mounted, preserving
  unsaved state.
- Section prefetch starts after `load` and an idle window; it is skipped on `/reportes` and
  for Data Saver users. The sync age label updates every 30 s instead of 1 s.
- `buildMonthGroups` appends in place (O(n) instead of O(Σk²)), `yearCount` counts in one
  pass, and selected transactions/categories use sets/memoized lists.

### Before and after (clean A/B worktree, 5–9 runs each)

| Page / metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Dashboard app-ready | 1,081.8 ms | 949.2 ms | **-12.3%** |
| Dashboard startup JS decoded | 909.06 kB | 658.37 kB | **-27.6%** |
| Dashboard startup JS transferred | 329.23 kB | 243.37 kB | **-26.1%** |
| Dashboard scripting time | 234.49 ms | 205.46 ms | **-12.4%** |
| Dashboard main-thread task time | 938.66 ms | 732.30 ms | **-22.0%** |
| Dashboard long tasks | 499 ms | 335 ms | **-32.9%** |
| `/login` app-ready | 415.3 ms | 391.7 ms | **-5.7%** |
| `/login` JS decoded | 315.57 kB | 272.20 kB | **-13.7%** |
| `/reportes` app-ready | 871.9 ms | 829.8 ms | **-4.8%** |
| `/reportes` JS decoded | 1,128.14 kB | 672.62 kB | **-40.4%** |
| `/reportes` JS requests | 65 | 49 | **-24.6%** |
| `/inversion` direct app-ready | 1,188.1 ms | 970.2 ms | **-18.3%** |
| `/configuracion` direct app-ready | 967.1 ms | 898.3 ms | **-7.1%** |
| Direct sections JS decoded | 1,031–1,288 kB | 746–891 kB | **-27.7% to -38.1%** |
| First navigation: Inversión | 231.2 ms | 181.6 ms | **-21.5%** |
| First navigation: Configuración | 146.3 ms | 96.6 ms | **-34.0%** |

First contentful paint stayed flat (376 ms) and the dashboard LCP moved from 588 ms to
572 ms. Per-section navigation deltas of a few milliseconds are noise: the budget, wealth,
goals and data medians move by less than 4%.

The 204 kB Chart.js chunk still downloads when a chart first renders; only its position in the
timeline changed. The remaining direct-load cost is the eager dashboard bundled inside
`FinanceWorkspace`, which every `/[section]` route also imports.
