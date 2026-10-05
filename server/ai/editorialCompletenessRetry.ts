import { EditorialContentIncompleteError } from "./editorialOutputGuards";

export const EDITORIAL_PRESERVATION_INSTRUCTION =
  "Edit the full news material; do not summarize it. Preserve every distinct news fact, figure, attributed statement and background detail. Remove only signatures, contact details, mail headers and repetition. Keep the requested output language and JSON structure; optimized.content must contain the complete article, not just the lead.";

/** One corrective attempt for incomplete output; transport/auth errors propagate. */
export async function withEditorialCompletenessRepair<T>(
  generateAndValidate: (feedback: string) => Promise<T>,
  initialError?: unknown,
): Promise<T> {
  const feedbackFor = (error: EditorialContentIncompleteError) =>
    `The previous generated article failed the completeness check: ${error.message}. Regenerate from the original source below, preserving all news details and closing every HTML paragraph. Do not pad the article or invent information.`;
  // If the primary model was incomplete, the fallback is already the repair.
  const initialFeedback = initialError instanceof EditorialContentIncompleteError
    ? feedbackFor(initialError)
    : "";
  try {
    return await generateAndValidate(initialFeedback);
  } catch (error) {
    if (initialFeedback || !(error instanceof EditorialContentIncompleteError)) throw error;
    return generateAndValidate(feedbackFor(error));
  }
}
