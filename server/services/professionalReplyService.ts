import { aiGateway } from "../ai/gateway";

export type ReplyPolishChannel = "contributor_ticket" | "contact_message";

export type PolishReplyInput = {
  draft: string;
  channel: ReplyPolishChannel;
  recipientName?: string | null;
  subject?: string | null;
  originalMessage?: string | null;
};

/**
 * يحوّل مسودة الإدارة إلى رد مهني كامل:
 * ترحيب بالسائل + شكر على التواصل + تحرير المضمون + خاتمة «تقبّل تحياتي».
 */
export async function polishProfessionalReply(input: PolishReplyInput): Promise<string> {
  const draft = input.draft.trim();
  if (draft.length < 3) {
    throw new Error("اكتب مسودة الرد أولاً (3 أحرف على الأقل)");
  }

  const audience =
    input.channel === "contributor_ticket"
      ? "مساهم في سبق (مراسل أو كاتب رأي/زاوية)"
      : "زائر تواصل عبر نموذج الموقع";

  const contextLines = [
    `الجمهور: ${audience}`,
    input.recipientName?.trim() ? `اسم المستلم: ${input.recipientName.trim()}` : null,
    input.subject?.trim() ? `موضوع الرسالة/الاستفسار: ${input.subject.trim()}` : null,
    input.originalMessage?.trim()
      ? `نص رسالة السائل (للسياق فقط):\n${input.originalMessage.trim().slice(0, 1500)}`
      : null,
    `مسودة الإدارة (المضمون المطلوب — لا تغيّر الحقائق):\n${draft}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const prompt = `أنت محرر مراسلات في مؤسسة «سبق» الإخبارية. مهمتك صياغة رد مهني بالعربية الفصحى الميسّرة.

القواعد:
1) ابدأ بترحيب مناسب باسم المستلم إن وُجد (مثل: مرحباً بك أستاذ/ة …)، وإلا «مرحباً بك».
2) اشكر السائل على تواصله مع سبق في جملة قصيرة.
3) حرّر مسودة الإدارة: صحّح اللغة، حسّن الأسلوب، اجعلها واضحة ومهذبة — دون اختراع وعود أو حقائق غير موجودة في المسودة.
4) اختم بـ «تقبّل تحياتي» ثم سطراً باسم «فريق سبق» أو «إدارة سبق».
5) أعد نص الرد النهائي فقط — بدون عناوين أو شرح أو علامات اقتباس حوله.
6) لا تستخدم الإنجليزية إلا إذا وردت أسماء أو مصطلحات في المسودة.
7) حافظ على نبرة سبق: مهنية، ودودة، مختصرة قدر الإمكان.

${contextLines}`;

  const res = await aiGateway.complete({
    feature: "reply-polish",
    prompt,
    options: {
      maxTokens: 800,
      temperature: 0.4,
    },
  });

  const reply = (res.content || "").trim().replace(/^["«]|["»]$/g, "").trim();
  if (!reply) {
    throw new Error("تعذر توليد الرد");
  }
  return reply;
}
