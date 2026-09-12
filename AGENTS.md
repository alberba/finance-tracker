# AGENTS.md

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `alberba/finance-tracker`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, each label named after its role. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at the repo root plus `docs/adr/`. See `docs/agents/domain.md`.

### Coding standards

`CODING_STANDARDS.md` at the repo root is the canonical source for the Standards axis of
`/code-review`: the enforceable rules, consolidated. `CONTRIBUTING.md` covers the human workflow
(branches, Conventional Commits, PRs, CI gates).

The docs under `docs/` stay as the narrative behind those rules (`docs/architecture/frontend.md`,
`docs/testing.md`, `docs/playwright.md`); read them for the reasoning, review against
`CODING_STANDARDS.md`. If they disagree, `CODING_STANDARDS.md` wins and the drift is a bug.

Formatting and lint are enforced by tooling (`.prettierrc`, `eslint.config.ts`), so don't review
them by hand.

## Commands

Run with `pnpm`. During `/implement`, typecheck and single test files run often; the full suite runs once at the end.

| Purpose                         | Command                                                                          |
| ------------------------------- | -------------------------------------------------------------------------------- |
| Typecheck                       | `pnpm check`                                                                     |
| Lint                            | `pnpm lint` (`pnpm lint:fix` to autofix)                                         |
| Tests (all three Vitest layers) | `pnpm test`                                                                      |
| Tests, one layer                | `pnpm test:unit` / `pnpm test:component` / `pnpm test:integration`               |
| Coverage                        | `pnpm test:coverage`                                                             |
| E2E                             | `pnpm test:e2e` (excludes `@visual`); `pnpm test:e2e:smoke` for the smoke subset |
| Build                           | `pnpm build`                                                                     |

Visual E2E (`pnpm test:e2e:visual`) is flaky by nature; treat a snapshot diff as a question, not a failure.
