/**
 * تقرير قراءة-فقط: أرقام الجوال المكرّرة بين الحسابات النشطة.
 *
 * لا يعدّل أي بيانات ولا يدمج شيئًا. الغرض مساعدة الإدارة على حسم
 * التعارضات يدويًا (أي حساب يستحق الرقم) دون فقدان بيانات أو صلاحيات.
 *
 *   npx tsx scripts/report-duplicate-phones.ts
 *
 * ENV: DATABASE_URL, DB_DRIVER=pg|neon
 */
import { db } from "../server/db";
import { sql } from "drizzle-orm";

interface DuplicateAccount {
  id: string;
  role: string;
  status: string;
  phoneVerified: boolean;
  phone: string | null;
  name: string | null;
}

async function main() {
  const result: any = await db.execute(sql`
    WITH norm AS (
      SELECT
        id,
        role,
        status,
        phone_verified,
        phone_number,
        concat_ws(' ', first_name, last_name) AS name,
        right(regexp_replace(coalesce(phone_number, ''), '[^0-9]', '', 'g'), 9) AS phone9
      FROM users
      WHERE status <> 'deleted'
        AND phone_number IS NOT NULL
        AND phone_number <> ''
    )
    SELECT
      phone9,
      json_agg(
        json_build_object(
          'id', id,
          'role', role,
          'status', status,
          'phoneVerified', phone_verified,
          'phone', phone_number,
          'name', name
        )
        ORDER BY phone_verified DESC
      ) AS accounts
    FROM norm
    WHERE length(phone9) = 9
    GROUP BY phone9
    HAVING count(*) > 1
    ORDER BY count(*) DESC
  `);

  const rows: Array<{ phone9: string; accounts: DuplicateAccount[] }> =
    Array.isArray(result) ? result : (result?.rows ?? []);

  if (rows.length === 0) {
    console.log("[report-duplicate-phones] لا توجد أرقام مكرّرة بين الحسابات النشطة.");
    return;
  }

  console.log(`[report-duplicate-phones] ${rows.length} رقمًا مكرّرًا:\n`);
  for (const row of rows) {
    console.log(`الجوال (آخر 9): ${row.phone9}`);
    for (const acc of row.accounts) {
      console.log(
        `  - ${acc.id} | ${acc.role} | ${acc.status} | موثّق=${acc.phoneVerified ? "نعم" : "لا"} | ${acc.name || "بلا اسم"} | ${acc.phone}`,
      );
    }
    console.log("");
  }
  console.log("ملاحظة: الحسم يدوي — لا دمج أو حذف تلقائي.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[report-duplicate-phones] failed:", err);
    process.exit(1);
  });
