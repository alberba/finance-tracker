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
