// «أعرِب»: إعراب جملة عربية بقراءتين مستقلتين عبر بوابة الذكاء الاصطناعي ثم مطابقتهما.
// الدقة قبل كل شيء: لا تُوصف النتيجة «متفق عليها» إلا إذا تطابقت القراءتان كلمة بكلمة.
// التكلفة: النتيجة تُحفظ 30 يومًا لكل جملة (Redis ثم ذاكرة النسخة)، وسقف يومي للجمل
// الجديدة. انظر docs/systems/irab/SYSTEM.md.

import { createHash } from "node:crypto";
import { aiGateway } from "../ai/gateway";
import { getRedisClient } from "../redis";
import { memoryCache } from "../memoryCache";
import {
  IRAB_ROLE_KEYS,
  IrabParseError,
  mergeIrabPasses,
  parseIrabPass,
  type IrabPass,
  type IrabResult,
} from "@shared/irab";

export const IRAB_FEATURE_KEY = "irab";
const PROMPT_VERSION = "v1";
const CACHE_TTL_SECONDS = 30 * 24 * 3600;
const TIMEOUT_MS = 60_000;
const MAX_TOKENS = 6000;

export function irabDailyLimit(): number {
  const n = Number(process.env.IRAB_DAILY_LIMIT);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 300;
}

export function irabEnabled(): boolean {
  return process.env.IRAB_DISABLED !== "1";
}

const OUTPUT_CONTRACT = `أعد JSON فقط، بلا أي نص قبله أو بعده، بهذا الشكل:
{
  "valid": true,
  "readings": [
    {
      "name": "",
      "sentence": "الجملة مشكولة تشكيلًا كاملًا بهذا الوجه",
      "type": "جملة فعلية",
      "meaning": "",
      "words": [
        { "word": "الكلمة مشكولة", "role": "فاعل", "roleKey": "fail", "case": "raf",
          "sign": "الضمة الظاهرة", "text": "فاعل مرفوع وعلامة رفعه الضمة الظاهرة على آخره.",
          "head": 0, "headLabel": "فاعل" }
      ],
      "notes": ["والجملة الفعلية «...» في محل رفع خبر المبتدأ «...»."]
    }
  ]
}
قواعد الحقول:
- words بترتيب الجملة، وكل كلمة مكتوبة في الجملة كلمةٌ واحدة كما كتبها المستخدم (لا تقسم «رأيتُ» أو «أخوك» أو «وذهب»؛ أعرب الأجزاء الملتصقة داخل text).
- case واحد من: raf (مرفوع أو في محل رفع)، nasb، jarr، jazm، mabni (مبني لا محل له، أو الحرف، أو الفعل المبني). الاسم المبني الذي له محل يأخذ حالة محله (raf/nasb/jarr) ويُذكر البناء في sign.
- roleKey واحد من: ${IRAB_ROLE_KEYS.join("، ")}. ism_nasikh وkhabar_nasikh لاسم وخبر كان وإنّ وأخواتهما.
- sign مختصر: العلامة ونوعها وسببها إن كانت فرعية أو مقدرة («الياء · جمع مذكر سالم»، «الفتحة المقدرة · للتعذر»، «مبني على السكون»).
- text: الإعراب الكامل بأسلوب كتب النحو المدرسية، جملة أو جملتان.
- head: فهرس الكلمة العاملة في هذه الكلمة أو التي تتعلق بها (الفاعل ← فعله، المفعول ← فعله، المجرور ← حرف الجر، المضاف إليه ← المضاف، الخبر ← المبتدأ، النعت ← منعوته)، وإلا null. headLabel كلمة أو كلمتان تصف العلاقة.
- notes: محل الجمل وشبه الجمل والمتعلَّق، وما لا يظهر في إعراب الكلمات.
- إذا احتملت الجملة غير المشكولة أكثر من وجه إعرابي صحيح شائع (مثل «ما أحسن السماء»: تعجب أو استفهام)، أعد كل وجه في readings (ثلاثة على الأكثر) مع name قصير وmeaning يبين المعنى، والأشهر أولًا. لا تخترع أوجهًا نادرة أو متكلفة.
- إذا كتب المستخدم حركات فالتزم بها؛ فإن كانت خطأً نحويًا فأعرب ما كتبه واذكر الخطأ في notes.
- إذا لم يكن النص جملة عربية مفيدة يمكن إعرابها، أعد {"valid": false, "problem": "السبب باختصار"}.`;

const SYSTEM_A = `أنت أستاذ نحو عربي متمكن تعرب الجمل إعرابًا تفصيليًا دقيقًا على مذهب الجمهور (البصريين) كما في كتب النحو المدرسية والجامعية.
ابدأ بتشكيل الجملة تشكيلًا كاملًا صحيحًا، ثم أعرب كل كلمة على التشكيل الذي اخترته.
الدقة أهم من أي شيء: لا تخمّن. إذا احتمل الموضع وجهين صحيحين فاذكرهما وجهين.
${OUTPUT_CONTRACT}`;

const SYSTEM_B = `أنت مدقق نحوي عربي. مهمتك إعراب الجملة من الصفر بمنهج منضبط، على مذهب الجمهور.
اتبع هذه الخطوات في ذهنك قبل الكتابة: (1) حدّد نوع الجملة وركنيها، (2) حدّد العوامل: الأفعال والنواسخ وحروف الجر والنصب والجزم، (3) حدّد ما يعمل فيه كل عامل، (4) شكّل أواخر الكلمات بحسب ذلك، (5) اكتب إعراب كل كلمة بعلامتها الأصلية أو الفرعية، الظاهرة أو المقدرة.
تحقق خاصة من: الأسماء الخمسة، والمثنى وجمع المذكر السالم، والممنوع من الصرف، والأسماء المقصورة والمنقوصة، والأفعال الخمسة، والمعتل الآخر في الجزم، والضمائر المتصلة.
${OUTPUT_CONTRACT}`;

function cacheKey(sentence: string): string {
  return `irab:${PROMPT_VERSION}:${createHash("sha256").update(sentence).digest("hex").slice(0, 32)}`;
}

function riyadhDay(now = new Date()): string {
  return new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
}

async function readCache(key: string): Promise<IrabResult | null> {
  const local = memoryCache.get<IrabResult>(key);
  if (local) return local;
  const redis = getRedisClient();
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as IrabResult;
    memoryCache.set(key, parsed, 10 * 60_000);
    return parsed;
  } catch {
    return null;
  }
}

async function writeCache(key: string, value: IrabResult): Promise<void> {
  memoryCache.set(key, value, 10 * 60_000);
  const redis = getRedisClient();
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(value), { expiration: { type: "EX", value: CACHE_TTL_SECONDS } });
  } catch {
    // الكاش تحسين للتكلفة فقط؛ فشله لا يُفشل الطلب.
  }
}

/** يحجز مكانًا من السقف اليومي للجمل الجديدة بعملية ذرّية (Redis عبر النسختين، وإلا ذاكرة النسخة). */
async function takeDailySlot(): Promise<boolean> {
  const limit = irabDailyLimit();
  if (limit === 0) return false;
  const key = `irab:count:${riyadhDay()}`;
  const redis = getRedisClient();
  if (redis) {
    try {
      return (await redis.incrWithTtl(key, 2 * 24 * 3600)) <= limit;
    } catch {
      // نسقط إلى عدّاد الذاكرة.
    }
  }
  // قراءة وكتابة متتاليتان بلا await بينهما: ذرّيتان داخل النسخة الواحدة.
  const current = memoryCache.get<number>(key) ?? 0;
  if (current >= limit) return false;
  memoryCache.set(key, current + 1, 26 * 3600_000);
  return true;
}

async function runPass(system: string, sentence: string): Promise<IrabPass> {
  const res = await aiGateway.complete({
    feature: IRAB_FEATURE_KEY,
    timeoutMs: TIMEOUT_MS,
    messages: [
      { role: "system", content: system },
      { role: "user", content: `أعرب الجملة التالية:\n${sentence}` },
    ],
    options: { jsonMode: true, maxTokens: MAX_TOKENS, cacheSystemPrompt: true },
  });
  if (res.truncated) throw new IrabParseError("الرد مبتور");
  return parseIrabPass(res.content, sentence);
}

export class IrabUnavailableError extends Error {
  constructor(readonly code: "IRAB_DISABLED" | "IRAB_DAILY_LIMIT" | "IRAB_FAILED", message: string) {
    super(message);
  }
}

const inflight = new Map<string, Promise<IrabResult>>();

export async function analyzeSentence(sentence: string): Promise<{ result: IrabResult; cached: boolean }> {
  if (!irabEnabled()) throw new IrabUnavailableError("IRAB_DISABLED", "خدمة الإعراب متوقفة مؤقتًا.");
  const key = cacheKey(sentence);
  const hit = await readCache(key);
  if (hit) return { result: hit, cached: true };

  const running = inflight.get(key);
  if (running) return { result: await running, cached: false };

  const job = (async () => {
    if (!(await takeDailySlot())) {
      throw new IrabUnavailableError("IRAB_DAILY_LIMIT", "وصلت الصفحة إلى حدّها اليومي من الجمل الجديدة. جرّب غدًا، أو جرّب أحد الأمثلة.");
    }
    const [a, b] = await Promise.allSettled([runPass(SYSTEM_A, sentence), runPass(SYSTEM_B, sentence)]);
    const passA = a.status === "fulfilled" ? a.value : null;
    const passB = b.status === "fulfilled" ? b.value : null;
    if (!passA && !passB) {
      const reason = a.status === "rejected" ? a.reason : null;
      console.error("[Irab] both passes failed:", (reason as Error)?.message);
      throw new IrabUnavailableError("IRAB_FAILED", "تعذر إعراب الجملة الآن. أعد المحاولة بعد قليل.");
    }
    const result = mergeIrabPasses(sentence, passA, passB);
    // نحفظ فقط ما وصلت فيه القراءتان، لتُعاد المحاولة كاملة إن سقطت إحداهما.
    if (result.agreement !== "single") await writeCache(key, result);
    return result;
  })();
  inflight.set(key, job);
  try {
    return { result: await job, cached: false };
  } finally {
    inflight.delete(key);
  }
}
