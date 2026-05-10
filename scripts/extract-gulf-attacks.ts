import { pool } from "../server/db";

const COUNTRY_KEYWORDS: Record<string, string[]> = {
  saudi_arabia: ["السعودية", "المملكة", "الرياض", "جدة", "مكة", "جازان", "نجران", "أبها", "الدفاع الجوي السعودي", "التحالف"],
  uae: ["الإمارات", "أبوظبي", "دبي"],
  bahrain: ["البحرين", "المنامة"],
  kuwait: ["الكويت"],
  qatar: ["قطر", "الدوحة"],
  oman: ["عمان", "مسقط", "سلطنة عمان"],
  yemen: ["اليمن", "صنعاء", "عدن", "مأرب"],
};

const ATTACK_KEYWORDS = [
  "اعتراض", "مسيّرة", "مسيرة", "طائرة مسيرة", "صاروخ", "باليستي", "كروز",
  "قذيفة", "شظايا", "اعتداء", "هجوم", "قصف", "دفاع جوي",
  "حوثي", "حوثية", "ميليشيا", "استهداف", "صد",
  "إصابة", "إصابات", "استشهاد", "شهيد", "شهداء", "ضحايا",
  "تدمير", "إيران", "إيراني", "مفخخة", "بالستي", "drone", "missile",
];

const EVENT_TYPE_KEYWORDS: Record<string, string[]> = {
  drone_intercepted: ["مسيّرة", "مسيرة", "طائرة مسيرة", "درون", "drone", "اعتراض مسيرة", "صد مسيرة"],
  ballistic_intercepted: ["باليستي", "بالستي", "صاروخ باليستي", "ballistic"],
  cruise_intercepted: ["كروز", "صاروخ كروز", "cruise"],
  debris_fallen: ["شظايا", "حطام", "سقوط شظايا"],
  injuries: ["إصابة", "إصابات", "جرحى", "مصاب"],
  martyrdom: ["استشهاد", "شهيد", "شهداء", "قتيل", "قتلى", "ضحايا"],
  official_statement: ["بيان رسمي", "بيان", "المتحدث الرسمي", "وزارة الدفاع"],
  military_action: ["عملية عسكرية", "ضربة", "قصف", "تدمير"],
};

const FALSE_POSITIVE_KEYWORDS = [
  "تحدي القراءة", "كتاب", "منصة رقمية", "تشجير", "غبار", "إنترنت الأشياء",
  "طقس", "أمطار", "رياضة", "دوري", "كرة", "مباراة", "ترفيه", "سياحة",
  "تعليم", "جامعة", "مدرسة", "وظائف", "توظيف", "عقار", "إسكان",
];

function isActualAttackArticle(title: string, text: string): boolean {
  const titleLower = title;
  const attackScore = ATTACK_KEYWORDS.filter(kw => titleLower.includes(kw)).length;
  if (attackScore === 0) return false;

  const hasFalsePositive = FALSE_POSITIVE_KEYWORDS.some(kw => titleLower.includes(kw));
  if (hasFalsePositive && attackScore < 2) return false;

  const hasMilitary = ["اعتراض", "مسيّرة", "مسيرة", "صاروخ", "باليستي", "كروز", "شظايا",
    "دفاع جوي", "حوثي", "استهداف", "إسقاط", "هجمة صاروخية", "التصدي",
    "معادية", "إيراني", "إيرانية", "اعتداء إيراني"].some(kw => titleLower.includes(kw));

  return hasMilitary;
}

function detectPriority(title: string): string {
  if (title.includes("استشهاد") || title.includes("شهداء") || title.includes("قتلى")) return "critical";
  if (title.includes("إصابات") || title.includes("إصابة") || title.includes("جرحى")) return "high";
  if (title.includes("باليستي") || title.includes("بالستي") || title.includes("كروز")) return "high";
  if (title.includes("شظايا") || title.includes("حطام") || title.includes("أضرار")) return "high";
  return "normal";
}

function detectSourceType(title: string): string {
  if (title.includes("وزارة الدفاع") || title.includes("المتحدث الرسمي")) return "official_statement";
  if (title.includes("الدفاع السعودية") || title.includes("الدفاع القطرية") || title.includes("الدفاع الكويتية")) return "official_statement";
  if (title.includes("الداخلية") || title.includes("الصحة")) return "official_statement";
  return "sabq_correspondent";
}

async function extractAttacks() {
  const shouldImport = process.argv.includes("--import");
  const tenDaysAgo = new Date();
  tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

  console.log("=".repeat(80));
  console.log("تحليل الاعتداءات على دول الخليج — آخر 10 أيام");
  console.log(`من: ${tenDaysAgo.toISOString().split("T")[0]} إلى: ${new Date().toISOString().split("T")[0]}`);
  if (shouldImport) console.log("وضع الاستيراد التلقائي: مفعّل");
  console.log("=".repeat(80));

  const result = await pool.query(`
    SELECT id, title, content, excerpt, slug, published_at, category_id
    FROM articles 
    WHERE status = 'published' 
      AND published_at >= $1
      AND (
        title ILIKE '%اعتراض%' OR title ILIKE '%مسيرة%' OR title ILIKE '%مسيّرة%'
        OR title ILIKE '%صاروخ%' OR title ILIKE '%باليستي%' OR title ILIKE '%كروز%'
        OR title ILIKE '%شظايا%' OR title ILIKE '%دفاع جوي%' OR title ILIKE '%حوثي%'
        OR title ILIKE '%هجوم%' OR title ILIKE '%قصف%' OR title ILIKE '%استهداف%'
        OR title ILIKE '%إصابات%' OR title ILIKE '%استشهاد%' OR title ILIKE '%شهداء%'
        OR title ILIKE '%ميليشيا%' OR title ILIKE '%اعتداء%' OR title ILIKE '%صد%'
        OR title ILIKE '%إسقاط%' OR title ILIKE '%التصدي%' OR title ILIKE '%معادية%'
        OR content ILIKE '%اعتراض مسيرة%' OR content ILIKE '%صاروخ باليستي%'
        OR content ILIKE '%الدفاع الجوي%' OR content ILIKE '%حوثي%'
      )
    ORDER BY published_at DESC
  `, [tenDaysAgo]);

  const articles = result.rows;
  console.log(`\nوُجدت ${articles.length} مقالة مرشّحة`);

  interface AttackEvent {
    date: string;
    time: string;
    title: string;
    country: string;
    eventType: string;
    priority: string;
    sourceType: string;
    slug: string;
    publishedAtISO: string;
  }

  const attacks: AttackEvent[] = [];
  let skipped = 0;

  for (const article of articles) {
    const text = `${article.title} ${article.excerpt || ""} ${(article.content || "").slice(0, 2000)}`;

    if (!isActualAttackArticle(article.title, text)) {
      skipped++;
      continue;
    }

    let detectedCountry = "unknown";
    for (const [country, keywords] of Object.entries(COUNTRY_KEYWORDS)) {
      if (keywords.some(kw => text.includes(kw))) {
        detectedCountry = country;
        break;
      }
    }

    if (detectedCountry === "unknown") {
      skipped++;
      continue;
    }

    let detectedType = "official_statement";
    let maxMatches = 0;
    for (const [type, keywords] of Object.entries(EVENT_TYPE_KEYWORDS)) {
      const matches = keywords.filter(kw => text.includes(kw)).length;
      if (matches > maxMatches) {
        maxMatches = matches;
        detectedType = type;
      }
    }

    const pubDate = new Date(article.published_at);
    const isoStr = pubDate.toISOString();
    attacks.push({
      date: isoStr.split("T")[0],
      time: isoStr.split("T")[1].slice(0, 5),
      title: article.title,
      country: detectedCountry,
      eventType: detectedType,
      priority: detectPriority(article.title),
      sourceType: detectSourceType(article.title),
      slug: article.slug,
      publishedAtISO: isoStr,
    });
  }

  console.log(`تمت تصفية ${skipped} مقالة غير متعلقة`);
  console.log(`بقيت ${attacks.length} حدث اعتداء فعلي\n`);

  const byDate: Record<string, AttackEvent[]> = {};
  for (const attack of attacks) {
    if (!byDate[attack.date]) byDate[attack.date] = [];
    byDate[attack.date].push(attack);
  }

  const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  const countryNames: Record<string, string> = {
    saudi_arabia: "السعودية", uae: "الإمارات", bahrain: "البحرين",
    kuwait: "الكويت", qatar: "قطر", oman: "عُمان", yemen: "اليمن", unknown: "غير محدد",
  };

  const typeNames: Record<string, string> = {
    drone_intercepted: "صد مسيّرة", ballistic_intercepted: "صد صاروخ باليستي",
    cruise_intercepted: "صد صاروخ كروز", debris_fallen: "سقوط شظايا",
    injuries: "إصابات", martyrdom: "استشهاد", official_statement: "بيان رسمي",
    military_action: "تحرك عسكري",
  };

  const priorityNames: Record<string, string> = {
    normal: "عادي", high: "عالي", critical: "حرج",
  };

  console.log("=".repeat(80));
  console.log("ملخص يومي");
  console.log("=".repeat(80));

  let totalAttacks = 0;
  const countryStats: Record<string, number> = {};
  const typeStats: Record<string, number> = {};

  for (const date of sortedDates) {
    const dayAttacks = byDate[date];
    totalAttacks += dayAttacks.length;

    console.log(`\n${date} — ${dayAttacks.length} حدث`);
    console.log("-".repeat(60));

    for (const attack of dayAttacks) {
      countryStats[attack.country] = (countryStats[attack.country] || 0) + 1;
      typeStats[attack.eventType] = (typeStats[attack.eventType] || 0) + 1;

      const prioLabel = attack.priority !== "normal" ? ` [${priorityNames[attack.priority]}]` : "";
      console.log(`  ${attack.time} | ${countryNames[attack.country] || attack.country} | ${typeNames[attack.eventType] || attack.eventType}${prioLabel}`);
      console.log(`         ${attack.title}`);
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("إحصائيات عامة");
  console.log("=".repeat(80));
  console.log(`إجمالي الأحداث: ${totalAttacks}`);

  console.log("\nحسب الدولة:");
  for (const [country, count] of Object.entries(countryStats).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${countryNames[country] || country}: ${count}`);
  }

  console.log("\nحسب النوع:");
  for (const [type, count] of Object.entries(typeStats).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${typeNames[type] || type}: ${count}`);
  }

  if (shouldImport && attacks.length > 0) {
    console.log("\n" + "=".repeat(80));
    console.log("بدء الاستيراد إلى قاعدة البيانات...");
    console.log("=".repeat(80));

    const existingResult = await pool.query(
      `SELECT content FROM gulf_events WHERE status = 'published'`
    );
    const existingContents = new Set(existingResult.rows.map((r: any) => r.content));

    let imported = 0;
    let duplicates = 0;

    for (const attack of attacks) {
      if (existingContents.has(attack.title)) {
        duplicates++;
        continue;
      }

      await pool.query(
        `INSERT INTO gulf_events (country, event_type, priority, source_type, source_name, content, status, published_at, author_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'published', $7, $8, NOW(), NOW())`,
        [
          attack.country,
          attack.eventType,
          attack.priority,
          attack.sourceType,
          "سبق",
          attack.title,
          new Date(attack.publishedAtISO),
          "admin-sabq",
        ]
      );
      imported++;
      existingContents.add(attack.title);
    }

    console.log(`\nتم استيراد: ${imported} حدث جديد`);
    console.log(`تم تخطي: ${duplicates} حدث مكرر`);
    console.log(`إجمالي في القاعدة الآن: ${existingContents.size} حدث`);
  }

  await pool.end();
}

extractAttacks().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
