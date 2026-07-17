#!/usr/bin/env node
/**
 * جرد أنظمة سبق من docs/systems/registry.json
 * الاستخدام: node scripts/systems-inventory.mjs [--json]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REGISTRY_PATH = path.join(ROOT, "docs/systems/registry.json");

function walkFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  const st = fs.statSync(dir);
  if (st.isFile()) {
    acc.push(dir);
    return acc;
  }
  if (!st.isDirectory()) return acc;
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name === "dist") continue;
    walkFiles(path.join(dir, name), acc);
  }
  return acc;
}

/** حوّل glob بسيط (**, *, ?) إلى RegExp على مسار نسبي بفواصل / */
function globToRegExp(glob) {
  let i = 0;
  let out = "^";
  while (i < glob.length) {
    if (glob.startsWith("**/", i)) {
      out += "(?:.*/)?";
      i += 3;
      continue;
    }
    if (glob[i] === "*" && glob[i + 1] === "*") {
      out += ".*";
      i += 2;
      continue;
    }
    const ch = glob[i];
    if (ch === "*") {
      out += "[^/]*";
    } else if (ch === "?") {
      out += "[^/]";
    } else if ("+.^${}()|[]\\".includes(ch)) {
      out += "\\" + ch;
    } else {
      out += ch;
    }
    i += 1;
  }
  out += "$";
  return new RegExp(out);
}

function matchGlob(relPosix, glob) {
  const normalizedGlob = glob.replace(/\\/g, "/");
  // مسار ملف مباشر بدون wildcard
  if (!/[*?]/.test(normalizedGlob)) {
    return relPosix === normalizedGlob || relPosix.startsWith(normalizedGlob.replace(/\/?$/, "/") );
  }
  return globToRegExp(normalizedGlob).test(relPosix);
}

function countForGlobs(globs) {
  const matched = new Set();
  for (const glob of globs) {
    const normalizedGlob = glob.replace(/\\/g, "/");
    const firstWild = normalizedGlob.search(/[*?]/);
    const literalPrefix =
      firstWild === -1
        ? normalizedGlob
        : normalizedGlob.slice(0, normalizedGlob.lastIndexOf("/", firstWild) + 1) || "";
    const startDir = path.join(ROOT, literalPrefix || ".");
    const files = walkFiles(startDir);
    for (const abs of files) {
      const rel = path.relative(ROOT, abs).split(path.sep).join("/");
      if (matchGlob(rel, normalizedGlob)) matched.add(rel);
    }
  }
  return { fileCount: matched.size, samplePaths: [...matched].slice(0, 8) };
}

function main() {
  const asJson = process.argv.includes("--json");
  const writeSnapshot = process.argv.includes("--write-snapshot");
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
  const systems = Array.isArray(registry.systems) ? registry.systems : [];

  const rows = systems.map((sys) => {
    const docAbs = path.join(ROOT, sys.docPath || "");
    const { fileCount, samplePaths } = countForGlobs(sys.pathGlobs || []);
    return {
      id: sys.id,
      nameAr: sys.nameAr,
      status: sys.status,
      category: sys.category,
      fileCount,
      docExists: Boolean(sys.docPath) && fs.existsSync(docAbs),
      docPath: sys.docPath,
      relatedDocs: sys.relatedDocs || [],
      aiFeatureKeys: sys.aiFeatureKeys || [],
      dashboardPath: sys.dashboardPath,
      samplePaths,
    };
  });

  if (writeSnapshot) {
    const snapshotPath = path.join(ROOT, "docs/systems/inventory-snapshot.json");
    const snapshot = {
      generatedAt: new Date().toISOString(),
      systems: rows.map((r) => ({
        id: r.id,
        fileCount: r.fileCount,
        samplePaths: r.samplePaths,
      })),
    };
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
    console.error(`كتب اللقطة: ${path.relative(ROOT, snapshotPath)}`);
  }

  if (asJson) {
    console.log(JSON.stringify({ updatedAt: registry.updatedAt, count: rows.length, systems: rows }, null, 2));
    return;
  }

  console.log(`كتالوج أنظمة سبق — ${rows.length} نظاماً (registry ${registry.updatedAt})\n`);
  console.log(
    [
      "id".padEnd(22),
      "files".padStart(6),
      "doc",
      "nameAr",
    ].join("  "),
  );
  console.log("-".repeat(72));
  for (const r of rows) {
    console.log(
      [
        String(r.id).padEnd(22),
        String(r.fileCount).padStart(6),
        r.docExists ? "✓" : "✗",
        r.nameAr,
      ].join("  "),
    );
  }
  const missingDocs = rows.filter((r) => !r.docExists);
  if (missingDocs.length) {
    console.log("\n⚠ أنظمة بلا SYSTEM.md:");
    for (const r of missingDocs) console.log(" -", r.id, r.docPath);
    process.exitCode = 1;
  }
}

main();
