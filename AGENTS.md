# AGENTS.md

## Context

- Issues: use `gh` with GitHub Issues; read an issue with
  `gh issue view N --json title,body,labels,comments` (`--comments` prints nothing); read [issue-tracker](docs/agents/issue-tracker.md) for
  operations and the issue-comments gotcha.
- Triage: read [triage-labels](docs/agents/triage-labels.md) for the canonical roles and labels.
- Domain exploration: read [domain](docs/agents/domain.md) for vocabulary and ADRs.
- Sync changes or adding/changing a movement type: read [sync-v2](docs/architecture/sync-v2.md) for
  store-to-D1 field paths, the shared movement command conversion and the type checklist.
- UI or `/design`: read [design-language](docs/architecture/design-language.md) for v2 components
  and design rules.
- Frontend behavior: read [frontend](docs/architecture/frontend.md) for startup, navigation and section entry points.
- Run, log in locally or deploy: read [self-hosting](docs/operations/self-hosting.md) for Docker,
  SQLite and production on Oracle; [authentication](docs/operations/authentication.md) for Better Auth.
- Coding and review: [CODING_STANDARDS.md](CODING_STANDARDS.md) is authoritative, including the
  Standards axis of `/code-review`. Report conflicting narrative docs as drift.
- Setup, branches, commits and PRs: read [CONTRIBUTING.md](CONTRIBUTING.md).
- CI or browser failures, E2E runs and snapshot regeneration: read
  [playwright](docs/playwright.md).

## Execution

Use `pnpm`; discover commands in `package.json`.
During `/implement`, run typecheck and targeted tests often; run the full suite once at the end.

Visual E2E: inspect the diff image before calling it a flake. Faint text antialiasing is noise;
changed labels, tabs or dates are real diffs.
