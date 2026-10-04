# AGENTS.md

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `alberba/finance-tracker`, managed with the `gh` CLI. Read an issue with `gh issue view N --json title,body,comments` (`--comments` alone prints nothing). See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, each label named after its role. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at the repo root plus `docs/adr/`. See `docs/agents/domain.md`.

### Sync v2

Sync: the files a field crosses from store to D1 and back, and the three movement builders, are in `docs/architecture/sync-v2.md`.

### Coding standards

`CODING_STANDARDS.md` at the repo root is the canonical source for the Standards axis of
`/code-review`: the enforceable rules, consolidated. `CONTRIBUTING.md` covers the human workflow
(branches, Conventional Commits, PRs, CI gates).

The docs under `docs/` stay as the narrative behind those rules (`docs/architecture/frontend.md`,
`docs/testing.md`, `docs/playwright.md`); read them for the reasoning, review against
`CODING_STANDARDS.md`. If they disagree, `CODING_STANDARDS.md` wins and the drift is a bug.

Lint is enforced by tooling (`eslint.config.ts`), so don't review it by hand. Prettier
(`.prettierrc`) is not gated and much of the repo is unformatted: format only the files you touch,
by path.

## Commands

Run with `pnpm`. During `/implement`, typecheck and single test files run often; the full suite runs once at the end.

| Purpose                         | Command                                                                          |
| ------------------------------- | -------------------------------------------------------------------------------- |
| New worktree (`.dev.vars`, D1)  | `pnpm setup:worktree`                                                            |
| Typecheck                       | `pnpm check`                                                                     |
| Lint                            | `pnpm lint` (`pnpm lint:fix` to autofix)                                         |
| Tests (all three Vitest layers) | `pnpm test`                                                                      |
| Lint + typecheck + tests        | `pnpm gate`                                                                      |
| Tests, one layer                | `pnpm test:unit` / `pnpm test:component` / `pnpm test:integration`               |
| Coverage                        | `pnpm test:coverage`                                                             |
| E2E                             | `pnpm test:e2e` (excludes `@visual`); `pnpm test:e2e:smoke` for the smoke subset |
| Visual E2E, Linux snapshots     | `pnpm test:e2e:visual:linux` (needs Docker; `--update-snapshots` to regenerate)  |
| Build                           | `pnpm build`                                                                     |

Visual E2E: open the diff image before calling it a flake. Faint text antialiasing is noise; a changed label, tab or date is a real diff. Without Docker, regenerate snapshots from CI: see `docs/playwright.md`.
