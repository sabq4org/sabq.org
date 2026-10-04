#!/usr/bin/env node
/**
 * بوابة فحص الحزم في CI: تفشل على أي ثغرة high/critical في حزم الإنتاج،
 * إلا ما ورد في .github/npm-audit-allowlist.json بسبب موثّق وتاريخ انتهاء.
 * الاستثناء المنتهي يُفشل الفحص حتى يُراجَع، فلا يتحول إلى تجاهل دائم.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const BLOCKING = new Set(["high", "critical"]);

let raw;
try {
  raw = execFileSync("npm", ["audit", "--omit=dev", "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
} catch (e) {
  // npm audit يخرج بـ 1 عند وجود ثغرات؛ الناتج JSON في stdout
  raw = e.stdout;
  if (!raw) throw e;
}
const report = JSON.parse(raw);
if (report.error) {
  console.error("npm audit failed:", report.error.summary ?? report.error);
  process.exit(2);
}

const allowlist = JSON.parse(readFileSync(new URL("../../.github/npm-audit-allowlist.json", import.meta.url), "utf8")).advisories;
const today = new Date().toISOString().slice(0, 10);
const allowed = new Map(allowlist.map((a) => [a.id, a]));

const advisories = new Map();
for (const vuln of Object.values(report.vulnerabilities ?? {})) {
  for (const via of vuln.via) {
    if (typeof via !== "object" || !BLOCKING.has(via.severity)) continue;
    const id = String(via.url ?? "").split("/").pop() || String(via.source);
    advisories.set(id, { id, pkg: via.name, title: via.title, severity: via.severity, range: via.range });
  }
}

let failed = false;
for (const a of advisories.values()) {
  const entry = allowed.get(a.id);
  if (!entry) {
    failed = true;
    console.error(`✖ ${a.severity} ${a.pkg} ${a.range} — ${a.title} (${a.id})`);
  } else if (entry.until < today) {
    failed = true;
    console.error(`✖ استثناء منتهي (${entry.until}) — راجع ${a.pkg} (${a.id})`);
  } else {
    console.log(`• مستثنى حتى ${entry.until}: ${a.pkg} (${a.id}) — ${entry.reason}`);
  }
}
for (const entry of allowlist) {
  if (advisories.has(entry.id)) continue;
  if (entry.until < today) {
    failed = true;
    console.error(`✖ استثناء منتهي (${entry.until}) ولم يعد لازمًا — احذف ${entry.id} (${entry.package}) من القائمة.`);
  } else {
    console.log(`ℹ الاستثناء ${entry.id} (${entry.package}) لم يعد لازمًا — احذفه.`);
  }
}

if (failed) {
  console.error("\nحدّث الحزمة المتأثرة (npm audit fix أو overrides في package.json). الاستثناء فقط لثغرة بلا إصلاح لا تمسّ استخدامنا.");
  process.exit(1);
}
console.log(`✓ لا ثغرات high/critical غير مستثناة في حزم الإنتاج (${advisories.size} مرصودة).`);
