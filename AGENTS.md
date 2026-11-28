# AGENTS.md

## Context

- Issues: use `gh` with GitHub Issues; read an issue with
  `gh issue view N --json title,body,labels,comments` (`--comments` prints nothing); read [issue-tracker](docs/agents/issue-tracker.md) for
  operations and the issue-comments gotcha.
- Triage: read [triage-labels](docs/agents/triage-labels.md) for the canonical roles and labels.
- Domain exploration: read [domain](docs/agents/domain.md) for vocabulary and ADRs.
- Sync changes or adding/changing a movement type: read [sync-v2](docs/architecture/sync-v2.md) for
  store-to-D1 field paths, the shared movement command conversion and the type checklist.
- UI or `/design`: [DESIGN.md](DESIGN.md) is authoritative (tokens, themes, fonts, responsive,
  mobile). The UI lives in `src/neon/`; shared code (`domain`, `lib`, `stores`…) never imports it
  (`bun run lint` enforces it).
- Frontend behavior: read [frontend](docs/architecture/frontend.md) for startup, navigation and section entry points.
- Run, log in locally or deploy: read [self-hosting](docs/operations/self-hosting.md) for
  `bun run dev:worktree`/`dev:account` (daily work, own data), Docker, SQLite and production on Oracle; [authentication](docs/operations/authentication.md) for Better Auth.
- Coding and review: [CODING_STANDARDS.md](CODING_STANDARDS.md) is authoritative, including the
  Standards axis of `/code-review`. Report conflicting narrative docs as drift.
- Tests (Vitest, Vue, Astro or Playwright): before writing, modifying or deleting one, read
  [TESTING_STANDARDS.md](TESTING_STANDARDS.md). It is authoritative for test rules; the narrative
  docs are `docs/testing.md` and `docs/playwright.md`.
- Setup, branches, commits and PRs: read [CONTRIBUTING.md](CONTRIBUTING.md).
- Adding or changing E2E cases, running E2E, CI or browser failures: read
  [playwright](docs/playwright.md).

## Execution

Use `bun` (`bun install`, `bun run <script>`, `bunx`); discover commands in `package.json`. Never `bun test`: it is Bun's own runner, not the `test` script.
During `/implement`, run typecheck and targeted tests often; the final verification is in
[TESTING_STANDARDS](TESTING_STANDARDS.md) › Ejecución.
