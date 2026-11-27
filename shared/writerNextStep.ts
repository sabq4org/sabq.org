/**
 * «خطوتك التالية» لكاتب الرأي: خطوة واحدة يقررها الخادم وتعرضها التطبيقات
 * أعلى لوحة الكاتب. منطق خالص بلا قاعدة بيانات، فتصل أي أولوية جديدة
 * للتطبيقات المثبتة دون تحديثها.
 *
 * الترتيب (مثل شريط الأولويات في الويب WriterPriorityRail):
 * ملاحظة تحرير ← فات موعد الإرسال ← مسودة لم تُرسل ← تذكير الإرسال
 * ← فرصة تغيير اليوم ← إعلان ينتظر تفاعله ← مقالك في الطريق ← اكتب مقالك القادم.
 */

export type WriterNextStepAction =
  | "fix_article"
  | "submit_draft"
  | "new_article"
  | "slot_change"
  | "announcement"
  | "open_article"
  | "none";

export type WriterNextStep = {
  kind: string;
  /** درجة اللون في التطبيق: warning | info | success */
  tone: "warning" | "info" | "success";
  title: string;
  body: string | null;
  action: WriterNextStepAction;
  actionLabel: string | null;
  articleId: string | null;
  announcementId: string | null;
};

export type NextStepArticle = {
  id: string;
  title: string;
  status: string;
  reviewStatus: string | null;
  reviewNotes: string | null;
  scheduledAt: string | Date | null;
  updatedAt: string | Date | null;
};

export type NextStepInput = {
  articles: NextStepArticle[];
  banner: { state: "ok" | "reminder" | "late"; submitDeadline: string; nextPublishAt: string; hasUpcoming: boolean } | null;
  slotChange: { canChange: boolean; closesAt: string | null } | null;
  announcements: Array<{ id: string; kind: string; title: string; acted: boolean; myVote: number | null }>;
  now?: Date;
};

const UNSENT_MIN_AGE_MS = 30 * 60 * 1000;

function shortDate(iso: string | Date | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("ar-SA-u-nu-latn-ca-gregory", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Riyadh",
  });
}

function step(partial: Partial<WriterNextStep> & Pick<WriterNextStep, "kind" | "title" | "action">): WriterNextStep {
  return {
    tone: "info",
    body: null,
    actionLabel: null,
    articleId: null,
    announcementId: null,
    ...partial,
  };
}

/** يحتاج الإعلان فعلًا من الكاتب؟ الاستطلاع حتى يصوّت، والاستمارة والملف حتى يفتحهما. */
function announcementNeedsAction(a: NextStepInput["announcements"][number]): boolean {
  if (a.kind === "poll") return a.myVote === null;
  if (a.kind === "form" || a.kind === "file") return !a.acted;
  return false;
}

export function computeWriterNextStep(input: NextStepInput): WriterNextStep {
  const now = input.now ?? new Date();

  const needsChanges = input.articles.find((a) => a.status === "draft" && a.reviewStatus === "needs_changes");
  if (needsChanges) {
    return step({
      kind: "needs_changes",
      tone: "warning",
      title: `مقالك «${needsChanges.title}» أُعيد إليك بملاحظة`,
      body: needsChanges.reviewNotes?.trim() || null,
      action: "fix_article",
      actionLabel: "عدّل وأرسل",
      articleId: needsChanges.id,
    });
  }

  if (input.banner?.state === "late" && !input.banner.hasUpcoming) {
    return step({
      kind: "late",
      tone: "warning",
      title: "فات موعد إرسال مقال هذا الأسبوع",
      body: "أرسل مقالك الآن ليلحق بأقرب موعد متاح.",
      action: "new_article",
      actionLabel: "اكتب مقالك",
    });
  }

  const unsent = input.articles.find((a) => {
    if (a.status !== "draft" || a.reviewStatus !== null) return false;
    const updated = a.updatedAt ? new Date(a.updatedAt).getTime() : now.getTime();
    return now.getTime() - updated >= UNSENT_MIN_AGE_MS;
  });
  if (unsent) {
    return step({
      kind: "unsent_draft",
      tone: "warning",
      title: `مسودتك «${unsent.title}» لم تُرسل بعد`,
      body: "المقال محفوظ لديك فقط، ولن يراه فريق التحرير حتى ترسله.",
      action: "submit_draft",
      actionLabel: "إرسال للمراجعة الآن",
      articleId: unsent.id,
    });
  }

  if (input.banner?.state === "reminder" && !input.banner.hasUpcoming) {
    const deadline = shortDate(input.banner.submitDeadline);
    return step({
      kind: "reminder",
      title: "اقترب موعد مقالك الأسبوعي",
      body: deadline ? `أرسله قبل ${deadline}.` : null,
      action: "new_article",
      actionLabel: "اكتب مقالك",
    });
  }

  if (input.slotChange?.canChange) {
    const closes = shortDate(input.slotChange.closesAt);
    return step({
      kind: "slot_change",
      title: "فرصة تغيير يومك الأسبوعي مفتوحة",
      body: closes ? `مرة واحدة، حتى ${closes}.` : "مرة واحدة.",
      action: "slot_change",
      actionLabel: "اختر يومك",
    });
  }

  const pending = input.announcements.find(announcementNeedsAction);
  if (pending) {
    return step({
      kind: "announcement",
      title: pending.title,
      body: pending.kind === "poll" ? "صوّت قبل أن يُغلق الاستطلاع." : "إعلان من إدارة كتّاب الرأي ينتظرك.",
      action: "announcement",
      actionLabel: pending.kind === "poll" ? "صوّت" : "افتح",
      announcementId: pending.id,
    });
  }

  const inPipeline = input.articles.find(
    (a) => a.status === "scheduled" || (a.status === "draft" && (a.reviewStatus === "pending_review" || a.reviewStatus === "approved")),
  );
  if (inPipeline) {
    const when = inPipeline.status === "scheduled" ? shortDate(inPipeline.scheduledAt) : null;
    return step({
      kind: inPipeline.status === "scheduled" ? "scheduled" : "pending_review",
      tone: "success",
      title: inPipeline.status === "scheduled" ? `مقالك «${inPipeline.title}» مجدول` : `مقالك «${inPipeline.title}» عند فريق التحرير`,
      body: when ? `يُنشر ${when}.` : "سيصلك تنبيه حين يُجدول.",
      action: "open_article",
      actionLabel: null,
      articleId: inPipeline.id,
    });
  }

  const next = input.banner ? shortDate(input.banner.nextPublishAt) : null;
  return step({
    kind: "write_next",
    title: "اكتب مقالك القادم",
    body: next ? `موعدك القادم ${next}.` : null,
    action: "new_article",
    actionLabel: "إضافة مقال",
  });
}
