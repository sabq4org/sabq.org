/**
 * تشخيص وترقية عضوية مراسل تظهر كقارئ.
 *
 * يبحث بالبريد و/أو الاسم، يعرض الدور القديم وRBAC وعدد الأخبار،
 * ثم يرقّي الحساب المختار إلى مراسل (users.role + user_roles + staff).
 *
 * USAGE
 *   SKIP_DB_MAINTENANCE=true npx tsx scripts/promote-correspondent.ts \
 *     --email=abomazen500@gmail.com --email=abomazen500@hotmail.com \
 *     --name="عيسى الحربي"
 *
 *   SKIP_DB_MAINTENANCE=true npx tsx scripts/promote-correspondent.ts \
 *     --email=abomazen500@gmail.com --apply --user=<id> --i-understand
 *
 * ENV: DATABASE_URL, DB_DRIVER=pg|neon
 */
import { isReaderLikeRole } from "../shared/effectiveRoles";
import {
  findCorrespondentCandidates,
  promoteUserToReporter,
} from "../server/services/promoteCorrespondentService";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const I_UNDERSTAND = argv.includes("--i-understand");
const emails = argv
  .filter((a) => a.startsWith("--email="))
  .map((a) => a.slice("--email=".length));
const nameArg = argv.find((a) => a.startsWith("--name="));
const name = nameArg ? nameArg.slice("--name=".length).replace(/^["']|["']$/g, "") : "";
const userArg = argv.find((a) => a.startsWith("--user="));
const userId = userArg ? userArg.slice("--user=".length) : "";

function abortOnProd() {
  if (!APPLY) return;
  const url = process.env.DATABASE_URL || "";
  if (/prod|production|neon\.tech|railway/i.test(url) && !I_UNDERSTAND) {
    console.error("[promote] ABORT: --apply against a production-looking DATABASE_URL.");
    console.error("        Pass --i-understand after reviewing the dry-run.");
    process.exit(2);
  }
}

function printRow(c: Awaited<ReturnType<typeof findCorrespondentCandidates>>[number]) {
  const nameLabel = [c.firstName, c.lastName].filter(Boolean).join(" ") || "—";
  console.log(`- ${c.id}`);
  console.log(`  name=${nameLabel}  email=${c.email ?? "—"}  status=${c.status ?? "—"}`);
  console.log(`  users.role=${c.role ?? "—"}  rbac=[${c.rbacRoles.join(", ") || "—"}]  effective=[${c.effectiveRoles.join(", ")}]`);
  console.log(`  articles=${c.articleCount}  staff=${c.staffType ?? "—"}  application=${c.applicationStatus ?? "—"}  verified=${c.emailVerified}`);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL not set");
    process.exit(1);
  }
  if (emails.length === 0 && !name) {
    console.error("Usage: --email=a@b.com [--name=\"عيسى الحربي\"] [--apply --user=ID --i-understand]");
    process.exit(1);
  }

  abortOnProd();

  const candidates = await findCorrespondentCandidates({ emails, name: name || undefined });
  if (candidates.length === 0) {
    console.log("[promote] no matching users");
    process.exit(0);
  }

  console.log(`[promote] ${candidates.length} candidate(s)`);
  for (const c of candidates) printRow(c);

  if (!APPLY) {
    console.log("\n[promote] dry-run only. Re-run with --apply --user=<id> --i-understand to write.");
    process.exit(0);
  }

  const target = userId
    ? candidates.find((c) => c.id === userId)
    : candidates.find((c) => isReaderLikeRole(c.role) && !c.effectiveRoles.includes("reporter"));

  if (!target) {
    console.error("[promote] no target. Pass --user=<id> from the list above.");
    process.exit(1);
  }

  const result = await promoteUserToReporter(target.id, "script-promote-correspondent");
  console.log("[promote] done", result);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error("[promote] failed", err);
  process.exit(1);
});
