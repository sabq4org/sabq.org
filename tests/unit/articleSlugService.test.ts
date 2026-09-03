import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
  },
}));

vi.mock("../../server/db", () => ({ db: mockDb }));

import { formatSlugCandidate, resolveUniqueArticleSlug } from "../../server/services/articleSlugService";

describe("articleSlugService", () => {
  describe("formatSlugCandidate", () => {
    it("appends counter with hyphen", () => {
      expect(formatSlugCandidate("amanat-asir-garden", 2)).toBe("amanat-asir-garden-2");
      expect(formatSlugCandidate("amanat-asir-garden", 10)).toBe("amanat-asir-garden-10");
    });

    it("ensures candidate does not exceed max length", () => {
      const longBase = "a".repeat(150);
      const formatted = formatSlugCandidate(longBase, 2, 150);
      expect(formatted.length).toBeLessThanOrEqual(150);
      expect(formatted).toBe(`${"a".repeat(148)}-2`);
    });

    it("strips trailing hyphens from base before appending suffix", () => {
      const formatted = formatSlugCandidate("slug-base-", 2, 150);
      expect(formatted).toBe("slug-base-2");
    });
  });

  describe("resolveUniqueArticleSlug", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("returns empty or invalid input as-is", async () => {
      expect(await resolveUniqueArticleSlug("")).toBe("");
      expect(await resolveUniqueArticleSlug("   ")).toBe("   ");
    });

    it("returns original slug when there is no conflict in database", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await resolveUniqueArticleSlug("حديقة-المروج-أبها");
      expect(result).toBe("حديقة-المروج-أبها");
    });

    it("appends -2 when initial slug conflicts with another article", async () => {
      let callCount = 0;
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(async () => {
              callCount++;
              if (callCount === 1) {
                // First call: initial slug conflicts
                return [{ id: "other-article-id" }];
              }
              // Second call: slug-2 is free
              return [];
            }),
          }),
        }),
      });

      const result = await resolveUniqueArticleSlug("حديقة-المروج-أبها", "my-article-id");
      expect(result).toBe("حديقة-المروج-أبها-2");
      expect(callCount).toBe(2);
    });

    it("increments to -3 if -2 is also taken", async () => {
      let callCount = 0;
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(async () => {
              callCount++;
              if (callCount === 1) {
                return [{ id: "article-1" }];
              }
              if (callCount === 2) {
                return [{ id: "article-2" }];
              }
              return [];
            }),
          }),
        }),
      });

      const result = await resolveUniqueArticleSlug("حديقة-المروج-أبها");
      expect(result).toBe("حديقة-المروج-أبها-3");
      expect(callCount).toBe(3);
    });

    it("handles candidates that already end in a numeric suffix correctly", async () => {
      let callCount = 0;
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(async () => {
              callCount++;
              if (callCount === 1) {
                // "slug-2" exists
                return [{ id: "article-1" }];
              }
              // "slug-3" is free
              return [];
            }),
          }),
        }),
      });

      const result = await resolveUniqueArticleSlug("حديقة-المروج-أبها-2");
      expect(result).toBe("حديقة-المروج-أبها-3");
    });

    it("does not flag conflict when candidate is matched on same article (excludeArticleId)", async () => {
      // With excludeArticleId, the WHERE condition has ne(table.id, excludeArticleId),
      // so DB returns empty array if only the excluded article had that slug.
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await resolveUniqueArticleSlug("حديقة-المروج-أبها", "75de2211-d73f-4265-a29e-b92e59d035b8");
      expect(result).toBe("حديقة-المروج-أبها");
    });
  });
});
