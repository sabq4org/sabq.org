import { describe, expect, it, vi } from "vitest";
import { mergeBotEditorBodyImages } from "../../server/services/botEditorBodyImages";

vi.mock("../../server/db", () => ({ db: {}, pool: {} }));

const url = "https://media.sabq.org/story.jpg";
const prior = `<p>قديم</p><img src="${url}" alt="أرشيف" data-caption="المصور" data-width="45%">`;
describe("newsroom body images", () => {
  it("retains existing photo, its credit and display width after a text-only patch", () => {
    const html = mergeBotEditorBodyImages(prior, "<p>نص حديث</p>");
    expect(html).toContain('alt="أرشيف"');
    expect(html).toContain('data-caption="المصور"');
    expect(html).toContain('data-width="45%"');
    expect(html).toContain("<p>نص حديث</p>");
  });
  it("edits an existing photo in place using DOM attributes", () => {
    const html = mergeBotEditorBodyImages(prior, prior, [{ url, alt: "الموقع", caption: 'صورة "اليوم"' }]);
    expect(html.match(/<img/g)).toHaveLength(1);
    expect(html).toContain('alt="الموقع"');
    expect(html).toContain('data-caption="صورة &quot;اليوم&quot;"');
  });
  it("rejects metadata for a photo outside the article", () => {
    expect(() => mergeBotEditorBodyImages(prior, prior, [{ url: url + "2", caption: null }])).toThrow();
  });
});
