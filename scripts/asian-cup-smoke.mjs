#!/usr/bin/env node

const origin = (process.env.ASIAN_CUP_API_ORIGIN || "https://api.sabq.org").replace(/\/$/, "");
const timeoutMs = Number(process.env.ASIAN_CUP_SMOKE_TIMEOUT_MS || 15_000);

const checks = [
  ["overview", "/api/asian-cup/overview", (x) => Number.isInteger(x.teamsCount) && Array.isArray(x.venues)],
  ["fixtures", "/api/asian-cup/fixtures", (x) => Array.isArray(x.fixtures)],
  ["standings", "/api/asian-cup/standings", (x) => Array.isArray(x.groups)],
  ["teams", "/api/asian-cup/teams", (x) => Array.isArray(x.teams)],
  ["scorers", "/api/asian-cup/scorers", (x) => Array.isArray(x.scorers)],
  ["bracket", "/api/asian-cup/bracket", (x) => Array.isArray(x.rounds)],
];

let failed = false;
for (const [name, path, validate] of checks) {
  const started = Date.now();
  try {
    const response = await fetch(`${origin}${path}`, {
      headers: { Accept: "application/json", "Accept-Language": "ar" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!validate(body)) throw new Error("contract mismatch");
    process.stdout.write(`PASS ${name} ${Date.now() - started}ms\n`);
  } catch (error) {
    failed = true;
    process.stderr.write(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

if (failed) process.exit(1);
