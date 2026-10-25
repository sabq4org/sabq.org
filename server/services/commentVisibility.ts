/**
 * Public comment visibility by author status.
 *
 * Approved comments from banned, suspended or (soft-)deleted accounts are
 * hidden from public listings. Same effective-status rule as
 * getUserEffectiveStatus (shared/schema.ts): a temporary ban/suspension that
 * has expired no longer hides anything. Comments anonymized by account
 * erasure (user_id = null) stay visible — that path deliberately keeps the
 * content. Admin/moderation listings never apply this filter.
 */
import { db } from "../db";
import { users } from "@shared/schema";
import { inArray, sql, type SQL } from "drizzle-orm";

export interface CommentAuthorStatus {
  status?: string | null;
  deletedAt?: Date | string | null;
  bannedUntil?: Date | string | null;
  suspendedUntil?: Date | string | null;
}

function stillActive(until: Date | string | null | undefined, now: Date): boolean {
  if (!until) return true; // no end date = indefinite
  return new Date(until).getTime() > now.getTime();
}

/** Pure predicate: should this author's approved comments be hidden publicly? */
export function isCommentAuthorHidden(
  author: CommentAuthorStatus | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!author) return false;
  if (author.deletedAt) return true;
  if (author.status === "banned" && stillActive(author.bannedUntil, now)) return true;
  if (author.status === "suspended" && stillActive(author.suspendedUntil, now)) return true;
  return false;
}

/** SQL twin of isCommentAuthorHidden for queries that LEFT JOIN users. */
export function visibleCommentAuthorCondition(): SQL {
  return sql`(${users.id} is null or not (
    ${users.deletedAt} is not null
    or (${users.status} = 'banned' and (${users.bannedUntil} is null or ${users.bannedUntil} > now()))
    or (${users.status} = 'suspended' and (${users.suspendedUntil} is null or ${users.suspendedUntil} > now()))
  ))`;
}

type CommentNode = { userId?: string | null; replies?: CommentNode[] | null };

function collectUserIds(nodes: CommentNode[], into: Set<string>): void {
  for (const n of nodes) {
    if (n.userId) into.add(n.userId);
    if (Array.isArray(n.replies)) collectUserIds(n.replies, into);
  }
}

/** Pure: drop nodes (with their reply subtree) whose author id is hidden. */
export function pruneCommentTree<T extends CommentNode>(nodes: T[], hiddenUserIds: ReadonlySet<string>): T[] {
  return nodes
    .filter((n) => !(n.userId && hiddenUserIds.has(n.userId)))
    .map((n) =>
      Array.isArray(n.replies) ? { ...n, replies: pruneCommentTree(n.replies, hiddenUserIds) } : n,
    );
}

/**
 * For listings built elsewhere (storage.getCommentsByArticle): one extra
 * lookup over the authors present, then prune. Fails open — a lookup error
 * returns the tree unchanged rather than an empty comment section.
 */
export async function hideCommentsFromInactiveAuthors<T extends CommentNode>(tree: T[]): Promise<T[]> {
  if (!Array.isArray(tree) || tree.length === 0) return tree;
  const ids = new Set<string>();
  collectUserIds(tree, ids);
  if (ids.size === 0) return tree;
  try {
    const authors = await db
      .select({
        id: users.id,
        status: users.status,
        deletedAt: users.deletedAt,
        bannedUntil: users.bannedUntil,
        suspendedUntil: users.suspendedUntil,
      })
      .from(users)
      .where(inArray(users.id, [...ids]));
    const now = new Date();
    const hidden = new Set(authors.filter((a) => isCommentAuthorHidden(a, now)).map((a) => a.id));
    return hidden.size === 0 ? tree : pruneCommentTree(tree, hidden);
  } catch (error) {
    console.error("[Comment Visibility] Author status lookup failed:", error);
    return tree;
  }
}
