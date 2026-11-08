# AGENTS.md

## Context

- Issues: use `gh` with GitHub Issues; read an issue with
  `gh issue view N --json title,body,labels,comments` (`--comments` prints nothing); read [issue-tracker](docs/agents/issue-tracker.md) for
  operations and the issue-comments gotcha.
- Triage: read [triage-labels](docs/agents/triage-labels.md) for the canonical roles and labels.
- Domain exploration: read [domain](docs/agents/domain.md) for vocabulary and ADRs.
- Sync changes or adding/changing a movement type: read [sync-v2](docs/architecture/sync-v2.md) for
  store-to-D1 field paths, the shared movement command conversion and the type checklist.
- UI or `/design`: two designs coexist during the «neón de garaje» migration
  ([ADR 0010](docs/adr/0010-migracion-con-convivencia-aislada.md)); which document rules depends on
  the tree. Code in `src/neon/` (new): [DESIGN.md](DESIGN.md) is authoritative (tokens, themes,
  fonts, responsive, mobile); never use Syne, DM Sans or DM Mono there. Code in `src/components/`
  and `src/styles/` (old, frozen, bug fixes only): [design-language](docs/architecture/design-language.md),
  which also says how to migrate a section. The new and the old tree never import each other
  (`pnpm lint` enforces it); shared code (`domain`, `lib`, `stores`…) imports neither.
- Frontend behavior: read [frontend](docs/architecture/frontend.md) for startup, navigation and section entry points.
- Run, log in locally or deploy: read [self-hosting](docs/operations/self-hosting.md) for Docker,
  SQLite and production on Oracle; [authentication](docs/operations/authentication.md) for Better Auth.
- Coding and review: [CODING_STANDARDS.md](CODING_STANDARDS.md) is authoritative, including the
  Standards axis of `/code-review`. Report conflicting narrative docs as drift.
- Setup, branches, commits and PRs: read [CONTRIBUTING.md](CONTRIBUTING.md).
- Adding or changing E2E cases, running E2E, CI or browser failures: read
  [playwright](docs/playwright.md).

## Execution

Use `pnpm`; discover commands in `package.json`.
During `/implement`, run typecheck and targeted tests often; run the full suite once at the end.
