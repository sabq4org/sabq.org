// قواعد الطلب لكل جيل من نماذج Claude.
//
// جيل 5 وما بعده يرفض temperature بقيمة غير افتراضية (400)، والتفكير يعمل
// افتراضيًا فيستهلك من max_tokens ويبطئ المهام القصيرة (عنوان، تصنيف، موجز).
// نطفئ التفكير حيث يقبل النموذج ذلك:
//   - Haiku 5.5 وSonnet 5: thinking {type: "disabled"} (مقبول عند الجهد الافتراضي)
//   - Sonnet 5.5: لا يقبل disabled؛ البديل {type: "between_tools"} (لا تفكير بلا أدوات)
//   - Opus 5.x وFable وMythos: التفكير دائم ولا يُطفأ، فلا نرسل شيئًا.
// الأجيال السابقة (4.x) تبقى كما هي: temperature مسموح ولا حقل thinking.

export interface ClaudeRequestRules {
  /** هل يُرسل temperature إن طلبه المستدعي. */
  sendTemperature: boolean;
  /** قيمة حقل thinking إن وجب إرساله لإطفاء التفكير، وإلا undefined. */
  thinking?: { type: "disabled" } | { type: "between_tools" };
}

const THINKING_OFF: Record<string, ClaudeRequestRules["thinking"]> = {
  "claude-haiku-5-5": { type: "disabled" },
  "claude-sonnet-5": { type: "disabled" },
  "claude-sonnet-5-5": { type: "between_tools" },
};

const ALWAYS_NEW_FAMILIES = new Set(["fable", "mythos"]);

/** يقرأ الجيل الرئيسي من المعرّف: claude-sonnet-4-6 → 4، claude-haiku-5-5 → 5، claude-3-5-sonnet → 3. */
function claudeMajorVersion(modelId: string): { family: string | null; major: number | null } {
  const match = /^claude-(?:([a-z]+)-)?(\d+)/.exec(modelId);
  if (!match) return { family: null, major: null };
  return { family: match[1] ?? null, major: Number(match[2]) };
}

export function claudeRequestRules(modelId: string): ClaudeRequestRules {
  const { family, major } = claudeMajorVersion(modelId);
  const isNewGeneration = (family !== null && ALWAYS_NEW_FAMILIES.has(family)) || (major !== null && major >= 5);
  if (!isNewGeneration) return { sendTemperature: true };
  return { sendTemperature: false, thinking: THINKING_OFF[modelId] };
}
