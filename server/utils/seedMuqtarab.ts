import { db } from "../db";
import { sections, angles } from "@shared/schema";
import { eq } from "drizzle-orm";

export async function seedMuqtarab() {
  console.log("📐 Seeding Muqtarab section and angles...");

  // 1. Create or get Muqtarab section
  const [existingSection] = await db
    .select()
    .from(sections)
    .where(eq(sections.slug, "muqtarab"))
    .limit(1);

  let muqtarabSection;
  if (!existingSection) {
    const [section] = await db
      .insert(sections)
      .values({
        name: "مُقترب",
        slug: "muqtarab",
        description: "قسم زوايا تحليلية وانتقائية - رؤى متعمقة للقضايا المعاصرة",
      })
      .returning();
    muqtarabSection = section;
    console.log("✅ Created Muqtarab section");
  } else {
    muqtarabSection = existingSection;
    console.log("ℹ️ Muqtarab section already exists");
  }

  // 2. Create angles (if not exist)
  const anglesData = [
    {
      sectionId: muqtarabSection.id,
      nameAr: "النشر الرقمي",
      nameEn: "Digital Publishing",
      slug: "digital-publishing",
      colorHex: "#0ea5e9",
      iconKey: "Newspaper",
      shortDesc: "اتجاهات وتقنيات النشر الرقمي والصحافة الحديثة",
      sortOrder: 1,
      isActive: true,
    },
    {
      sectionId: muqtarabSection.id,
      nameAr: "الاقتصاد",
      nameEn: "Economy",
      slug: "economy",
      colorHex: "#22c55e",
      iconKey: "LineChart",
      shortDesc: "قراءات وتحليلات اقتصادية مبسطة للقارئ العربي",
      sortOrder: 2,
      isActive: true,
    },
    {
      sectionId: muqtarabSection.id,
      nameAr: "الفكر",
      nameEn: "Thought",
      slug: "thought",
      colorHex: "#a855f7",
      iconKey: "BookOpenCheck",
      shortDesc: "مقالات وتأملات فكرية عميقة في القضايا المعاصرة",
      sortOrder: 3,
      isActive: true,
    },
  ];

  for (const angleData of anglesData) {
    const [existing] = await db
      .select()
      .from(angles)
      .where(eq(angles.slug, angleData.slug))
      .limit(1);

    if (!existing) {
      await db.insert(angles).values(angleData);
      console.log(`✅ Created angle: ${angleData.nameAr} (${angleData.slug})`);
    } else {
      console.log(`ℹ️ Angle already exists: ${angleData.nameAr}`);
    }
  }

  console.log("✅ Muqtarab seed completed");
}
