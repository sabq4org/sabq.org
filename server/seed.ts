// Seed database with initial data
import { db } from "./db";
import { categories, articles, users } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { seedRBAC } from "./seedRBAC";
import bcrypt from "bcrypt";

async function seed() {
  console.log("🌱 Seeding database...");

  try {
    // First, seed RBAC (Roles & Permissions)
    const { allRoles, allPermissions } = await seedRBAC();

    // Create a test user (editor)
    const testUserId = "test-editor-001";
    const [testUser] = await db
      .insert(users)
      .values({
        id: testUserId,
        email: "editor@sabq.test",
        firstName: "محرر",
        lastName: "سبق",
        role: "editor",
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: "editor@sabq.test",
          firstName: "محرر",
          lastName: "سبق",
          role: "editor",
        },
      })
      .returning();

    console.log(`✅ Created test user: ${testUser.firstName} ${testUser.lastName}`);

    // Assign editor role to test user
    const editorRole = allRoles.find(r => r.name === "editor");
    if (editorRole) {
      const { userRoles } = await import("@shared/schema");
      await db
        .insert(userRoles)
        .values({
          userId: testUserId,
          roleId: editorRole.id,
        })
        .onConflictDoNothing();
      console.log(`✅ Assigned editor role to test user`);
    }

    // Create admin user with known password
    const adminUserId = "admin-sabq";
    const adminPassword = "admin123";
    const adminPasswordHash = await bcrypt.hash(adminPassword, 12);
    
    const [adminUser] = await db
      .insert(users)
      .values({
        id: adminUserId,
        email: "admin@sabq.sa",
        passwordHash: adminPasswordHash,
        firstName: "مسؤول",
        lastName: "النظام",
        status: "active",
        isProfileComplete: true,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: "admin@sabq.sa",
          passwordHash: adminPasswordHash,
          firstName: "مسؤول",
          lastName: "النظام",
          status: "active",
          isProfileComplete: true,
        },
      })
      .returning();

    console.log(`✅ Created/Updated admin user: ${adminUser.email} (Password: ${adminPassword})`);

    // Assign system_admin role to admin user
    const systemAdminRole = allRoles.find(r => r.name === "system_admin");
    if (systemAdminRole) {
      const { userRoles } = await import("@shared/schema");
      await db
        .insert(userRoles)
        .values({
          userId: adminUserId,
          roleId: systemAdminRole.id,
        })
        .onConflictDoNothing();
      console.log(`✅ Assigned system_admin role to admin user`);
    }

    // Create official categories (10 categories - production ready)
    const categoriesData = [
      { 
        nameAr: "محليات", 
        nameEn: "Local", 
        slug: "local",
        description: "أخبار المناطق والمدن السعودية",
        color: "#3B82F6",
        icon: "🗺️",
        displayOrder: 1,
        status: "active"
      },
      { 
        nameAr: "العالم", 
        nameEn: "World", 
        slug: "world",
        description: "أخبار العالم والتحليلات الدولية",
        color: "#6366F1",
        icon: "🌍",
        displayOrder: 2,
        status: "active"
      },
      { 
        nameAr: "حياتنا", 
        nameEn: "Life", 
        slug: "life",
        description: "نمط الحياة، الصحة، الأسرة والمجتمع",
        color: "#F472B6",
        icon: "🌱",
        displayOrder: 3,
        status: "active"
      },
      { 
        nameAr: "محطات", 
        nameEn: "Stations", 
        slug: "stations",
        description: "تقارير خاصة وملفات متنوعة",
        color: "#FBBF24",
        icon: "🛤️",
        displayOrder: 4,
        status: "active"
      },
      { 
        nameAr: "رياضة", 
        nameEn: "Sports", 
        slug: "sports",
        description: "أخبار رياضية محلية وعالمية",
        color: "#F59E0B",
        icon: "⚽",
        displayOrder: 5,
        status: "active"
      },
      { 
        nameAr: "سياحة", 
        nameEn: "Tourism", 
        slug: "tourism",
        description: "تقارير سياحية ومواقع مميزة",
        color: "#34D399",
        icon: "🧳",
        displayOrder: 6,
        status: "active"
      },
      { 
        nameAr: "أعمال", 
        nameEn: "Business", 
        slug: "business",
        description: "أخبار الأعمال والشركات وريادة الأعمال",
        color: "#10B981",
        icon: "💼",
        displayOrder: 7,
        status: "active"
      },
      { 
        nameAr: "تقنية", 
        nameEn: "Technology", 
        slug: "technology",
        description: "أخبار وتطورات التقنية والذكاء الاصطناعي",
        color: "#8B5CF6",
        icon: "💻",
        displayOrder: 8,
        status: "active"
      },
      { 
        nameAr: "سيارات", 
        nameEn: "Cars", 
        slug: "cars",
        description: "أخبار وتقارير السيارات",
        color: "#0EA5E9",
        icon: "🚗",
        displayOrder: 9,
        status: "active"
      },
      { 
        nameAr: "ميديا", 
        nameEn: "Media", 
        slug: "media",
        description: "فيديوهات وصور وإعلام رقمي",
        color: "#EAB308",
        icon: "🎬",
        displayOrder: 10,
        status: "active"
      },
    ];

    const insertedCategories = await db
      .insert(categories)
      .values(categoriesData)
      .onConflictDoUpdate({
        target: categories.slug,
        set: {
          nameAr: sql`excluded.name_ar`,
          nameEn: sql`excluded.name_en`,
          description: sql`excluded.description`,
          color: sql`excluded.color`,
          icon: sql`excluded.icon`,
          displayOrder: sql`excluded.display_order`,
          status: sql`excluded.status`,
        },
      })
      .returning();

    console.log(`✅ Updated ${insertedCategories.length} categories`);

    // Get all categories for article creation
    const allCategories = await db.select().from(categories);

    // Sample Arabic articles
    const articlesData = [
      {
        title: "الذكاء الاصطناعي يغير مستقبل التكنولوجيا في المنطقة العربية",
        slug: "ai-future-arabic-region",
        excerpt: "تشهد المنطقة العربية ثورة تكنولوجية في مجال الذكاء الاصطناعي مع استثمارات ضخمة في البحث والتطوير.",
        content: `تشهد المنطقة العربية تحولاً تكنولوجياً كبيراً في مجال الذكاء الاصطناعي، حيث تتزايد الاستثمارات في هذا المجال بشكل ملحوظ.

## التطورات الأخيرة

تعمل العديد من الدول العربية على تطوير استراتيجيات وطنية للذكاء الاصطناعي، مع التركيز على قطاعات رئيسية مثل:

- الرعاية الصحية
- التعليم
- الخدمات الحكومية
- النقل الذكي

## الاستثمارات المستقبلية

من المتوقع أن تصل الاستثمارات في مجال الذكاء الاصطناعي في المنطقة العربية إلى مليارات الدولارات خلال السنوات القادمة، مما سيساهم في تعزيز التنمية المستدامة والابتكار.`,
        categoryId: allCategories.find(c => c.slug === "technology")?.id || allCategories[7]?.id || allCategories[0].id,
        authorId: testUserId,
        status: "published",
        featured: true,
        views: 1250,
        aiSummary: "المنطقة العربية تشهد تحولاً كبيراً في مجال الذكاء الاصطناعي مع زيادة الاستثمارات والتركيز على قطاعات رئيسية مثل الصحة والتعليم.",
      },
      {
        title: "كأس العالم للأندية: تحليل شامل للبطولة القادمة",
        slug: "club-world-cup-analysis",
        excerpt: "نستعرض أبرز الفرق المشاركة وتوقعات الخبراء للبطولة المرتقبة.",
        content: `تستعد كرة القدم العالمية لواحدة من أهم البطولات القادمة - كأس العالم للأندية.

## الفرق المشاركة

تضم البطولة نخبة من أفضل الأندية على مستوى العالم، بما في ذلك الأبطال من جميع القارات.

## التوقعات

يرى الخبراء أن المنافسة ستكون قوية للغاية هذا العام، مع وجود عدة فرق قادرة على حسم اللقب.

### أبرز المرشحين:
1. الفريق الأوروبي
2. الفريق الأمريكي الجنوبي
3. الفريق الآسيوي

ستكون البطولة فرصة رائعة لعشاق كرة القدم للاستمتاع بمباريات على أعلى مستوى.`,
        categoryId: allCategories.find(c => c.slug === "sports")?.id || allCategories[4]?.id || allCategories[0].id,
        authorId: testUserId,
        status: "published",
        featured: false,
        views: 890,
        aiSummary: "كأس العالم للأندية تجمع نخبة الفرق العالمية في منافسة قوية مع توقعات بمستوى استثنائي.",
      },
      {
        title: "اكتشاف علاجي جديد يبشر بالأمل لمرضى السرطان",
        slug: "new-cancer-treatment-discovery",
        excerpt: "علماء يكتشفون علاجاً واعداً قد يحدث ثورة في علاج أنواع معينة من السرطان.",
        content: `أعلن فريق من الباحثين الدوليين عن اكتشاف علاجي جديد يعد بأمل كبير لمرضى السرطان.

## التفاصيل العلمية

يعتمد العلاج الجديد على تقنية متطورة تستهدف الخلايا السرطانية بدقة عالية دون الإضرار بالخلايا السليمة.

### مراحل التجارب:
- المرحلة الأولى: اختبارات المختبر ✅
- المرحلة الثانية: تجارب على الحيوانات ✅
- المرحلة الثالثة: تجارب سريرية على البشر (جارية)

## النتائج الأولية

أظهرت النتائج الأولية فعالية عالية في علاج بعض أنواع السرطان، مع آثار جانبية محدودة.

يأمل الباحثون أن يكون هذا العلاج متاحاً للمرضى خلال السنوات القليلة القادمة بعد اكتمال جميع المراحل التجريبية.`,
        categoryId: allCategories.find(c => c.slug === "life")?.id || allCategories[2]?.id || allCategories[0].id,
        authorId: testUserId,
        status: "published",
        featured: false,
        views: 2100,
        aiSummary: "اكتشاف علاجي واعد للسرطان يستخدم تقنية متطورة لاستهداف الخلايا السرطانية بدقة مع نتائج أولية مبشرة.",
      },
      {
        title: "الاقتصاد العربي: توقعات النمو للعام المقبل",
        slug: "arab-economy-growth-forecast",
        excerpt: "تقرير شامل عن توقعات نمو الاقتصاد العربي والعوامل المؤثرة في الأداء الاقتصادي.",
        content: `يتوقع خبراء الاقتصاد نمواً ملحوظاً في الاقتصاد العربي خلال العام المقبل.

## العوامل الإيجابية

- ارتفاع أسعار النفط
- زيادة الاستثمارات الأجنبية
- تنويع مصادر الدخل
- الإصلاحات الاقتصادية

## التحديات

رغم التوقعات الإيجابية، يواجه الاقتصاد العربي بعض التحديات:

1. التضخم العالمي
2. أسعار الفائدة المرتفعة
3. التوترات الجيوسياسية

## القطاعات الواعدة

تشير التوقعات إلى نمو قوي في قطاعات:
- التكنولوجيا والابتكار
- الطاقة المتجددة
- السياحة
- الصناعات التحويلية`,
        categoryId: allCategories.find(c => c.slug === "business")?.id || allCategories[6]?.id || allCategories[0].id,
        authorId: testUserId,
        status: "published",
        featured: false,
        views: 650,
      },
      {
        title: "مهرجان الثقافة العربية يحتفي بالتراث والحداثة",
        slug: "arab-culture-festival",
        excerpt: "انطلاق فعاليات مهرجان الثقافة العربية الذي يجمع بين الأصالة والمعاصرة.",
        content: `انطلقت فعاليات مهرجان الثقافة العربية في دورته الجديدة، بحضور نخبة من الفنانين والمبدعين.

## البرنامج الثقافي

يتضمن المهرجان العديد من الفعاليات:

### المعارض الفنية
- معرض الفنون التشكيلية
- معرض الخط العربي
- معرض التصوير الفوتوغرافي

### الندوات والمحاضرات
- ندوة عن الهوية الثقافية
- محاضرات عن الأدب العربي المعاصر
- حوارات مع المبدعين

## التراث والحداثة

يسعى المهرجان إلى تحقيق توازن بين الحفاظ على التراث الثقافي العربي وتشجيع الإبداع المعاصر.`,
        categoryId: allCategories.find(c => c.slug === "life")?.id || allCategories[2]?.id || allCategories[0].id,
        authorId: testUserId,
        status: "published",
        featured: false,
        views: 420,
      },
      {
        title: "قمة عربية تناقش التحديات الإقليمية والحلول المشتركة",
        slug: "arab-summit-regional-challenges",
        excerpt: "قادة عرب يجتمعون لمناقشة أبرز القضايا الإقليمية والبحث عن حلول مشتركة.",
        content: `تنعقد القمة العربية في ظل تحديات إقليمية ودولية متعددة تتطلب تنسيقاً وتعاوناً عربياً وثيقاً.

## جدول الأعمال

تشمل القمة مناقشة العديد من الملفات الحساسة:

1. القضية الفلسطينية
2. الأمن الغذائي
3. التغير المناخي
4. التعاون الاقتصادي

## الأهداف المرجوة

يسعى المشاركون إلى:
- تعزيز التضامن العربي
- إيجاد حلول مشتركة للتحديات
- تطوير آليات التعاون
- دعم الاستقرار الإقليمي

من المتوقع أن تخرج القمة ببيان ختامي يتضمن مواقف موحدة تجاه القضايا المطروحة.`,
        categoryId: allCategories.find(c => c.slug === "world")?.id || allCategories[1]?.id || allCategories[0].id,
        authorId: testUserId,
        status: "published",
        featured: false,
        views: 1100,
      },
      {
        title: "دراسة: التطبيقات الذكية تحسن جودة حياة المرضى المزمنين",
        slug: "smart-apps-chronic-patients",
        excerpt: "بحث جديد يظهر تأثيراً إيجابياً للتطبيقات الصحية الذكية على إدارة الأمراض المزمنة.",
        content: `كشفت دراسة علمية حديثة عن دور مهم للتطبيقات الذكية في تحسين جودة حياة المرضى الذين يعانون من أمراض مزمنة.

## منهجية الدراسة

شملت الدراسة أكثر من 5000 مريض على مدى عامين، وركزت على:
- مرضى السكري
- مرضى القلب
- مرضى الضغط

## النتائج الرئيسية

### تحسينات ملحوظة:
- 65% تحسن في الالتزام بالدواء
- 48% تحسن في مراقبة الحالة الصحية
- 72% رضا عن سهولة الاستخدام

## التوصيات

يوصي الباحثون بتعزيز استخدام التكنولوجيا الصحية وتطوير تطبيقات أكثر تخصصاً لمختلف الحالات المرضية.`,
        categoryId: allCategories.find(c => c.slug === "life")?.id || allCategories[2]?.id || allCategories[0].id,
        authorId: testUserId,
        status: "draft",
        featured: false,
        views: 0,
      },
    ];

    const insertedArticles = await db
      .insert(articles)
      .values(articlesData)
      .onConflictDoNothing()
      .returning();

    console.log(`✅ Created ${insertedArticles.length} articles`);

    console.log("🎉 Seeding completed!");
    console.log(`\n📊 Summary:`);
    console.log(`   - Roles: ${allRoles.length}`);
    console.log(`   - Permissions: ${allPermissions.length}`);
    console.log(`   - Users: 1`);
    console.log(`   - Categories: ${allCategories.length}`);
    console.log(`   - Articles: ${insertedArticles.length}`);
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    process.exit(1);
  }
}

seed();
