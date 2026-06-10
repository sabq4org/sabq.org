import { Pool as PgPool } from "pg";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import * as schema from "../shared/schema.js";

async function main() {
  const databaseUrl = "postgresql://alialhazmi@localhost:5432/sabq_db";
  const pool = new PgPool({ connectionString: databaseUrl, max: 1 });
  const db = drizzlePg(pool, { schema });

  try {
    console.log("Seeding Muqtarab section...");
    // 1. Muqtarab Section
    let sectionId = "";
    const existingSections = await db.select().from(schema.sections);
    const muqtarab = existingSections.find((s: any) => s.slug === "muqtarab");
    if (muqtarab) {
      sectionId = muqtarab.id;
    } else {
      const [newSec] = await db.insert(schema.sections).values({
        name: "مُقترب",
        slug: "muqtarab",
        description: "قسم زوايا تحليلية وانتقائية",
      }).returning();
      sectionId = newSec.id;
    }

    console.log("Seeding Angle 'readcast'...");
    // 2. Angle 'readcast'
    let angleId = "";
    const existingAngles = await db.select().from(schema.angles);
    const readcast = existingAngles.find((a: any) => a.slug === "readcast");
    if (readcast) {
      angleId = readcast.id;
    } else {
      const [newAngle] = await db.insert(schema.angles).values({
        sectionId,
        nameAr: "ريدكاست",
        nameEn: "Readcast",
        slug: "readcast",
        colorHex: "#f59e0b",
        iconKey: "Sparkles",
        shortDesc: "الزاوية الإبداعية لريدكاست",
        writerSignature: "الكاتب المبدع لزاوية ريدكاست\nتوقيع افتراضي ومقالي متقن.",
        isActive: true,
      }).returning();
      angleId = newAngle.id;
    }

    console.log("Seeding Topic 'buio31g'...");
    // 3. Topic 'buio31g'
    const existingTopics = await db.select().from(schema.topics);
    const topic = existingTopics.find((t: any) => t.slug === "buio31g");
    if (topic) {
      console.log("Topic already exists!");
    } else {
      const content = {
        blocks: [
          {
            type: "heading" as const,
            level: 2,
            content: "أهمية تجربة المستخدم الفريدة في الصحافة الإلكترونية"
          },
          {
            type: "text" as const,
            content: "يعتبر تصميم المواقع والصفحات الصحفية من الركائز الأساسية لجذب الجمهور والحفاظ على تفاعلهم. في عصر تتدفق فيه المعلومات بشكل هائل وسريع، تصبح القراءة المريحة والخالية من المشتتات مطلباً رئيسياً لكل باحث عن المعرفة الدقيقة."
          },
          {
            type: "quote" as const,
            content: "إن إبراز الهوية البصرية للكاتب والزاوية من خلال ألوان مخصصة وتصميم كروت أنيق يعطي بعداً شخصياً للمقال يزيد من موثوقيته وتواصله مع المتلقي."
          },
          {
            type: "text" as const,
            content: "نهدف من خلال هذا التحديث الجديد لصفحة تفاصيل الزاوية في مُقترب إلى جعل تجربة القراءة فاخرة ومريحة، بالاعتماد على توزيع احترافي للمحتوى بين النص الرئيسي الجذاب والملخصات الجانبية الأنيقة."
          }
        ]
      };

      await db.insert(schema.topics).values({
        angleId,
        title: "تحسين تجربة القراءة وتصميم الزوايا الإبداعية في سبق",
        slug: "buio31g",
        excerpt: "هذا هو الموجز التعريفي للموضوع الذي يناقش أهم التحديثات البصرية لصفحة تفاصيل الزوايا والمواضيع الإبداعية.",
        content,
        heroImageUrl: "https://images.unsplash.com/photo-1506784983877-45594efa4cbe?w=1200&auto=format&fit=crop&q=80",
        status: "published",
        publishedAt: new Date(),
        createdBy: "admin-sabq",
      });
      console.log("Topic seeded successfully!");
    }
  } catch (err) {
    console.error("Error seeding:", err);
  } finally {
    await pool.end();
  }
}

main();
