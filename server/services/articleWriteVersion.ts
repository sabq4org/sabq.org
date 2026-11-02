import { sql } from "drizzle-orm";
import { articles } from "@shared/schema";

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
