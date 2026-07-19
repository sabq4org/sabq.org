/**
 * بذر طبقة الأسماء الرياضية الموحّدة (sports_name_translations) — يُشغَّل مرة
 * واحدة بعد db:push (وتكراره آمن — كل الخطوات idempotent):
 *
 *   npx tsx scripts/seed-sports-names.ts            # كل الخطوات
 *   npx tsx scripts/seed-sports-names.ts --no-teams # بلا جلب فرق من المزوّد
 *
 * الخطوات:
 *   1) ترحيل صفوف wc_player_names القديمة إلى الجدول الموحّد (player/import).
 *   2) كل بطولات العالم من /leagues (~1100) → تعريب آلي بمفتاح «الاسم (الدولة)»
 *      — يقتل تسريب أسماء الدوريات في لوحة /sports/live نهائيًا.
 *   3) فرق الدوريات المغطاة (سعودية/خليجية/عربية/أوروبا الكبرى/قارية) خارج
 *      القواميس الثابتة + ملاعبها ومدنها → تعريب آلي.
 *
 * المتطلبات في البيئة: DATABASE_URL (+DB_DRIVER=pg لريلواي)، APIFOOTBALL_KEY،
 * OPENAI_API_KEY. التكلفة الكلية للبذر الكامل أقل من دولار (gpt-4o-mini).
 * ملاحظة إنتاج: شغّله بـ railway run كي يرث بيئة الخدمة.
 */
import { config } from "dotenv";
config();
config({ path: ".env.local", override: true });

import { sql } from "drizzle-orm";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL مفقود");
    process.exit(1);
  }
  const skipTeams = process.argv.includes("--no-teams");
  const skipLeagues = process.argv.includes("--no-leagues");

  // استيراد ديناميكي بعد تحميل env — server/db يقرأ البيئة عند الاستيراد
  const { db } = await import("../server/db");
  const { resolveSportsNames } = await import("../server/services/sportsNamesService");
  const { localizeSplCompetition, localizeSplTeamName, SPL_VENUE_AR, SPL_CITY_AR } = await import(
    "../server/services/saudiLeagueNames"
  );

  // ---------- 1) ترحيل wc_player_names ----------
  console.log("— ترحيل wc_player_names إلى الجدول الموحّد…");
  const migrated = await db.execute(sql`
    INSERT INTO sports_name_translations (entity_type, provider, source, arabic, status, origin)
    SELECT 'player', 'apifootball', source, arabic, 'auto', 'import'
    FROM wc_player_names
    ON CONFLICT (entity_type, provider, source) DO NOTHING
  `);
  console.log(`  ✓ رُحِّل ${(migrated as any)?.rowCount ?? "?"} اسم لاعب (الموجود مسبقًا تُرك)`);

  const hasAiKey = Boolean((process.env.OPENAI_API_KEY || "").trim());
  const hasAfKey = Boolean((process.env.APIFOOTBALL_KEY || "").trim());
  if (!hasAiKey) console.warn("⚠️  OPENAI_API_KEY مفقود — سيُسجَّل الناقص pending ليلتقطه الكرون لاحقًا");
  if (!hasAfKey) {
    console.warn("⚠️  APIFOOTBALL_KEY مفقود — تخطّي خطوتي البطولات والفرق");
    process.exit(0);
  }

  const { apiFootballGet } = await import("../server/services/apiFootballClient");
  const apiGet = (path: string, params: Record<string, string | number>) =>
    apiFootballGet("SeedNames", path, params, { wrapObjectResponse: true });

  // ---------- 2) كل بطولات العالم ----------
  if (!skipLeagues) {
    console.log("— جلب كل البطولات من /leagues…");
    const rows: any[] = await apiGet("leagues", {});
    const items: { id: number; name: string }[] = [];
    for (const r of rows) {
      const name = String(r?.league?.name ?? "").trim();
      const country = String(r?.country?.name ?? "").trim();
      const id = r?.league?.id;
      if (!name || !id) continue;
      // المغطى بالقاموس الثابت لا يحتاج صفًّا (باستثناء الأسماء المتكررة عبر الدول)
      const reusedGeneric = name === "Premier League" && !["England", "World", ""].includes(country);
      if (localizeSplCompetition(name) !== name && !reusedGeneric) continue;
      const key = country && country.toLowerCase() !== "world" ? `${name} (${country})` : name;
      items.push({ id, name: key });
    }
    console.log(`  ${items.length} بطولة خارج القاموس الثابت — تعريب آلي…`);
    // resolveSportsNames يتكفّل بالدفعات والتحقق والحفظ؛ نمرّر على دفعات كبيرة
    for (let i = 0; i < items.length; i += 400) {
      await resolveSportsNames("league", items.slice(i, i + 400));
      console.log(`  … ${Math.min(i + 400, items.length)}/${items.length}`);
    }
    console.log("  ✓ البطولات مبذورة");
  }

  // ---------- 3) فرق الدوريات المغطاة + ملاعبها ----------
  if (!skipTeams) {
    // بطولاتنا المنتقاة + دوريات الخليج والعرب المغطاة بالقواميس (لالتقاط الجدد)
    const LEAGUE_IDS = [
      307, 308, 309, 504, 826, 1227, // السعودية
      1, 17, 15, 39, 140, 135, 78, 61, 2, 3, 848, // عالمية/أوروبية
      301, 305, 330, 417, 406, // الخليج
      233, 200, 202, 186, 542, 387, 390, 425, // العرب
    ];
    const SEASONS = [2026, 2025];
    const teamItems = new Map<number, { id: number; name: string }>();
    const venueItems = new Map<string, { id?: number; name: string }>();
    const cityItems = new Map<string, { name: string }>();

    console.log(`— جلب فرق ${LEAGUE_IDS.length} بطولة (موسما ${SEASONS.join("/")})…`);
    for (const league of LEAGUE_IDS) {
      for (const season of SEASONS) {
        try {
          const rows: any[] = await apiGet("teams", { league, season });
          for (const r of rows) {
            const t = r?.team ?? {};
            const v = r?.venue ?? {};
            if (t.id && t.name && localizeSplTeamName(t.id, t.name) === t.name && /[A-Za-z]/.test(t.name)) {
              teamItems.set(t.id, { id: t.id, name: t.name });
            }
            if (v.name && !SPL_VENUE_AR[v.name]) venueItems.set(v.name, { id: v.id ?? undefined, name: v.name });
            if (v.city && !SPL_CITY_AR[v.city]) cityItems.set(v.city, { name: v.city });
          }
        } catch (error) {
          console.warn(`  ⚠️ league=${league} season=${season}: ${(error as Error)?.message}`);
        }
      }
    }
    console.log(
      `  خارج القواميس: ${teamItems.size} فريق، ${venueItems.size} ملعب، ${cityItems.size} مدينة — تعريب آلي…`,
    );
    const teams = [...teamItems.values()];
    for (let i = 0; i < teams.length; i += 400) {
      await resolveSportsNames("team", teams.slice(i, i + 400));
    }
    await resolveSportsNames("venue", [...venueItems.values()]);
    await resolveSportsNames("city", [...cityItems.values()]);
    console.log("  ✓ الفرق والملاعب مبذورة");
  }

  // ---------- الخلاصة ----------
  const stats = await db.execute(sql`
    SELECT entity_type, status, COUNT(*)::int AS total
    FROM sports_name_translations
    GROUP BY entity_type, status
    ORDER BY entity_type, status
  `);
  console.log("\n📊 حالة الجدول الموحّد:");
  for (const row of (stats as any).rows ?? []) {
    console.log(`  ${row.entity_type} / ${row.status}: ${row.total}`);
  }
  console.log("\n✅ اكتمل البذر. الصفوف pending يلتقطها كرون sportsNamesJob أو أعد التشغيل بعد ضبط OPENAI_API_KEY.");
  process.exit(0);
}

main().catch((error) => {
  console.error("❌ فشل البذر:", error);
  process.exit(1);
});
