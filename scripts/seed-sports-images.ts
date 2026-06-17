/**
 * زرع أخبار رياضية تجريبية بصور — لمعاينة تصميم قسم /sports محليًا.
 *
 * المشكلة: الأخبار الرياضية الحالية بلا صور (imageUrl = NULL)، فلا تتضح
 * معاينة بطاقات الأخبار. هذا السكربت يضيف أخبارًا رياضية بصور حقيقية
 * (Picsum Photos — مستقر ومجاني، أحجام 16:9) لمعاينة التخطيط.
 *
 * آمن ومحدود:
 *  - يضيف فقط (INSERT)، لا يمسّ الأخبار الموجودة.
 *  - يعمل ضد قاعدة البيانات المحلية فقط (تحقق من DATABASE_URL).
 *  - ذو معرّفات slug فريدة مسبوقة بـseed-sports- كي يسهل حذفها لاحقًا.
 *
 * USAGE
 *   npx tsx scripts/seed-sports-images.ts
 */
import { pool } from "../server/db";

// قاعدة بيانات الإنتاج؟ ارفض التنفيذ — حماية إضافية.
const dbUrl = process.env.DATABASE_URL || "";
if (/prod|production|railway\.app/i.test(dbUrl) && !process.env.FORCE_SEED) {
  console.error("⚠️  يبدو أن DATABASE_URL تProduction. أضف FORCE_SEED=1 للتأكيد.");
  process.exit(1);
}

interface SeedArticle {
  title: string;
  excerpt: string;
  imageSeed: string; // picsum seed لصورة ثابتة
  newsType?: "regular" | "breaking" | "featured";
}

// أخبار رياضية متنوّعة بأهداف تنوع بصرية (هيرو، ثانوية، شبكة).
const SEED: SeedArticle[] = [
  {
    title: "الهلال يواصل صدارته لدوري روشن بفوز عريض على الوحدة",
    excerpt: "تعزيز جديد لصدارة زعيم آسيا في قمة الجولة الخامسة، بأداء هجومي مبهر وثلاثية نظيفة.",
    imageSeed: "hilal-win",
    newsType: "featured",
  },
  {
    title: "النصر يتعادل في اللحظات الأخيرة أمام الاتفاق",
    excerpt: "هدف قاتل في الوقت بدل الضائع يحرّم العالمي من اغتنام النقاط الثلاث على أرضه.",
    imageSeed: "nassr-draw",
    newsType: "breaking",
  },
  {
    title: "الأهلي يكسر عقدة الفوز خارج أرضه أمام التعاون",
    excerpt: "ثلاث نقاط ذهبية تعيد القلعة لمنافسة على المراكز الأربعة الأولى.",
    imageSeed: "ahli-away",
  },
  {
    title: "الاتحاد يتعاقد مع نجم خط الوسط البرازيلي",
    excerpt: "صفقة قوية لتعزيز العمق التكتيكي للاتحاد قبل انطلاق نصف نهائي كأس الملك.",
    imageSeed: "itihad-signing",
  },
  {
    title: "الشباب يقدم مدربه الجديد في مؤتمر صحفي",
    excerpt: "تغيير فنّي جديد على رأس الجهاز الفني للفريق بعد سلسلة نتائج مخيبة.",
    imageSeed: "shabab-coach",
  },
  {
    title: "هداف دوري روشن: صراع ثلاثي على لقب الهداف",
    excerpt: "ثلاثة لاعبين يتنافسون على الحذاء الذهبي مع اقتراب نهاية الجولة الخامسة.",
    imageSeed: "top-scorers",
  },
  {
    title: "منتخب السعودية يستعد لمباراة الحسم في التصفيات",
    excerpt: "معسكر مغلق ومباراتان وديتان قبل موقعة الحسم في التصفيات الآسيوية.",
    imageSeed: "saudi-national",
  },
  {
    title: "كأس العالم للأندية: قرعة مثيرة للفرق السعودية",
    excerpt: "وقع الهلال والنصر في مجموعات صعبة قبل انطلاق البطولة المرتقبة.",
    imageSeed: "clubs-world-cup",
  },
  {
    title: "دوري روشن يعلن جوائز الجولة الخامسة",
    excerpt: "أفضل لاعب وأفضل هدف وأفضل مدرب في جولة شهدت مفاجآت وأهداف رائعة.",
    imageSeed: "spl-awards",
  },
  {
    title: "نيوم يكسب ديربي الدرجة الأولى ويعزز صدارته",
    excerpt: "فوز مهم في الديربي المحلي يقرّب فريق نيوم من العودة لدوري الأضواء.",
    imageSeed: "neom-derby",
  },
];

const WIDTH = 1280;
const HEIGHT = 720;
const imageUrlOf = (seed: string) =>
  `https://picsum.photos/seed/${encodeURIComponent(seed)}/${WIDTH}/${HEIGHT}`;

async function main() {
  // جلب categoryId للرياضة وauthorId صالح.
  const catRes = await pool.query(
    `SELECT id FROM categories WHERE slug = 'sports' LIMIT 1`
  );
  const categoryId = catRes.rows[0]?.id;
  if (!categoryId) throw new Error("لم يُعثر على قسم 'sports' في قاعدة البيانات.");

  const userRes = await pool.query(
    `SELECT id FROM users WHERE status = 'active' ORDER BY created_at LIMIT 1`
  );
  const authorId = userRes.rows[0]?.id;
  if (!authorId) throw new Error("لم يُعثر على مستخدم نشط ليكون المؤلف.");

  console.log(`categoryId=${categoryId}  authorId=${authorId}`);

  let inserted = 0;
  let skipped = 0;
  for (const a of SEED) {
    const slug = `seed-sports-${a.imageSeed}`;
    // لا تكرر الزرع إن أُعيد تشغيل السكربت.
    const exists = await pool.query(`SELECT 1 FROM articles WHERE slug = $1`, [slug]);
    if (exists.rowCount && exists.rowCount > 0) {
      skipped++;
      continue;
    }
    const img = imageUrlOf(a.imageSeed);
    await pool.query(
      `INSERT INTO articles
         (id, title, slug, content, excerpt, image_url, thumbnail_url,
          category_id, author_id, article_type, news_type, status,
          published_at, image_focal_point, hide_from_homepage)
       VALUES
         (gen_random_uuid(), $1, $2, $3, $4, $5, $5,
          $6, $7, 'news', $8, 'published',
          NOW(), jsonb_build_object('x', 50, 'y', 50), false)`,
      [
        a.title,
        slug,
        `<p>${a.excerpt}</p><p>محتوى تجريبي لمعاينة تصميم قسم الرياضة.</p>`,
        a.excerpt,
        img,
        categoryId,
        authorId,
        a.newsType || "regular",
      ]
    );
    inserted++;
    console.log(`  ✓ ${a.title}`);
  }

  console.log(`\nاكتمل: أُضيف ${inserted}، تخطّي ${skipped} (موجودة مسبقًا).`);
  console.log("افتح: http://localhost:5050/sports");
  await pool.end();
}

main().catch((err) => {
  console.error("فشل الزرع:", err);
  process.exit(1);
});
