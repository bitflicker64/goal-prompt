```text
/goal Update docs/getting-started.md so a new contributor can complete setup end to end.

Source of truth:
- .goal-task/docs-setup/state.md

Scope: docs/getting-started.md only; excludes code and dependency changes.

Constraints:
- Continue until every applicable completion gate passes.
- Independent review is required before completion.

Complete only when all applicable conditions are true:
1. docs/getting-started.md covers prerequisites, install, run, and verify.
2. `npm run docs:check` passes.
3. .goal-task/docs-setup/state.md records the final evidence.
4. An independent reviewer has approved the diff.

Stop only if the docs toolchain cannot run.
```

ready
