// استنتاج دور المنسوب من عمله الفعلي (صفحة staff أو أخبار باسمه)
// عندما تبقى users.role / user_roles على reader.
import { eq } from "drizzle-orm";
import { db } from "../db";
import { articles, staff } from "@shared/schema";

const STAFF_TYPE_TO_ROLE: Record<string, string> = {
  reporter: "reporter",
  writer: "reporter",
  field_reporter: "reporter",
  content_creator: "reporter",
  opinion_author: "opinion_author",
};

export async function inferStaffRolesFromWork(userId: string): Promise<string[]> {
  const inferred = new Set<string>();

  const [staffRow] = await db
    .select({ staffType: staff.staffType })
    .from(staff)
    .where(eq(staff.userId, userId))
    .limit(1);
  const fromStaff = staffRow?.staffType ? STAFF_TYPE_TO_ROLE[staffRow.staffType] : undefined;
  if (fromStaff) inferred.add(fromStaff);

  if (!inferred.has("reporter")) {
    const [hit] = await db
      .select({ id: articles.id })
      .from(articles)
      .where(eq(articles.reporterId, userId))
      .limit(1);
    if (hit) inferred.add("reporter");
  }

  return [...inferred];
}
