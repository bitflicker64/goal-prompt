```text
/goal Update docs/getting-started.md so a new contributor can complete setup end to end without asking for help.

Scope: docs/getting-started.md only; excludes code, dependencies, and other docs pages.

Constraints:
- Continue until every applicable completion gate passes; record and defer a
  blocked item and its dependents behind independent unblocked work.

Complete only when all applicable conditions are true:
1. docs/getting-started.md covers prerequisites, install, run, and verify, in order.
2. `npm run docs:check` passes, with the command output recorded.
3. Every command in the page has been executed as written and succeeds.

Stop only if every remaining scoped task is blocked after bounded recovery by:
- a setup step that cannot be completed with the documented toolchain.
```

Grounded choices:
- Scope is limited to the single confirmed file, so no sidecar state is needed.
- `npm run docs:check` is the confirmed validator and is the only gate you named.
- No independent reviewer gate: this is documentation-only with no behavior change.

ready
