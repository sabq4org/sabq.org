/**
 * مُقترب — مساعد الكاتب الذكي (اقتراح عناوين، تدقيق لغوي، وصف مختصر).
 */
import { aiManager } from "../ai-manager";

const MODEL = { provider: "openai" as const, model: "gpt-4o-mini", jsonMode: true };

function extractJson(raw: string): unknown | null {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function truncate(text: string, max = 6000): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}

/** يقترح 3 عناوين جذابة بناءً على المحتوى. */
export async function suggestTitles(opts: {
  content: string;
  currentTitle?: string;
}): Promise<{ titles: string[] }> {
  const plain = truncate(stripHtml(opts.content));
  if (plain.length < 30) {
    throw new Error("المحتوى قصير جداً — اكتب فقرة على الأقل لاقتراح عناوين");
  }

  const prompt = `أنت محرر عناوين عربي في منصة تحليلية اسمها «مُقترب».
اقترح 3 عناوين جذابة لموضوع رأي/تحليل (ليست عناوين خبر عاجل).
العناوين قصيرة (8–14 كلمة)، واضحة، بلا علامات اقتباس.

${opts.currentTitle ? `العنوان الحالي: ${opts.currentTitle}\n` : ""}
المحتوى:
${plain}

أعد JSON فقط بهذا الشكل:
{"titles":["عنوان 1","عنوان 2","عنوان 3"]}`;

  const res = await aiManager.generate(prompt, MODEL);
  if (res.error) throw new Error(res.error);

  const parsed = extractJson(res.content || "") as { titles?: string[] } | null;
  const titles = (parsed?.titles || [])
    .map((t) => String(t).trim())
    .filter(Boolean)
    .slice(0, 3);

  if (titles.length === 0) throw new Error("لم يُرجع الذكاء الاصطناعي عناوين صالحة");
  return { titles };
}

/** يصحّح الأخطاء الإملائية والنحوية ويعيد النص المُصحَّح. */
export async function proofreadContent(opts: {
  content: string;
  title?: string;
}): Promise<{ correctedText: string; notes: string }> {
  const plain = truncate(stripHtml(opts.content));
  if (plain.length < 20) {
    throw new Error("المحتوى قصير جداً للتدقيق");
  }

  const prompt = `أنت مدقق لغوي عربي محترف. صحّح الأخطاء الإملائية والنحوية والترقيم في النص التالي.
لا تغيّر المعنى ولا تضف معلومات جديدة. حافظ على أسلوب الكاتب.

${opts.title ? `العنوان: ${opts.title}\n` : ""}
النص:
${plain}

أعد JSON فقط:
{"correctedText":"النص المصحح كاملاً","notes":"ملخص قصير لأهم التصحيحات (جملة أو جملتان)"}`;

  const res = await aiManager.generate(prompt, MODEL);
  if (res.error) throw new Error(res.error);

  const parsed = extractJson(res.content || "") as { correctedText?: string; notes?: string } | null;
  const correctedText = String(parsed?.correctedText || "").trim();
  if (!correctedText) throw new Error("لم يُرجع الذكاء الاصطناعي نصاً مصححاً");

  return {
    correctedText,
    notes: String(parsed?.notes || "تم التدقيق اللغوي").trim(),
  };
}

/** يولّد وصفاً مختصراً للموضوع. */
export async function suggestExcerpt(opts: {
  content: string;
  title: string;
}): Promise<{ excerpt: string }> {
  const plain = truncate(stripHtml(opts.content));
  if (plain.length < 30) {
    throw new Error("المحتوى قصير جداً لتوليد وصف");
  }

  const prompt = `اكتب وصفاً مختصراً (جملتان كحد أقصى، 120–180 حرفاً) لموضوع تحليلي عربي.
الوصف يجذب القارئ ولا يكرر العنوان حرفياً.

العنوان: ${opts.title}
المحتوى:
${plain}

أعد JSON فقط: {"excerpt":"الوصف المختصر"}`;

  const res = await aiManager.generate(prompt, MODEL);
  if (res.error) throw new Error(res.error);

  const parsed = extractJson(res.content || "") as { excerpt?: string } | null;
  const excerpt = String(parsed?.excerpt || "").trim();
  if (!excerpt) throw new Error("لم يُرجع الذكاء الاصطناعي وصفاً");

  return { excerpt };
}
