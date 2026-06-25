/**
 * تعريب أسماء لاعبي كأس العالم تلقائيًا — مرة واحدة لكل اسم، ثم كاش للأبد.
 *
 * طبقات الحلّ بالترتيب:
 *   1) القاموس الثابت WC_PLAYER_AR (نجوم + قائمة الأخضر) — فوري
 *   2) كاش الذاكرة (هذه العملية)
 *   3) كاش قاعدة البيانات wc_player_names — يعرّب الاسم مرة واحدة للأبد عبر
 *      كل النُسخ وإعادات التشغيل
 *   4) الـAI (gpt-4o-mini) — للأسماء الجديدة فقط، دفعة واحدة، ثم تُحفظ في (2)+(3)
 *
 * كل طبقات قاعدة البيانات والـAI «أفضل جهد»: لو غابت OPENAI_API_KEY أو لم
 * يُنشأ الجدول بعد، نرجع الاسم كما هو دون أي عطل.
 */
import OpenAI from "openai";
import { inArray } from "drizzle-orm";
import { db } from "../db";
import { wcPlayerNames } from "@shared/schema";
import { WC_PLAYER_AR } from "./worldCupNames";

const openai = new OpenAI();

// كاش ذاكرة مشترك للعملية — يضم القاموس الثابت + كل ما عُرِّب لاحقًا
const memory = new Map<string, string>();

// أسماء عرفنا أنها تعذّر تعريبها (لا AI/خطأ) حتى لا نكرّر المحاولة كل طلب
const failed = new Set<string>();

function isLatin(name: string): boolean {
  return /[A-Za-z]/.test(name);
}

/**
 * يرجّع دالة بحث متزامنة بعد ضمان تعريب كل الأسماء المطلوبة.
 * استخدمها هكذا:
 *   const tr = await resolveNames([...allRawNames]);
 *   const arabic = tr(rawName);
 */
export async function resolveNames(
  rawNames: (string | null | undefined)[],
  opts?: { skipAi?: boolean },
): Promise<(name: string | null | undefined) => string> {
  const names = Array.from(
    new Set(rawNames.filter((n): n is string => !!n && n.trim().length > 0).map((n) => n.trim()))
  );

  // (1) القاموس الثابت → الذاكرة
  const unresolved: string[] = [];
  for (const name of names) {
    if (memory.has(name)) continue;
    if (WC_PLAYER_AR[name]) {
      memory.set(name, WC_PLAYER_AR[name]);
      continue;
    }
    if (!isLatin(name)) {
      // اسم عربي أصلًا — لا حاجة لتعريب
      memory.set(name, name);
      continue;
    }
    if (failed.has(name)) continue;
    unresolved.push(name);
  }

  // (3) كاش قاعدة البيانات للأسماء المتبقية
  let stillUnresolved = unresolved;
  if (unresolved.length > 0) {
    try {
      const rows = await db
        .select({ source: wcPlayerNames.source, arabic: wcPlayerNames.arabic })
        .from(wcPlayerNames)
        .where(inArray(wcPlayerNames.source, unresolved));
      for (const row of rows) memory.set(row.source, row.arabic);
      stillUnresolved = unresolved.filter((n) => !memory.has(n));
    } catch (error) {
      // الجدول غير موجود بعد أو خطأ DB — نتجاوز للـAI مباشرة
      console.warn("[WC Translator] DB cache read skipped:", (error as Error)?.message);
    }
  }

  // (4) الـAI للأسماء الجديدة فقط — دفعة واحدة.
  // skipAi: نتخطّى نداء الـAI (نُرجع فورًا بالمتاح من القاموس/DB) لمسارات لا
  // تحتمل مهلة الترجمة داخل الطلب؛ الاستدعاء بالخلفية يملأ DB للمرّة التالية.
  if (!opts?.skipAi && stillUnresolved.length > 0 && (process.env.OPENAI_API_KEY || "").trim()) {
    try {
      const translated = await aiTransliterate(stillUnresolved);
      const toPersist: { source: string; arabic: string }[] = [];
      for (const name of stillUnresolved) {
        const ar = translated[name];
        if (ar && ar.trim()) {
          memory.set(name, ar.trim());
          toPersist.push({ source: name, arabic: ar.trim() });
        } else {
          failed.add(name); // لم يرجّعه الـAI — لا نكرّر هذا الطلب
        }
      }
      // الحفظ في قاعدة البيانات «أفضل جهد» (تجاهل التعارض إن كُتب من نسخة أخرى)
      if (toPersist.length > 0) {
        try {
          await db.insert(wcPlayerNames).values(toPersist).onConflictDoNothing();
        } catch (error) {
          console.warn("[WC Translator] DB cache write skipped:", (error as Error)?.message);
        }
      }
    } catch (error) {
      console.warn("[WC Translator] AI transliteration failed:", (error as Error)?.message);
      for (const name of stillUnresolved) failed.add(name);
    }
  }

  return (name: string | null | undefined): string => {
    if (!name) return "";
    const trimmed = name.trim();
    return memory.get(trimmed) ?? trimmed;
  };
}

async function aiTransliterate(names: string[]): Promise<Record<string, string>> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "أنت خبير تعريب أسماء في سياق كرة القدم: لاعبون ومدربون وأندية ومنتخبات ومدن. " +
          "ستصلك قائمة أسماء باللاتينية — عرّب كل اسم إلى الصيغة الشائعة في التغطية الرياضية العربية " +
          "(مثل: Mbappé → كيليان مبابي، Di María → أنخيل دي ماريا، Al-Nassr → النصر، " +
          "Real Madrid → ريال مدريد، Riyadh → الرياض، Saudi Arabia U23 → السعودية تحت 23). " +
          "للأشخاص حافظ على الاسم الأول + اللقب إن توفّرا، ولا تترجم معنى الاسم بل انقل نطقه أو صيغته المتعارف عليها. " +
          'أعد JSON فقط بالشكل: {"names":[{"src":"<الاسم اللاتيني كما ورد>","ar":"<العربي>"}]}',
      },
      { role: "user", content: JSON.stringify(names) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
    max_tokens: Math.min(4000, 80 + names.length * 40),
  });

  const content = response.choices[0]?.message?.content;
  if (!content) return {};
  const parsed = JSON.parse(content) as { names?: { src?: string; ar?: string }[] };
  const out: Record<string, string> = {};
  for (const item of parsed.names ?? []) {
    if (item.src && item.ar) out[item.src] = item.ar;
  }
  return out;
}
