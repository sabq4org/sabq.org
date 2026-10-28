// بناء لوحة تبويب «الرأي» في تطبيق الديسك من صفوف جاهزة (منطق خالص).
// الاستعلامات في staffOpinionDeskService.ts؛ هنا التوزيع على المواعيد الثابتة.
import {
  resolveStaffOpinionArticleStatus,
  type StaffOpinionArticleStatus,
  type StaffOpinionBoard,
  type StaffOpinionBoardDay,
  type StaffOpinionItem,
  type StaffOpinionWriter,
} from "@shared/staffApp";
import { computeNextSlot, riyadhDateParts, riyadhDateTime } from "./opinionWritersService";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface StaffOpinionArticleRow {
  id: string;
  title: string;
  authorId: string | null;
  status: string;
  reviewStatus: string | null;
  source: string | null;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  updatedAt: Date | null;
}

export type StaffOpinionDayParts = { y: number; m: number; d: number };

export function riyadhDayKey(date: Date): string {
  const p = riyadhDateParts(date);
  return formatDayKey(p);
}

function formatDayKey(p: StaffOpinionDayParts): string {
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** YYYY-MM-DD → أجزاء اليوم، أو null إن كان التاريخ غير صالح. */
export function parseWeekStart(value: string | undefined | null): StaffOpinionDayParts | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    return null;
  }
  return { y, m, d };
}

function iso(value: Date | null | undefined): string | null {
  return value && !Number.isNaN(value.getTime()) ? value.toISOString() : null;
}

export function toStaffOpinionArticle(
  row: StaffOpinionArticleRow,
  status: StaffOpinionArticleStatus,
): NonNullable<StaffOpinionItem["article"]> {
  return {
    id: row.id,
    title: row.title,
    status,
    submittedAt: iso(row.updatedAt),
    scheduledAt: iso(row.scheduledAt),
    publishedAt: iso(row.publishedAt),
  };
}

function fallbackWriter(id: string): StaffOpinionWriter {
  return { id, name: "كاتب رأي", avatarUrl: null, jobTitle: null, fixedSlot: null };
}

/**
 * يوزّع المقالات على أسبوع من سبعة أيام يبدأ weekStart بتوقيت الرياض:
 *  1) لكل كاتب بموعد ثابت وصلت مادته خانة في يومه: نُشر ← مجدول ← مسودة بانتظار المكتب
 *     (الخانة التي لم تصل مسودتها لا تُعرض).
 *  2) مقالات مجدولة أخرى داخل الأسبوع تظهر في موعدها الفعلي.
 *  3) مسودات زائدة لكاتب بموعد ثابت تأخذ موعده التالي؛ ومسودات من لا موعد له ← unslotted.
 */
export function buildStaffOpinionBoard(input: {
  now: Date;
  weekStart: StaffOpinionDayParts;
  writers: ReadonlyMap<string, StaffOpinionWriter>;
  articles: readonly StaffOpinionArticleRow[];
}): StaffOpinionBoard {
  const { now, weekStart, writers } = input;
  const windowStart = riyadhDateTime(weekStart.y, weekStart.m, weekStart.d, "00:00");
  const windowEnd = new Date(windowStart.getTime() + 7 * DAY_MS);

  const days: StaffOpinionBoardDay[] = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(Date.UTC(weekStart.y, weekStart.m - 1, weekStart.d + i));
    return {
      date: formatDayKey({ y: day.getUTCFullYear(), m: day.getUTCMonth() + 1, d: day.getUTCDate() }),
      weekday: day.getUTCDay(),
      counts: { draft: 0, prep: 0, scheduled: 0, missing: 0 },
    };
  });

  type Mapped = { row: StaffOpinionArticleRow; status: StaffOpinionArticleStatus };
  const byWriter = new Map<string, Mapped[]>();
  for (const row of input.articles) {
    if (!row.authorId) continue;
    const status = resolveStaffOpinionArticleStatus(row);
    if (!status) continue;
    const list = byWriter.get(row.authorId) ?? [];
    list.push({ row, status });
    byWriter.set(row.authorId, list);
  }
  const ts = (d: Date | null) => (d ? d.getTime() : 0);
  for (const list of byWriter.values()) {
    // المجدول بالأقرب، والمسودات بالأحدث.
    list.sort((a, b) =>
      a.status === "scheduled" && b.status === "scheduled"
        ? ts(a.row.scheduledAt) - ts(b.row.scheduledAt)
        : ts(b.row.updatedAt) - ts(a.row.updatedAt),
    );
  }

  const writerOf = (id: string) => writers.get(id) ?? fallbackWriter(id);
  const inWindow = (d: Date | null) => !!d && d >= windowStart && d < windowEnd;
  const isPending = (s: StaffOpinionArticleStatus) => s === "new_draft" || s === "in_prep";
  const used = new Set<string>();
  const lastOccupied = new Map<string, number>();
  const occupy = (writerId: string, at: Date | null) => {
    if (!at) return;
    lastOccupied.set(writerId, Math.max(lastOccupied.get(writerId) ?? 0, at.getTime()));
  };
  const item = (
    writer: StaffOpinionWriter,
    slotAt: Date | null,
    state: StaffOpinionItem["state"],
    mapped: Mapped | null,
  ): StaffOpinionItem => ({
    writer,
    slotAt: iso(slotAt),
    state,
    article: mapped ? toStaffOpinionArticle(mapped.row, mapped.status) : null,
    deeplink: mapped ? `sabqdesk://opinion/${mapped.row.id}` : null,
  });

  const slots: StaffOpinionItem[] = [];
  const unslotted: StaffOpinionItem[] = [];

  // 1) خانات المواعيد الثابتة
  for (const writer of writers.values()) {
    if (!writer.fixedSlot) continue;
    const day = days.find((d) => d.weekday === writer.fixedSlot!.weekday);
    if (!day) continue;
    const [y, m, d] = day.date.split("-").map(Number);
    const slotAt = riyadhDateTime(y, m, d, writer.fixedSlot.publishTime);
    const own = byWriter.get(writer.id) ?? [];
    const published = own.find(
      (a) => a.status === "published" && a.row.publishedAt && riyadhDayKey(a.row.publishedAt) === day.date,
    );
    const scheduled = own.find((a) => a.status === "scheduled" && inWindow(a.row.scheduledAt));
    const pending = own.find((a) => isPending(a.status));
    const hit = published ?? scheduled ?? pending ?? null;
    if (hit) used.add(hit.row.id);
    const past = slotAt.getTime() <= now.getTime();
    if (published) {
      slots.push(item(writer, slotAt, "published", published));
      occupy(writer.id, published.row.publishedAt);
    } else if (scheduled) {
      slots.push(item(writer, scheduled.row.scheduledAt, "scheduled", scheduled));
      occupy(writer.id, scheduled.row.scheduledAt);
    } else if (pending) {
      slots.push(item(writer, slotAt, past ? "late" : "arrived", pending));
      occupy(writer.id, slotAt);
    }
    // خانة بلا مسودة لا تُعرض: التبويب للمواد التي وصلت فقط.
  }

  // 2) مجدولات أخرى داخل الأسبوع (كاتب بلا موعد ثابت، أو موعد مختلف)
  for (const [writerId, list] of byWriter) {
    for (const a of list) {
      if (used.has(a.row.id) || a.status !== "scheduled" || !inWindow(a.row.scheduledAt)) continue;
      used.add(a.row.id);
      slots.push(item(writerOf(writerId), a.row.scheduledAt, "scheduled", a));
      occupy(writerId, a.row.scheduledAt);
    }
  }

  // 3) مسودات لم تأخذ خانة
  for (const [writerId, list] of byWriter) {
    const writer = writerOf(writerId);
    for (const a of list) {
      if (used.has(a.row.id) || !isPending(a.status)) continue;
      used.add(a.row.id);
      if (writer.fixedSlot) {
        const floorMs = lastOccupied.get(writerId);
        const next = computeNextSlot(
          writer.fixedSlot.weekday,
          writer.fixedSlot.publishTime,
          floorMs ? new Date(floorMs) : null,
          now,
        );
        if (next) {
          slots.push(item(writer, next, "arrived", a));
          occupy(writerId, next);
          continue;
        }
      }
      unslotted.push(item(writer, null, "arrived", a));
    }
  }

  // بانتظار المكتب أولاً، ثم المجدول، ثم المنشور أسفل القائمة؛ وداخل كل مجموعة بالموعد.
  const rank = (s: StaffOpinionItem) =>
    s.article && isPending(s.article.status) ? 0 : s.article?.status === "scheduled" ? 1 : 2;
  slots.sort((a, b) => rank(a) - rank(b) || (a.slotAt ?? "").localeCompare(b.slotAt ?? ""));
  unslotted.sort((a, b) => (b.article?.submittedAt ?? "").localeCompare(a.article?.submittedAt ?? ""));

  for (const s of slots) {
    if (!s.slotAt) continue;
    const day = days.find((d) => d.date === riyadhDayKey(new Date(s.slotAt!)));
    if (!day) continue;
    const status = s.article?.status;
    if (status === "new_draft") day.counts.draft += 1;
    else if (status === "in_prep") day.counts.prep += 1;
    else if (status === "scheduled") day.counts.scheduled += 1;
  }

  const pendingCount = [...slots, ...unslotted].filter(
    (s) => s.article && isPending(s.article.status),
  ).length;

  return { weekStart: days[0].date, days, slots, unslotted, pendingCount };
}
