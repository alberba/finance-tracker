---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

A `/design` canvas (a claude.ai artifact link) is read with the Artifact tool. Its HTML artboards are large: grep or `sed -n` the artboard you need instead of reading the whole file.

Use /tdd where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end. Before the PR, `pnpm gate` plus `pnpm test:e2e:smoke` locally; the PR CI is quality only.

Once done, use /code-review to review the work.

Commit your work to the current branch.
