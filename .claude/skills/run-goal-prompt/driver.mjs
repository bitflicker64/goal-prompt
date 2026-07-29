#!/usr/bin/env node
// Harness for goal-prompt, which is a prompt-only Claude Code skill: there is no
// binary to launch. "Running" it means installing it where Claude Code looks,
// invoking it on an eval prompt, and checking the reply against the contract in
// SKILL.md.
//
// This driver owns the parts a machine can decide (install, lint, grade). The
// invocation itself is done by the agent, which pastes an eval prompt into
// Claude Code and pipes the reply back into `grade`.
//
//   node .claude/skills/run-goal-prompt/driver.mjs <command>
//
//   install [--target DIR]   copy the skill to ~/.claude/skills/goal-prompt
//   lint                     static checks; no model, no network
//   evals [ID]               print eval prompt(s) verbatim, for pasting
//   grade ID FILE            check a captured reply against eval ID's gates
//   selftest                 grade the bundled fixtures; proves the grader works

import { readFileSync, writeFileSync, existsSync, mkdirSync, cpSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
// .claude/skills/run-goal-prompt -> repo root
const REPO = resolve(SKILL_DIR, "..", "..", "..");

const read = (p) => readFileSync(p, "utf8");
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;

// ---------------------------------------------------------------- helpers

// Rough token estimate. The skill's length contract is stated in tokens
// (~450 ordinary / ~700 complex); chars/4 is the usual English approximation
// and is only used to catch prompts that blow well past the limit.
const estTokens = (s) => Math.ceil(s.length / 4);

/** Extract ``` fenced blocks. Returns [{lang, body}]. */
function fences(md) {
  const out = [];
  const lines = md.split("\n");
  let open = null;
  let buf = [];
  for (const line of lines) {
    const m = /^\s*```(\w*)\s*$/.exec(line);
    if (m) {
      if (open === null) {
        open = m[1] || "";
        buf = [];
      } else {
        out.push({ lang: open, body: buf.join("\n") });
        open = null;
      }
      continue;
    }
    if (open !== null) buf.push(line);
  }
  return out;
}

/** Last non-empty line, lowercased and stripped of markdown emphasis/punctuation. */
function lastLine(md) {
  const lines = md.split("\n").map((l) => l.trim()).filter(Boolean);
  const last = lines[lines.length - 1] ?? "";
  return last.replace(/[*_`.#]/g, "").trim().toLowerCase();
}

/** The single block holding the rendered /goal prompt, if any. */
function goalBlocks(md) {
  return fences(md).filter((f) => /^\s*\/goal\b/m.test(f.body));
}

function loadEvals() {
  const p = join(REPO, "evals", "evals.json");
  if (!existsSync(p)) fail(`evals.json not found at ${p}`);
  return JSON.parse(read(p));
}

function fail(msg) {
  console.error(red(`error: ${msg}`));
  process.exit(2);
}

// ---------------------------------------------------------------- gates
//
// evals.json states its expectations in prose, for a human or a judge model to
// read. These are the subset a regex can decide, mapped from those expectations
// plus the hard rules in SKILL.md ("Length contract", "Final response").
//
// stage 1 = research/confirm, must NOT render a /goal   (evals 1-3)
// stage 2 = render the final prompt                     (evals 4-5)

const GATES = {
  1: { stage: 1 },
  2: { stage: 1 },
  3: { stage: 1 },
  // "ordinary documentation-only goal": no sidecar state, no reviewer gate.
  4: { stage: 2, maxLines: 25, maxTokens: 450, forbid: [/\.goal-task/i, /independent\s+review/i] },
  // "complex": durable state at an exact path, reviewer mandatory.
  5: { stage: 2, maxTokens: 700, require: [/\.goal-task\/auth-migration\/state\.md/i, /independent\s+review/i], forbid: [/\.codex\//i] },
};

function gradeStage1(md) {
  const checks = [];
  checks.push([
    "ends in `needs confirmation`",
    lastLine(md) === "needs confirmation",
    `last line was: ${JSON.stringify(lastLine(md))}`,
  ]);
  const gb = goalBlocks(md);
  checks.push([
    "renders no /goal prompt",
    gb.length === 0,
    `found ${gb.length} fenced block(s) containing /goal`,
  ]);
  checks.push([
    "presents a brief (outcome + scope + completion evidence)",
    /outcome/i.test(md) && /scope/i.test(md) && /(completion|evidence)/i.test(md),
    "missing one of: outcome, scope, completion evidence",
  ]);
  checks.push(["asks at least one question", /\?/.test(md), "no '?' found"]);
  return checks;
}

function gradeStage2(md, g) {
  const checks = [];
  checks.push([
    "ends in `ready`",
    lastLine(md) === "ready",
    `last line was: ${JSON.stringify(lastLine(md))}`,
  ]);

  const gb = goalBlocks(md);
  checks.push([
    "exactly one /goal code block",
    gb.length === 1,
    `found ${gb.length}`,
  ]);
  if (gb.length !== 1) return checks;

  const goal = gb[0].body;
  const lines = goal.split("\n").filter((l) => l.trim());
  const toks = estTokens(goal);

  checks.push([
    "has >=3 conjunctive completion gates",
    (goal.match(/^\s*\d+\.\s+/gm) || []).length >= 3,
    `found ${(goal.match(/^\s*\d+\.\s+/gm) || []).length} numbered gates`,
  ]);
  checks.push([
    "has an all-work-blocked stop condition",
    /stop only (if|when)/i.test(goal),
    "no 'Stop only if/when' clause",
  ]);
  checks.push([
    "declares scope",
    /scope/i.test(goal),
    "no scope line",
  ]);

  if (g.maxLines) {
    checks.push([
      `<= ${g.maxLines} non-empty lines`,
      lines.length <= g.maxLines,
      `${lines.length} lines`,
    ]);
  }
  if (g.maxTokens) {
    checks.push([
      `<= ~${g.maxTokens} tokens (est)`,
      toks <= g.maxTokens,
      `~${toks} tokens`,
    ]);
  }
  for (const re of g.require ?? []) {
    checks.push([`contains ${re}`, re.test(goal), "not found in the /goal block"]);
  }
  for (const re of g.forbid ?? []) {
    checks.push([`omits ${re}`, !re.test(goal), "present but should not be"]);
  }
  return checks;
}

function grade(id, md, { quiet = false } = {}) {
  const g = GATES[id];
  if (!g) fail(`no gates defined for eval ${id}`);
  const checks = g.stage === 1 ? gradeStage1(md) : gradeStage2(md, g);
  let ok = true;
  for (const [name, pass, detail] of checks) {
    if (!pass) ok = false;
    if (!quiet) {
      console.log(`  ${pass ? green("PASS") : red("FAIL")}  ${name}${pass ? "" : `  — ${detail}`}`);
    }
  }
  return ok;
}

// ---------------------------------------------------------------- commands

function cmdLint() {
  let ok = true;
  const say = (pass, msg, detail) => {
    if (!pass) ok = false;
    console.log(`  ${pass ? green("PASS") : red("FAIL")}  ${msg}${pass ? "" : `  — ${detail}`}`);
  };

  console.log(bold("frontmatter"));
  const skill = read(join(REPO, "SKILL.md"));
  const fm = /^---\n([\s\S]*?)\n---/.exec(skill);
  say(!!fm, "SKILL.md has YAML frontmatter", "no --- block at top");
  if (fm) {
    say(/^name:\s*goal-prompt\s*$/m.test(fm[1]), "name: goal-prompt", "name missing or mismatched");
    const d = /^description:\s*(.+)$/m.exec(fm[1]);
    say(!!d, "has a description", "no description:");
    // Claude Code scans the description to decide whether to auto-load.
    if (d) say(d[1].length <= 1024, "description <= 1024 chars", `${d[1].length} chars`);
  }

  console.log(bold("\nbundled references"));
  // Every references/*.md the body tells the agent to read must actually ship.
  const refs = [...skill.matchAll(/references\/([a-z0-9-]+\.md)/g)].map((m) => m[1]);
  for (const r of [...new Set(refs)]) {
    say(existsSync(join(REPO, "references", r)), `references/${r} exists`, "referenced by SKILL.md but missing");
  }

  console.log(bold("\nevals"));
  let evals;
  try {
    evals = loadEvals();
    say(true, "evals/evals.json parses", "");
  } catch (e) {
    say(false, "evals/evals.json parses", e.message);
    return ok;
  }
  say(Array.isArray(evals.evals) && evals.evals.length > 0, "has evals[]", "empty");
  const ids = evals.evals.map((e) => e.id);
  say(new Set(ids).size === ids.length, "eval ids unique", `${ids.join(",")}`);
  for (const e of evals.evals) {
    say(!!e.prompt && !!e.expected_output, `eval ${e.id} has prompt + expected_output`, "missing field");
    say(!!GATES[e.id], `eval ${e.id} has driver gates`, "add it to GATES in driver.mjs");
  }

  console.log(bold("\nCI parity"));
  // Keep the driver honest against what .github/workflows/validate.yml asserts.
  const wf = join(REPO, ".github", "workflows", "validate.yml");
  if (existsSync(wf)) {
    for (const m of read(wf).matchAll(/test -f ([^\s"]+)/g)) {
      const p = m[1].replace(/^"?\$HOME.*skills\/goal-prompt\//, "");
      if (p.startsWith("references/") || p.startsWith("evals/")) {
        say(existsSync(join(REPO, p)), `${p} exists (asserted by CI)`, "missing");
      }
    }
  } else {
    say(false, "validate.yml present", "workflow missing");
  }
  return ok;
}

function cmdInstall(args) {
  const ti = args.indexOf("--target");
  const target = ti !== -1 ? resolve(args[ti + 1]) : join(homedir(), ".claude", "skills", "goal-prompt");

  // Plain copy of exactly what the skill needs at runtime. The upstream
  // installer (`npx skills add`) also drags in README/LICENSE/assets — a 1.4 MB
  // PNG the agent will never read.
  const want = ["SKILL.md", "references", "evals", "agents"];
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  for (const w of want) {
    const src = join(REPO, w);
    if (existsSync(src)) cpSync(src, join(target, w), { recursive: true });
  }

  console.log(bold("installed"), "->", target);
  let ok = true;
  for (const f of ["SKILL.md", "references/scenarios.md", "references/long-goal-execution.md", "references/long-goal-learning.md", "references/fusion-notes.md"]) {
    const pass = existsSync(join(target, f));
    if (!pass) ok = false;
    console.log(`  ${pass ? green("PASS") : red("FAIL")}  ${f}`);
  }
  return ok;
}

function cmdEvals(args) {
  const evals = loadEvals();
  const want = args[0] ? Number(args[0]) : null;
  for (const e of evals.evals) {
    if (want && e.id !== want) continue;
    console.log(bold(`--- eval ${e.id} (stage ${GATES[e.id]?.stage ?? "?"}) ---`));
    console.log(e.prompt);
    console.log();
  }
}

function cmdGrade(args) {
  const [idRaw, file] = args;
  if (!idRaw || !file) fail("usage: grade ID FILE");
  const id = Number(idRaw);
  if (!existsSync(file)) fail(`no such file: ${file}`);
  console.log(bold(`grading eval ${id} (stage ${GATES[id]?.stage}) <- ${file}`));
  const ok = grade(id, read(file));
  console.log(ok ? green("\nRESULT: pass") : red("\nRESULT: fail"));
  return ok;
}

// Fixtures let the grader be trusted without spending a model call: a
// deliberately-wrong reply must fail, and a correct one must pass.
function cmdSelftest() {
  const dir = join(SKILL_DIR, "fixtures");
  const cases = [
    ["eval1-good.md", 1, true],
    ["eval1-bad-renders-goal.md", 1, false],
    ["eval4-good.md", 4, true],
    ["eval4-bad-sidecar.md", 4, false],
    ["eval5-good.md", 5, true],
    ["eval5-bad-codex-path.md", 5, false],
  ];
  let ok = true;
  for (const [f, id, expect] of cases) {
    const p = join(dir, f);
    if (!existsSync(p)) {
      console.log(`  ${red("FAIL")}  missing fixture ${f}`);
      ok = false;
      continue;
    }
    const got = grade(id, read(p), { quiet: true });
    const pass = got === expect;
    if (!pass) ok = false;
    console.log(`  ${pass ? green("PASS") : red("FAIL")}  ${f} graded ${got ? "pass" : "fail"} (expected ${expect ? "pass" : "fail"})`);
  }
  return ok;
}

// ---------------------------------------------------------------- main

const [cmd, ...rest] = process.argv.slice(2);
let ok = true;
switch (cmd) {
  case "lint":      ok = cmdLint(); break;
  case "install":   ok = cmdInstall(rest); break;
  case "evals":     cmdEvals(rest); break;
  case "grade":     ok = cmdGrade(rest); break;
  case "selftest":  ok = cmdSelftest(); break;
  default:
    console.log("usage: driver.mjs <install|lint|evals|grade|selftest>");
    process.exit(1);
}
process.exit(ok ? 0 : 1);
