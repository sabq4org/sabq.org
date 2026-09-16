export type ReviewedEditorialSource = { title: string; url: string };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

/** Add only sources explicitly selected by the editor to the applied body. */
export function appendReviewedSources(
  body: string,
  sources: ReviewedEditorialSource[],
  selectedIndexes: number[],
): string {
  const selected = selectedIndexes
    .filter((index) => Number.isInteger(index) && index >= 0 && index < sources.length)
    .map((index) => sources[index])
    .filter((source) => /^https?:\/\//i.test(source?.url ?? "") && source.title?.trim());
  if (selected.length === 0) return body;
  const links = selected
    .map((source) => `<li><a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.title.trim())}</a></li>`)
    .join("");
  return `${body}<p><strong>المصادر:</strong></p><ul>${links}</ul>`;
}
