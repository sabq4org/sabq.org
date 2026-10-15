---
name: sabq-bug-hunt
description: Read-only multi-agent bug hunt (find then adversarial verify) over one area of sabq.org; use on «صيد أخطاء», «افحص الثغرات», «bug hunt» for auth, payments, ads, API, etc.
---

# صيد الأخطاء متعدد الوكلاء (Sabq)

A scoped, read-only bug hunt: 5 finder agents, each on one narrow slice of the target area, and one skeptic per slice that tries to refute every finding. First run (2026-10-09, auth/RBAC/CSRF): 22 findings, 15 confirmed, about 1.3M tokens, about 10 minutes. It led to PR #1832.

The user asking for a hunt is the opt-in for the Workflow tool. Load the `workflow-authoring` skill before writing the script.

## 1. Scope (inline, before the workflow)
- Pick ONE area (auth, payments/subscriptions, native ads, publisher portal, mobile API, uploads, comments, etc.). If the user named none, pick the one he mentioned last and say which.
- Read `docs/systems/registry.json` and the area's `docs/systems/<area>/SYSTEM.md` when they exist.
- Grep the relevant files.
- Split the area into 5 slices, each listing concrete files and line ranges. Note the current `git rev-parse --short HEAD`.

## 2. Run the workflow
Use this shape. Pass `args: {sha}`.

```js
export const meta = {
  name: 'sabq-bug-hunt',
  description: 'Read-only bug hunt: 5 scoped finders, each followed by an adversarial verifier',
  phases: [{ title: 'Find' }, { title: 'Verify' }],
}
const COMMON = `You are auditing the sabq.org repository (cwd, commit ${args.sha}) for REAL bugs in <AREA>. STRICTLY READ-ONLY: no edits, no state-changing git, no server, no network, no database. Read code only.
Read <SYSTEM.md path> first for intended behaviour.
Report only concrete defects with a realistic trigger (<area-specific list: bypass, missing permission check, data leak, race, wrong money/ledger math, ...>). Skip style, naming, missing tests, and theoretical issues with no reachable path. Each finding needs exact file:line, the trigger (who sends what), and the impact. Zero findings is acceptable.`
const SLICES = [ /* 5 x { key, focus: 'files + what to check' } */ ]
// FINDINGS schema: findings[{title,file,line,severity,trigger,impact,evidence}], filesRead[]
// VERDICTS schema: verdicts[{title,real,severity,reason,fix}]
const results = await pipeline(
  SLICES,
  s => agent(`${COMMON}\n\nYour slice: ${s.focus}\nFollow calls into other files to confirm a path is reachable.`, { label: `find:${s.key}`, phase: 'Find', schema: FINDINGS }),
  (found, s) => !found || !found.findings.length ? { slice: s.key, findings: [], verdicts: [] } :
    agent(`${COMMON}\n\nYou are the SKEPTIC for slice "${s.key}". For EACH finding below, open the cited code and its call path (middleware order, callers, guards, env defaults) and try hard to REFUTE it. real=true only with a reachable trigger in production config (Railway API, SERVE_SPA=false behind Cloudflare Pages proxy, DB_DRIVER=pg, REDIS_URL set). If uncertain, real=false. Re-rate severity honestly.\n\nFindings:\n${JSON.stringify(found.findings, null, 2)}`, { label: `verify:${s.key}`, phase: 'Verify', schema: VERDICTS })
      .then(v => ({ slice: s.key, findings: found.findings, verdicts: v ? v.verdicts : [] })),
)
return results.filter(Boolean)
```

While it runs, keep the thread's status checklist current: finders running, then skeptics, then report.

## 3. Report
- Hand-verify the top findings in code yourself before calling them confirmed.
- Write `/mnt/project-files/<area>-bug-hunt/report.md` with:
  - a table of confirmed items ranked by severity (file:line, trigger, impact, minimal fix);
  - the rejected items, each with the reason;
  - any assumption about production settings that was not verified (for example cookie SameSite).
- Reply in Arabic, in simple language. Give the top 5 in one line each and attach the report. Ask «أصلح؟» once.
- Save a memory note with the area, the commit, the report path and the counts.

## 4. Fixing (only after «أصلح» / «نصلحها»)
- One branch and one PR, with one commit per fix plus unit tests under `tests/unit/`.
- Run `npm run check`, `npm run test:unit`, `npm run build:server` and eslint on the changed files before pushing.
- Update the area's SYSTEM.md and set `lastReviewed` in `docs/systems/registry.json`.
- Stop at the PR. Merge only on «ادمج».
- Corrections to existing data (scrubbing logs, stale rows) are NOT part of the PR:
  - give read-only counts and the exact SQL;
  - never run UPDATE/DELETE without his explicit word for that statement;
  - name the rollback (Neon point-in-time restore).
- After merge, confirm the new SHA on `https://api.sabq.org/api/version` and check `/health`.

## Rules
- The hunt is read-only on code and production. Never create test content on production.
- Never print or store secrets.
- One area per run. To cover more, run again with a new area rather than widening the slices.
