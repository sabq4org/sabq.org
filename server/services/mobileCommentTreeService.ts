import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { articles, comments, users } from "@shared/schema";

/**
 * شجرة التعليقات المعتمدة لمقال (مستوى رد واحد) كما يعرضها تطبيق الجوال.
 * محايدة للمستخدم فتُكيَّش في المسار. `null` = لا مقال بهذا السلاق.
 */
export async function getApprovedCommentTree(slug: string) {
  const [article] = await db
    .select({ id: articles.id })
    .from(articles)
    .where(eq(articles.slug, slug))
    .limit(1);

  if (!article) {
    return null;
  }

  // Public view: approved comments only. Threading is one level deep —
  // top-level rows carry their replies inline, matching what the web's
  // `storage.getCommentsByArticle` produces.
  const rows = await db
    .select({
      comment: comments,
      user: {
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        profileImageUrl: users.profileImageUrl,
      },
    })
    .from(comments)
    .leftJoin(users, eq(comments.userId, users.id))
    .where(and(eq(comments.articleId, article.id), eq(comments.status, "approved")))
    .orderBy(comments.createdAt);

  type CommentNode = (typeof rows)[number]["comment"] & {
    user: (typeof rows)[number]["user"];
    replies: CommentNode[];
  };

  const nodes = new Map<string, CommentNode>();
  const topLevel: CommentNode[] = [];
  for (const r of rows) {
    nodes.set(r.comment.id, { ...r.comment, user: r.user, replies: [] });
  }
  for (const r of rows) {
    const node = nodes.get(r.comment.id)!;
    if (r.comment.parentId) {
      const parent = nodes.get(r.comment.parentId);
      if (parent) parent.replies.push(node);
      else topLevel.push(node);
    } else {
      topLevel.push(node);
    }
  }
  return topLevel;
}
