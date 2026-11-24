// حالة خدمات «ملفي وخدماتي» بجملة قصيرة لكل خدمة (شريط الجاهزية وصفوف الأوراق).

export type ReadinessTone = "ok" | "wait" | "action" | "muted";
export type Readiness = { tone: ReadinessTone; value: string; chip: string };

const LOADING: Readiness = { tone: "muted", value: "…", chip: "…" };

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function bylineReadiness(data: unknown): Readiness {
  const d = data as { current?: { titleAr?: string | null }; request?: { status?: string } | null } | null;
  if (!d) return LOADING;
  const status = d.request?.status;
  if (status === "pending") return { tone: "wait", value: "بانتظار المحرر", chip: "بانتظار المحرر" };
  if (status === "needs_changes") return { tone: "wait", value: "يحتاج تعديلًا", chip: "يحتاج تعديلًا" };
  if (d.current?.titleAr) return { tone: "ok", value: "منشورة", chip: "منشورة" };
  return { tone: "action", value: "أضف صفتك", chip: "أضف صفتك" };
}

export function profileReadiness(data: unknown): Readiness {
  const d = data as { profile?: { profileReviewStatus?: string | null; completionPercent?: number } | null } | null;
  if (!d) return LOADING;
  const p = d.profile;
  switch (p?.profileReviewStatus) {
    case "approved":
      return { tone: "ok", value: "معتمد", chip: "معتمد" };
    case "pending_review":
      return { tone: "wait", value: "قيد المراجعة", chip: "قيد المراجعة" };
    case "needs_correction":
      return { tone: "wait", value: "يحتاج تصحيحًا", chip: "يحتاج تصحيحًا" };
    default: {
      const pct = Math.max(0, Math.min(100, Math.round(p?.completionPercent ?? 0)));
      return { tone: "action", value: `مكتمل ${pct}٪`, chip: `مكتمل ${pct}٪` };
    }
  }
}

export function lettersReadiness(data: unknown): Readiness {
  const d = data as { letters?: Array<{ status?: string }> } | null;
  if (!d) return LOADING;
  const issued = (d.letters ?? []).filter((l) => l.status === "issued").length;
  if (issued > 0) return { tone: "ok", value: "صادرة", chip: issued > 1 ? `${issued} صادرة` : "صادرة" };
  return { tone: "action", value: "لم تُصدر بعد", chip: "لم تُصدر" };
}

export function licenseReadiness(data: unknown): Readiness {
  const d = data as {
    submitted?: boolean;
    valid?: boolean;
    expired?: boolean;
    expiringSoon?: boolean;
    needsCorrection?: boolean;
    pendingReview?: boolean;
    expiresAt?: string | null;
  } | null;
  if (!d) return LOADING;
  if (d.needsCorrection) return { tone: "wait", value: "يحتاج تصحيحًا", chip: "يحتاج تصحيحًا" };
  if (d.pendingReview) return { tone: "wait", value: "قيد المراجعة", chip: "قيد المراجعة" };
  if (d.expired) return { tone: "action", value: "منتهٍ", chip: "منتهٍ" };
  if (d.valid) {
    const until = d.expiresAt ? fmtDate(d.expiresAt) : "";
    if (d.expiringSoon) return { tone: "wait", value: until ? `ينتهي ${until}` : "ينتهي قريبًا", chip: "ينتهي قريبًا" };
    return { tone: "ok", value: until ? `ساري حتى ${until}` : "ساري", chip: "ساري" };
  }
  if (!d.submitted) return { tone: "action", value: "غير مسجّل", chip: "غير مسجّل" };
  return { tone: "muted", value: "غير مكتمل", chip: "غير مكتمل" };
}
