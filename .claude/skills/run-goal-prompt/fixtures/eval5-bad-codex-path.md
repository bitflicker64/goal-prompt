```text
/goal Migrate the auth module across implementation, tests, and CI while keeping public behavior backward compatible for existing callers.

Source of truth:
- .codex/auth-migration/state.md

Scope: the auth module, its tests, and the CI configuration that builds and runs them; excludes unrelated modules, dependency upgrades, and public API changes.

Constraints:
- Continue until every applicable completion gate passes; record and defer a
  blocked item and its dependents behind independent unblocked work.
- Keep .codex/auth-migration/state.md current with the live plan, evidence,
  blockers, and next action so the work resumes across sessions.
- CI queues, slow pipelines, transient outages, and external waits are
  reprioritization signals, not completion or stop conditions.

Complete only when all applicable conditions are true:
1. The auth module is migrated across implementation, tests, and CI.
2. Public behavior is unchanged for existing callers, evidenced by the
   compatibility tests passing against the pre-migration contract.
3. All scoped tests and CI pass, with the run recorded in state.md.

Stop only if every remaining scoped task is blocked after bounded recovery and
reprioritization by:
- a required behavior change that conflicts with the compatibility constraint.
```

Grounded choices:
- One sidecar at the confirmed path holds live state; no separate plan/todo/progress files.
- The reviewer gate is kept: this changes production code, tests, and CI.
- Compatibility is gated on evidence rather than on an assertion.
- CI slowness is bound to reprioritization so it cannot end the run early.

ready
