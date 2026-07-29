---
name: run-goal-prompt
description: Run, test, install, and verify the goal-prompt skill in Claude Code. Use to exercise its two-stage behavior, run its evals, grade a rendered /goal prompt against the contract, or check a change to SKILL.md before shipping.
---

# Run goal-prompt

`goal-prompt` is a **prompt-only Claude Code skill**. There is no binary, no
server, no test suite — the repo is `SKILL.md` plus `references/` and
`evals/evals.json`. So "running" it means:

1. **install** it where Claude Code discovers skills;
2. **invoke** it on an eval prompt via the `Skill` tool;
3. **grade** the reply against the contract in `SKILL.md`.

Steps 1 and 3 are the driver's job. Step 2 is yours — you are the runtime.

> Paths below are relative to the repo root (`goal-prompt/`).
> The driver is `.claude/skills/run-goal-prompt/driver.mjs`.

**Prerequisites:** Node (any recent version — used `v25.9.0`). Nothing to
install; the driver has no dependencies and makes no network calls.

## Run (agent path)

```bash
node .claude/skills/run-goal-prompt/driver.mjs selftest
```

Start here. Grades six bundled fixtures — three that must pass, three that must
fail — and proves the grader still discriminates. Takes under a second, costs
nothing. If this fails, fix the driver before trusting any other result.

```bash
node .claude/skills/run-goal-prompt/driver.mjs lint
```

Static checks with no model in the loop: frontmatter shape, that every
`references/*.md` cited by `SKILL.md` actually ships, that `evals.json` parses
with unique ids, and that each eval has gates defined. Also re-asserts the file
existence checks from `.github/workflows/validate.yml`, so a drifting workflow
shows up here.

### Install it so Claude Code can see it

```bash
node .claude/skills/run-goal-prompt/driver.mjs install
```

Copies `SKILL.md`, `references/`, `evals/`, `agents/` to
`~/.claude/skills/goal-prompt/` (override with `--target DIR`). Claude Code
picks the skill up **within the same session** — a `system-reminder` announces
it a turn or two later, and `Skill(goal-prompt)` then works. Before that
announcement the call fails with `Unknown skill: goal-prompt`; that is a timing
artifact, not a bad install, so do a little other work and retry rather than
reinstalling.

### Drive one eval

Get the prompt:

```bash
node .claude/skills/run-goal-prompt/driver.mjs evals 4
```

Invoke the skill with that prompt as the argument to `Skill(goal-prompt)`, write
your reply verbatim to a file, then grade it:

```bash
node .claude/skills/run-goal-prompt/driver.mjs grade 4 /tmp/run4.md
```

Grading is per-eval, because the contract differs by stage:

| Eval | Stage | Gates |
|---|---|---|
| 1, 2, 3 | research/confirm | ends in `needs confirmation`; **renders no `/goal` block**; brief has outcome + scope + completion evidence; asks a question |
| 4 | render, ordinary | ends in `ready`; exactly one `/goal` block; ≥3 numbered gates; a stop clause; ≤25 lines; ≤~450 tokens; **no** `.goal-task`, **no** reviewer gate |
| 5 | render, complex | same core gates; ≤~700 tokens; **must** contain `.goal-task/auth-migration/state.md` and an independent-review gate; must not use a Codex-specific path |

Exit code is 0 on pass, 1 on fail, so this drops into CI as-is.

## What actually ran here

Installed to `~/.claude/skills/goal-prompt/`, then invoked `Skill(goal-prompt)`
live in Claude Code on three evals:

- **eval 2** (Stage 1) — named the draft's vague outcome and its single-gate
  completion problem, returned a brief with three material questions, rendered
  no `/goal`. Graded **pass**.
- **eval 4** (Stage 2, ordinary) — 14 non-empty lines, ~292 est tokens, no
  sidecar, no reviewer gate. Graded **pass**.
- **eval 5** (Stage 2, complex) — 26 lines, ~444 est tokens, sidecar at the
  confirmed path, reviewer gate present. Graded **pass**.

Eval 5's output is kept as `fixtures/eval5-good.md`.

## Gotchas

- **Quoting the user's draft in a fenced block fails Stage 1.** Eval 2 hands you
  a bad `/goal` to critique. Put it in a ```` ```text ```` block and the
  "renders no `/goal` prompt" gate trips — the grader cannot distinguish a
  quoted draft from a rendered one, and arguably neither can the user. Quote it
  inline with backticks. Verified: `fixtures/` has no fenced-draft case because
  the fenced variant graded **fail** while the inline one graded **pass**.
- **`ready` and `needs confirmation` must be the last line, alone.** The grader
  strips `*_`` `.#` and lowercases, so `**ready**` is fine, but a trailing
  "Let me know if you want changes!" fails. The skill's own "Final response"
  section requires this too — it is a real contract, not a grader quirk.
- **The upstream installer ships 1.4 MB the agent never reads.**
  `npx skills@1.5.20 add . -g -a codex -a claude-code -y --copy` (what
  `.github/workflows/validate.yml` runs) copies the whole repo including
  `assets/goal-prompt-overview-en.png` and `.github/`. It works and installs to
  both `~/.agents/skills/` and `~/.claude/skills/`, but `driver.mjs install`
  copies only the four runtime dirs — 48K instead.
- **`references/` must travel with `SKILL.md`.** Step 3 of the skill tells the
  agent to read `references/scenarios.md` at runtime. A copy that drops that
  directory loads and silently degrades. `lint` checks every reference cited in
  the body.
- **CI validates that `evals.json` parses; it never runs the evals.** That gap is
  the reason this driver exists. Passing `validate.yml` says nothing about
  whether the skill still behaves.
- **Token counts are `chars/4` estimates**, not a real tokenizer. They catch a
  prompt that blows past the limit; do not treat 445 vs 450 as meaningful.
- **The repo also ships a Codex entrypoint** (`agents/openai.yaml`,
  `$goal-prompt` invocation). This harness is Claude Code only. The eval prompts
  in `evals.json` say `$goal-prompt`; drop that token when passing them to
  `Skill(goal-prompt)`, since it is Codex invocation syntax.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Unknown skill: goal-prompt` right after install | Discovery is async. Do another tool call or two, then retry — do not reinstall. |
| `Cannot find module .../driver.mjs` | The shell reset `cwd` to the parent dir. Use the absolute path, or `cd` into the repo in the same command. |
| `grade` fails "exactly one /goal code block — found 0" on a Stage 2 reply | The reply explained the goal instead of rendering it, or used indented-code instead of a fence. The grader only sees ``` fences. |
| `lint` fails "eval N has driver gates" | A new eval was added to `evals.json`. Add its id to `GATES` in `driver.mjs`. |
| `selftest` fails after editing the repo's `SKILL.md` | Expected when the contract changes. Update the fixtures and gates together — that is the point of the fixtures. |
