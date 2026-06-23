/**
 * قسم كأس آسيا 2027 (السعودية) — نقاط عامة (لا تتطلب تسجيل دخول).
 *
 * النمط مطابق لـ routes/worldCup.ts لكنه مستقل: نقاط تحت /api/asian-cup/*
 * مدعومة بـ asianCupService (LEAGUE_ID=7, SEASON=2027). كل البيانات خلف كاش SWR
 * مع Cache-Control متدرّج حسب سخونة البيانات.
 *
 * ⚠️ حالة النسخة 2027 (قبل يناير 2027): المزوّد لم يرفع مباريات/مجموعات بعد،
 * فالنقاط ترجع [] / null بأمان. عند رفع البيانات يمتلئ التطبيق تلقائيًا بلا
 * تعديل كود. مسار predictions والتفاصيل الإثرائية (SportMonks/TheSports) تُضاف
 * لاحقًا في PR-A2 و PR-A3.
 */
import type { Express } from "express";
import {
  getFixtures,
  getLiveFixtures,
  getOverview,
  getStandings,
  getTournamentInfo,
  isAsianCupConfigured,
} from "../services/asianCupService";

const NOT_CONFIGURED = {
  configured: false,
  message: "تغطية كأس آسيا غير مفعّلة حاليًا",
};

export function registerAsianCupRoutes(app: Express) {
  const guard = (res: any): boolean => {
    if (!isAsianCupConfigured()) {
      res.status(503).json(NOT_CONFIGURED);
      return false;
    }
    return true;
  };

  // النظرة العامة — الطبقة الموحّدة للواجهة الرئيسية. قبل رفع المزوّد للمباريات
  // ترجع: معلومات البطولة الثابتة (المضيف/التواريخ) + قوائم فارغة + matchOfDay=null.
  // s-maxage=15: معلومات البطولة شبه ثابتة قبل الانطلاق، فنُبقيها على الـCDN ريثما
  // تُرفع المباريات. عند البدء تُحدَّث النتيجة اللحظية في PR-A2.
  app.get("/api/asian-cup/overview", async (_req, res) => {
    if (!guard(res)) return;
    try {
      const ov = await getOverview();
      res.set("Cache-Control", "public, max-age=0, s-maxage=15, stale-while-revalidate=60");
      res.json(ov);
    } catch (error) {
      console.error("[AsianCup] overview failed:", error);
      res.status(502).json({ message: "تعذر جلب نظرة كأس آسيا حاليًا" });
    }
  });

  // معلومات البطولة الثابتة (المضيف/التواريخ/عدد المنتخبات) — معروفة رسميًّا
  // قبل رفع أي مباريات، فتُعرض في الواجهة فورًا. كاش طويل: لا تتغيّر إعلانيًّا.
  app.get("/api/asian-cup/info", async (_req, res) => {
    try {
      res.set("Cache-Control", "public, max-age=600, s-maxage=3600, stale-while-revalidate=7200");
      res.json({ configured: isAsianCupConfigured(), info: getTournamentInfo() });
    } catch (error) {
      console.error("[AsianCup] info failed:", error);
      res.status(502).json({ message: "تعذر جلب معلومات البطولة حاليًا" });
    }
  });

  app.get("/api/asian-cup/fixtures", async (_req, res) => {
    if (!guard(res)) return;
    try {
      // قبل رفع المزوّد: { fixtures: [] } — الواجهة تُظهر «ستُعلن المباريات قريبًا».
      res.set("Cache-Control", "public, max-age=15, s-maxage=30, stale-while-revalidate=120");
      res.json({ fixtures: await getFixtures() });
    } catch (error) {
      console.error("[AsianCup] fixtures failed:", error);
      res.status(502).json({ message: "تعذر جلب جدول المباريات حاليًا" });
    }
  });

  app.get("/api/asian-cup/live", async (_req, res) => {
    if (!guard(res)) return;
    try {
      res.set("Cache-Control", "public, max-age=0, s-maxage=5, stale-while-revalidate=15");
      res.json({ fixtures: await getLiveFixtures() });
    } catch (error) {
      console.error("[AsianCup] live failed:", error);
      res.status(502).json({ message: "تعذر جلب المباريات المباشرة حاليًا" });
    }
  });

  app.get("/api/asian-cup/standings", async (_req, res) => {
    if (!guard(res)) return;
    try {
      // قبل رفع المزوّد للمجموعات: { groups: [] } — الواجهة تُظهر حالة فارغة.
      res.set("Cache-Control", "public, max-age=120, s-maxage=300, stale-while-revalidate=600");
      res.json({ groups: await getStandings() });
    } catch (error) {
      console.error("[AsianCup] standings failed:", error);
      res.status(502).json({ message: "تعذر جلب ترتيب المجموعات حاليًا" });
    }
  });
}
