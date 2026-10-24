---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

If the user passes a ticket reference, fetch it from the issue tracker and state its title before starting. If the reference is ambiguous, ask.

Before the first command, run `pnpm setup:worktree` if `node_modules` or `.dev.vars` is missing.

Call the Skill tool with "tdd" where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and `pnpm gate` once at the end. For E2E, run only the specs covering what you touched; CI runs the full browser suites.

Once done, call the Skill tool with "code-review" to review the work.

Commit your work to the current branch.
