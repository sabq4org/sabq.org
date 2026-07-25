/**
 * محلّل JSON متسامح لردود Visual AI (أسوار markdown + إصلاح القطع).
 * ملف منفصل حتى تُختبر المنطق دون تحميل عميل Gemini.
 */

/**
 * يقشّر أسوار ```json ويلتقط أول كتلة {..} متوازنة.
 * إن قُطع الرد (MAX_TOKENS) يحاول إغلاق الأقواس بعد حذف الذيل الناقص.
 */
export function parseVisualAiJson(raw: string): Record<string, unknown> | null {
  if (!raw?.trim()) return null;

  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    s = fence[1].trim();
  } else {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }

  const start = s.indexOf("{");
  if (start < 0) return null;
  s = s.slice(start);

  const tryParse = (text: string): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  };

  const balanced = extractBalancedObject(s);
  if (balanced) {
    const ok = tryParse(balanced);
    if (ok) return ok;
  }

  const repaired = repairTruncatedJsonObject(s);
  if (repaired) {
    const ok = tryParse(repaired);
    if (ok) return ok;
  }

  return null;
}

function extractBalancedObject(s: string): string | null {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return s.slice(0, i + 1);
    }
  }
  return null;
}

/** يغلق JSON مقطوعاً بعد إزالة مفتاح/قيمة ناقصة في الذيل. */
function repairTruncatedJsonObject(s: string): string | null {
  let text = s
    .replace(/,\s*"[^"]*$/s, "")
    .replace(/,\s*"[^"]*"\s*:\s*("[^"]*)?$/s, "")
    .replace(/,\s*"[^"]*"\s*:\s*\[[^\]]*$/s, "")
    .replace(/,\s*"[^"]*"\s*:\s*\{[^}]*$/s, "")
    .replace(/,\s*$/s, "")
    .trim();

  if (!text.startsWith("{")) return null;

  const stack: Array<"{" | "["> = [];
  let inStr = false;
  let esc = false;
  for (const ch of text) {
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") stack.push("{");
    else if (ch === "[") stack.push("[");
    else if (ch === "}" || ch === "]") stack.pop();
  }

  // سلسلة مفتوحة في الذيل → احذف من آخر علامة اقتباس غير مغلقة
  if (inStr) {
    const lastQuote = text.lastIndexOf('"');
    if (lastQuote > 0) {
      text = text.slice(0, lastQuote).replace(/,\s*$/s, "").trim();
      return repairTruncatedJsonObject(text);
    }
    return null;
  }

  while (stack.length) {
    text += stack.pop() === "{" ? "}" : "]";
  }

  return text;
}
