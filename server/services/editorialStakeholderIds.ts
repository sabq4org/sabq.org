/**
 * Pure helpers for editorial notification recipient selection.
 * Kept free of DB / APNs imports so unit tests can cover the fan-out rules.
 */

/** Generic "صحيفة سبق" byline account — not a human colleague. */
export const NEWSPAPER_REPORTER_ID = "RnP7eDOAl5T5rGpib9_8d";

export interface ResolveStakeholdersOptions {
  /**
   * User who performed the editorial action (archive / schedule / delete / …).
   * Never notify them — otherwise an admin who entered a writer's piece
   * (`submitterId`) receives «يؤسفنا…» / «تمت الجدولة» about their own action.
   */
  excludeUserId?: string | null;
}

export function isNonHumanAccount(userId: string): boolean {
  return (
    userId === "newspaper" ||
    userId === "system" ||
    userId === "sabq-newspaper" ||
    userId === NEWSPAPER_REPORTER_ID
  );
}

/**
 * Who should receive editorial pushes for this article?
 *
 * Recipients are the **content owners** (human reporter / author), not the
 * editor who typed the piece into the CMS (`submitterId`). Submitter is only
 * a fallback when no human byline exists (e.g. newspaper account + empty
 * author), so the alert still lands somewhere.
 */
export function resolveArticleStakeholderIds(
  article: {
    reporterId?: string | null;
    authorId?: string | null;
    submitterId?: string | null;
  },
  options?: ResolveStakeholdersOptions,
): string[] {
  const seen = new Set<string>();
  const exclude = options?.excludeUserId ?? null;
  const add = (id?: string | null) => {
    if (!id || isNonHumanAccount(id) || seen.has(id) || id === exclude) return;
    seen.add(id);
  };

  const reporter = article.reporterId;
  const author = article.authorId;

  // Prefer the human byline reporter. When the dropdown still points at the
  // generic newspaper account, fall through to authorId (staff writer) so
  // someone actually receives the alert.
  if (reporter && !isNonHumanAccount(reporter)) {
    add(reporter);
  }
  if (author) {
    add(author);
  }

  // Fallback only — never fan out to submitter alongside a real author/
  // reporter. That was notifying the CMS operator on delete/schedule.
  if (seen.size === 0) {
    add(article.submitterId);
  }

  return [...seen];
}
