// أسماء الأدوار المعطّلة أو المؤرشفة — تُستبعد من حساب الصلاحيات في rbac.ts.
//
// تُقرأ باستعلام خام، وغياب العمود (42703) يعني «لا أدوار معطّلة» بدل كسر بوابات
// الصلاحيات. هذا احتياط فقط: migrations/20261110_roles_status.sql شرط قبل الدمج،
// لأن استعلامات Drizzle الأخرى على roles تذكر العمود.
// الكاش لكل عملية 30 ثانية؛ تغيير الحالة يبطله محليًا، والنسخة الأخرى تلحق خلال 30 ثانية.
import { sql } from "drizzle-orm";
import { db } from "../db";

const TTL_MS = 30_000;
export interface InactiveRoles { names: Set<string>; ids: Set<string> }
const EMPTY: InactiveRoles = { names: new Set(), ids: new Set() };
let cached: { at: number; value: InactiveRoles } | null = null;
let inflight: Promise<InactiveRoles> | null = null;
let warnedMissingColumn = false;

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: T[] } | null)?.rows;
  return Array.isArray(rows) ? rows : [];
}

async function load(): Promise<InactiveRoles> {
  try {
    const result = await db.execute(sql`SELECT id, name FROM roles WHERE status IN ('disabled', 'archived')`);
    const rows = rowsOf<{ id: string; name: string }>(result);
    return { names: new Set(rows.map((r) => r.name)), ids: new Set(rows.map((r) => r.id)) };
  } catch (error: unknown) {
    const code = (error as { code?: string; cause?: { code?: string } })?.code
      ?? (error as { cause?: { code?: string } })?.cause?.code;
    if (code === "42703") {
      if (!warnedMissingColumn) {
        warnedMissingColumn = true;
        console.warn("[roleStatus] roles.status column missing — run migrations/20261110_roles_status.sql; treating all roles as active");
      }
      return EMPTY;
    }
    // فشل عابر: أبقِ آخر قيمة معروفة بدل فتح الأدوار المعطّلة فجأة.
    if (cached) return cached.value;
    throw error;
  }
}

export async function getInactiveRoles(): Promise<InactiveRoles> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  if (!inflight) {
    inflight = load()
      .then((value) => {
        cached = { at: Date.now(), value };
        return value;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export async function getInactiveRoleNames(): Promise<Set<string>> {
  return (await getInactiveRoles()).names;
}

export function invalidateInactiveRoleNames(): void {
  cached = null;
}
