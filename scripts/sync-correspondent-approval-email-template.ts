/**
 * يحدّث قالب DB لقبول المراسل ليطابق الافتراضي (مع روابط التطبيقات).
 * Usage: railway run npx tsx scripts/sync-correspondent-approval-email-template.ts
 */
import { eq } from "drizzle-orm";
import { employeeEmailTemplates } from "../shared/schema";
import { db } from "../server/db";
import { getDefaultTemplateByType } from "../server/services/employeeNotifications";

async function main() {
  const tpl = getDefaultTemplateByType("correspondent_approved");
  if (!tpl) throw new Error("missing default template");

  const [updated] = await db
    .update(employeeEmailTemplates)
    .set({
      subject: tpl.subject,
      bodyHtml: tpl.bodyHtml,
      bodyText: tpl.bodyText,
      nameAr: tpl.nameAr,
      isActive: true,
      updatedAt: new Date(),
    })
    .where(eq(employeeEmailTemplates.type, "correspondent_approved"))
    .returning({ id: employeeEmailTemplates.id });

  if (!updated) {
    const [inserted] = await db
      .insert(employeeEmailTemplates)
      .values({
        type: "correspondent_approved",
        nameAr: tpl.nameAr,
        subject: tpl.subject,
        bodyHtml: tpl.bodyHtml,
        bodyText: tpl.bodyText,
        isActive: true,
      })
      .returning({ id: employeeEmailTemplates.id });
    console.log("INSERTED", inserted?.id);
  } else {
    console.log("UPDATED", updated.id);
  }

  console.log("has appStoreUrl:", tpl.bodyHtml.includes("{{appStoreUrl}}"));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
