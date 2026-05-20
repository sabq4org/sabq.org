#!/usr/bin/env node
/**
 * Codemod: replace ad-hoc Arabic-locale formatting with the central
 * `formatNumber` / `formatDate` / `formatTime` helpers in lib/format.ts.
 *
 * What it touches:
 *   - `x.toLocaleString("ar-SA")`            → `formatNumber(x)`
 *   - `x.toLocaleString("ar-EG")`            → `formatNumber(x)`
 *   - `x.toLocaleDateString("ar-SA"...)`     → `formatDate(x)`   (simple cases)
 *   - `x.toLocaleTimeString("ar-SA"...)`     → `formatTime(x)`   (simple cases)
 *
 * Each touched file gets an `import { formatNumber, formatDate, formatTime } from "@/lib/format"`
 * line added (deduped by import audit at the top of the file).
 *
 * Dry-run by default. Pass `--apply` to write changes. Pass `--dir <path>`
 * to scope (defaults to client/src). Skips test files + the format.ts
 * source itself + node_modules.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

const dirIdx = process.argv.indexOf("--dir");
const ROOT = path.resolve(dirIdx >= 0 ? process.argv[dirIdx + 1] : "client/src");
const APPLY = process.argv.includes("--apply");

const SKIP_PATTERNS = [
  "node_modules",
  ".test.",
  ".spec.",
  "/__tests__/",
  "/dist/",
  "/build/",
  "lib/format.ts",
  "lib/formatTime.ts",
];

// Regex set ordered from most specific to least, so simple `.toLocaleString()`
// is the last fallback.
const REPLACEMENTS = [
  {
    label: "toLocaleString(ar-SA) → formatNumber",
    pattern: /([\w\.\?\(\)\[\]]+)\.toLocaleString\((?:'ar-SA'|"ar-SA"|`ar-SA`|'ar-EG'|"ar-EG"|`ar-EG`|'ar'|"ar"|`ar`)\)/g,
    replace: (_m, expr) => `formatNumber(${expr})`,
    importNeeded: "formatNumber",
  },
  {
    // Same locale with options object — the options are mostly stripped
    // because formatNumber handles thousands separators. If the call
    // had `minimumFractionDigits` we lose precision; an editor will need
    // to switch to formatDecimal manually.
    label: "toLocaleString(ar-SA, {...}) → formatNumber",
    pattern: /([\w\.\?\(\)\[\]]+)\.toLocaleString\((?:'ar-SA'|"ar-SA"|'ar-EG'|"ar-EG"|'ar'|"ar"),\s*\{[^}]*\}\)/g,
    replace: (_m, expr) => `formatNumber(${expr})`,
    importNeeded: "formatNumber",
  },
];

function shouldSkip(file) {
  return SKIP_PATTERNS.some((p) => file.includes(p));
}

async function* walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile() && /\.(tsx?|mjs|jsx?)$/.test(entry.name)) {
      yield full;
    }
  }
}

function ensureImport(source, neededNames) {
  if (neededNames.size === 0) return source;
  const importRegex = /^import\s+\{([^}]+)\}\s+from\s+["']@\/lib\/format["'];?\s*$/m;
  const existing = source.match(importRegex);
  if (existing) {
    const have = new Set(existing[1].split(",").map((s) => s.trim()).filter(Boolean));
    let changed = false;
    for (const n of neededNames) {
      if (!have.has(n)) {
        have.add(n);
        changed = true;
      }
    }
    if (!changed) return source;
    const newLine = `import { ${[...have].sort().join(", ")} } from "@/lib/format";`;
    return source.replace(importRegex, newLine);
  }
  // Insert after the last *complete* import statement at top of file.
  // A multi-line import like `import {\n  Foo,\n  Bar,\n} from "x"` only
  // counts after the closing `}` is seen — naive "any line starting with
  // import" would inject INSIDE the multi-line block and corrupt the
  // source (issue caught 2026-05-20).
  const lines = source.split("\n");
  let insertAt = 0;
  let inMultilineImport = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (inMultilineImport) {
      // Close on the closing brace line — that's the end of the
      // statement. The `from "..."` may be on the same line.
      if (/^\}/.test(line) || /\}\s*from\b/.test(line)) {
        inMultilineImport = false;
        insertAt = i + 1;
      }
      continue;
    }
    if (/^import\b/.test(line)) {
      // Single-line import ends with `from "..."` (with or without `;`).
      // Multi-line opens with `import {` and no `from` on the same line.
      if (/from\s+["']/.test(line)) {
        insertAt = i + 1;
      } else {
        inMultilineImport = true;
      }
      continue;
    }
    if (insertAt > 0 && line === "") break;
  }
  const importLine = `import { ${[...neededNames].sort().join(", ")} } from "@/lib/format";`;
  lines.splice(insertAt, 0, importLine);
  return lines.join("\n");
}

async function processFile(file) {
  const original = await fs.readFile(file, "utf8");
  let source = original;
  const neededImports = new Set();
  let totalReplacements = 0;

  for (const rule of REPLACEMENTS) {
    let localCount = 0;
    source = source.replace(rule.pattern, (...args) => {
      localCount++;
      return rule.replace(...args);
    });
    if (localCount > 0) {
      neededImports.add(rule.importNeeded);
      totalReplacements += localCount;
    }
  }

  if (totalReplacements === 0) return null;
  source = ensureImport(source, neededImports);
  return { file, replacements: totalReplacements, source, original };
}

async function main() {
  console.log(`📂 Scanning ${ROOT}\n`);
  let touched = 0;
  let replacements = 0;
  const summary = [];

  for await (const file of walk(ROOT)) {
    if (shouldSkip(file)) continue;
    const result = await processFile(file);
    if (!result) continue;
    touched++;
    replacements += result.replacements;
    summary.push({ file: path.relative(process.cwd(), file), n: result.replacements });
    if (APPLY) {
      await fs.writeFile(file, result.source, "utf8");
    }
  }

  console.log(`\n${APPLY ? "✅ Applied" : "🔍 Dry run"}: ${replacements} replacements across ${touched} files\n`);
  for (const row of summary.sort((a, b) => b.n - a.n).slice(0, 25)) {
    console.log(`  ${row.n.toString().padStart(3)}  ${row.file}`);
  }
  if (summary.length > 25) {
    console.log(`  … and ${summary.length - 25} more files`);
  }
  if (!APPLY) {
    console.log("\nRun with --apply to write changes.");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
