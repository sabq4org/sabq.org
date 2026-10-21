import { describe, expect, it } from "vitest";
import {
  ARTICLE_RESTORABLE_FIELDS,
  buildRestorePatch,
  changedSnapshotFields,
  contentParagraphs,
  contentWordCount,
  diffContent,
  inlineChanges,
  parseStoredSnapshot,
  resolveRestoreFields,
  snapshotFromArticle,
  summarizeContentDiff,
  versionActionFor,
} from "@shared/articleHistory";

const original = snapshotFromArticle({
  title: "سقوط ثلاثة أطفال في مجرى سيل بمكة",
  subtitle: null,
  excerpt: "تواصل الفرق البحث عن الطفل الثالث.",
  content: "<p>باشر الدفاع المدني الحادثة.</p><p>تتواصل عمليات البحث عن الطفل الثالث.</p><h2>فاجعة المغمس</h2>",
  categoryId: "cat-local",
  imageUrl: "https://example.test/a.jpg",
  status: "published",
  newsType: "regular",
  seo: { keywords: ["مكة", "السيول"] },
});

describe("snapshotFromArticle", () => {
  it("reads keywords from seo and defaults missing fields", () => {
    expect(original.keywords).toEqual(["مكة", "السيول"]);
    expect(snapshotFromArticle({ title: "x" })).toMatchObject({ content: "", keywords: [], status: "draft", subtitle: null });
  });
});

describe("changedSnapshotFields + inlineChanges", () => {
  it("lists every changed field and keeps before/after values for short ones", () => {
    const edited = { ...original, title: "العثور على الطفل الثالث", excerpt: "انتهى البحث.", content: "<p>جديد</p>", categoryId: "cat-accidents" };
    const fields = changedSnapshotFields(original, edited);
    expect(fields).toEqual(["title", "excerpt", "content", "categoryId"]);
    const changes = inlineChanges(original, edited, fields);
    expect(changes.map((c) => c.field)).toEqual(["title", "excerpt", "categoryId"]);
    expect(changes[0]).toEqual({ field: "title", oldValue: original.title, newValue: "العثور على الطفل الثالث" });
  });

  it("treats null and empty string as the same and compares keywords by value", () => {
    const same = { ...original, subtitle: "" as unknown as null, keywords: ["مكة", "السيول"] };
    expect(changedSnapshotFields(original, same)).toEqual([]);
    expect(changedSnapshotFields(original, { ...original, keywords: ["مكة"] })).toEqual(["keywords"]);
  });

  it("returns nothing for a first save", () => {
    expect(changedSnapshotFields(null, original)).toEqual([]);
  });
});

describe("versionActionFor", () => {
  it("prefers status transitions over plain edits", () => {
    const draft = { ...original, status: "draft" };
    expect(versionActionFor({ before: null, after: draft })).toBe("created");
    expect(versionActionFor({ before: draft, after: original })).toBe("published");
    expect(versionActionFor({ before: original, after: { ...original, status: "archived" } })).toBe("archived");
    expect(versionActionFor({ before: original, after: draft })).toBe("unpublished");
    expect(versionActionFor({ before: draft, after: { ...draft, title: "x" }, autosave: true })).toBe("autosave");
    expect(versionActionFor({ before: original, after: { ...original, title: "x" } })).toBe("updated");
  });
});

describe("resolveRestoreFields", () => {
  it("defaults to every restorable field and rejects unknown or non-restorable ones", () => {
    expect(resolveRestoreFields(undefined)).toEqual([...ARTICLE_RESTORABLE_FIELDS]);
    expect(resolveRestoreFields([])).toEqual([...ARTICLE_RESTORABLE_FIELDS]);
    expect(resolveRestoreFields(["content", "title"])).toEqual(["title", "content"]);
    expect(resolveRestoreFields(["status"])).toBeNull();
    expect(resolveRestoreFields("title")).toBeNull();
  });
});

describe("buildRestorePatch", () => {
  it("restores excerpt with its summary, merges keywords into seo, and never touches status", () => {
    const patch = buildRestorePatch({
      snapshot: original,
      fields: ["excerpt", "keywords", "title"],
      currentSeo: { metaTitle: "عنوان SEO", keywords: ["قديم"] },
    });
    expect(patch).toEqual({
      excerpt: original.excerpt,
      aiSummary: original.excerpt,
      aiBullets: null,
      aiBulletsGeneratedAt: null,
      seo: { metaTitle: "عنوان SEO", keywords: ["مكة", "السيول"] },
      title: original.title,
    });
    expect(buildRestorePatch({ snapshot: original, fields: ARTICLE_RESTORABLE_FIELDS, currentSeo: null })).not.toHaveProperty("status");
  });
});

describe("content diff", () => {
  it("splits HTML into readable paragraphs and counts words", () => {
    expect(contentParagraphs(original.content)).toEqual([
      "باشر الدفاع المدني الحادثة.",
      "تتواصل عمليات البحث عن الطفل الثالث.",
      "فاجعة المغمس",
    ]);
    expect(contentWordCount("<p>واحد اثنان&nbsp;ثلاثة</p>")).toBe(3);
  });

  it("shows removed and added paragraphs, and word changes inside an edited paragraph", () => {
    const after = "<p>باشر الدفاع المدني الحادثة.</p><p>تتواصل عمليات البحث عن الطفل الأخير.</p><p>وأهاب الدفاع المدني بالجميع الحذر.</p>";
    const diff = diffContent(original.content, after);
    expect(diff[0]).toEqual({ type: "same", text: "باشر الدفاع المدني الحادثة." });
    expect(diff[1].type).toBe("changed");
    if (diff[1].type === "changed") {
      expect(diff[1].words.filter((w) => w.type !== "same")).toEqual([
        { type: "removed", value: "الثالث." },
        { type: "added", value: "الأخير." },
      ]);
    }
    expect(summarizeContentDiff(diff)).toEqual({ removed: 1, added: 1, changed: 1 });
    expect(summarizeContentDiff(diffContent(original.content, "<p>باشر الدفاع المدني الحادثة.</p>"))).toEqual({ removed: 2, added: 0, changed: 0 });
  });
});

describe("parseStoredSnapshot", () => {
  it("reads keywords stored at the top level of a version snapshot", () => {
    const stored = JSON.parse(JSON.stringify(original)) as Record<string, unknown>;
    expect(parseStoredSnapshot(stored)).toEqual(original);
    expect(snapshotFromArticle(stored).keywords).toEqual([]);
  });
});
