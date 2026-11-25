import { and, gt, sql } from "drizzle-orm";
import { articleEditLocks, articles } from "@shared/schema";

/** API timestamps have millisecond precision, including rows created by SQL. */
export function matchesArticleVersion(expected: Date) {
  return sql`date_trunc('milliseconds', ${articles.updatedAt}) = ${expected.toISOString()}::timestamptz at time zone 'UTC'`;
}
export const nextArticleVersion = sql`greatest(date_trunc('milliseconds', clock_timestamp() at time zone 'UTC'), ${articles.updatedAt} + interval '1 millisecond')`;

/** «قفل المسودات»: مسودة مقفلة لا يكتب عليها إلا صاحب القفل (shared/draftLock.ts). */
export function draftLockAllowsWriter(userId: string) {
  return sql`(${articles.draftLockedBy} is null or ${articles.draftLockedBy} = ${userId} or ${articles.status} <> 'draft')`;
}

/** قفل التحرير المؤقت لزميل، وقفل المسودة الدائم، كلاهما يمنع الكتابة. */
export function articleLockAllowsWriter(userId: string) {
  return sql`(not exists (select 1 from article_edit_locks l where l.article_id = ${articles.id}
    and l.user_id <> ${userId} and l.expires_at > (clock_timestamp() at time zone 'UTC'))
    and ${draftLockAllowsWriter(userId)})`;
}

/**
 * «مكتب سبق» (التطبيق وbot-desk) على مقالات الرأي: قفل التحرير المؤقت لا يمنعه
 * إلا إن كان حيًّا، أي وصله نبض المحرر خلال آخر دقيقتين. المحرر المفتوح يرسل
 * نبضًا كل 45 ثانية (وكروم يبطئه في الخلفية إلى مرة في الدقيقة)، فقفل بلا نبض
 * منذ دقيقتين هو تبويب مجمّد أو مغلق دون فكّه. الويب والجوال لا يتغيران.
 * الحفظ اللاحق من المحرر يحمل expectedUpdatedAt فيرفض بتعارض ولا يكتب فوق تعديل المكتب.
 */
export const DESK_IDLE_EDIT_LOCK_SECONDS = 120;

const deskLockCutoff = sql.raw(`(clock_timestamp() at time zone 'UTC') - interval '${DESK_IDLE_EDIT_LOCK_SECONDS} seconds'`);

/** شرط قفل تحرير حي (لم ينتهِ ووصله نبض حديث) على جدول article_edit_locks. */
export function liveDeskEditLock() {
  return and(
    gt(articleEditLocks.expiresAt, sql`(clock_timestamp() at time zone 'UTC')`),
    gt(articleEditLocks.lastHeartbeat, deskLockCutoff),
  )!;
}

/** مثل articleLockAllowsWriter، لكن قفل التحرير الخامل لا يمنع «مكتب سبق». قفل المسودات يبقى مانعًا. */
export function deskLockAllowsWriter(userId: string) {
  return sql`(not exists (select 1 from article_edit_locks l where l.article_id = ${articles.id}
    and l.user_id <> ${userId} and l.expires_at > (clock_timestamp() at time zone 'UTC')
    and l.last_heartbeat > ${deskLockCutoff})
    and ${draftLockAllowsWriter(userId)})`;
}
