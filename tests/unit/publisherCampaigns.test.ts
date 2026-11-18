import { describe, expect, it } from "vitest";
import {
  campaignArticleStage,
  campaignArticlesInputSchema,
  campaignInputSchema,
  campaignUpdateSchema,
  countCampaignStages,
  sortActionQueue,
  waitLabel,
  waitTone,
} from "@shared/publisherCampaigns";

describe("campaignArticleStage", () => {
  it("maps article status and publisher review state to the agency stage", () => {
    expect(campaignArticleStage({ status: "published", publisherStatus: "approved" })).toBe("published");
    expect(campaignArticleStage({ status: "scheduled", publisherStatus: null })).toBe("scheduled");
    expect(campaignArticleStage({ status: "archived", publisherStatus: "pending" })).toBe("archived");
    expect(campaignArticleStage({ status: "draft", publisherStatus: "needs_changes" })).toBe("needs_changes");
    expect(campaignArticleStage({ status: "draft", publisherStatus: "pending" })).toBe("with_sabq");
    expect(campaignArticleStage({ status: "draft", publisherStatus: null })).toBe("draft");
  });
});

describe("countCampaignStages", () => {
  it("counts each stage and the total", () => {
    const counts = countCampaignStages(["published", "published", "with_sabq", "needs_changes", "draft", "scheduled"]);
    expect(counts).toMatchObject({ total: 6, published: 2, withSabq: 1, needsChanges: 1, drafts: 1, scheduled: 1 });
  });
});

describe("campaign schemas", () => {
  it("requires a name and rejects an end date before the start", () => {
    expect(campaignInputSchema.safeParse({ name: "ab" }).success).toBe(false);
    expect(campaignInputSchema.safeParse({ name: "معرض الرياض", startsOn: "2026-11-20", endsOn: "2026-11-15" }).success).toBe(false);
    expect(campaignInputSchema.safeParse({ name: "معرض الرياض", startsOn: "2026-11-15", endsOn: "2026-11-20" }).success).toBe(true);
    expect(campaignInputSchema.safeParse({ name: "معرض الرياض", startsOn: "15/11/2026" }).success).toBe(false);
  });

  it("accepts archive-only updates and caps article batches", () => {
    expect(campaignUpdateSchema.safeParse({ status: "archived" }).success).toBe(true);
    expect(campaignUpdateSchema.safeParse({ status: "deleted" }).success).toBe(false);
    expect(campaignArticlesInputSchema.safeParse({ articleIds: [] }).success).toBe(false);
    expect(campaignArticlesInputSchema.safeParse({ articleIds: Array.from({ length: 51 }, (_, i) => `a${i}`) }).success).toBe(false);
  });
});

describe("wait helpers", () => {
  const now = new Date("2026-11-18T12:00:00Z");
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();

  it("colours by age: under 12h calm, under 24h warn, then late", () => {
    expect(waitTone(ago(60), now)).toBe("calm");
    expect(waitTone(ago(13 * 60), now)).toBe("warn");
    expect(waitTone(ago(25 * 60), now)).toBe("late");
  });

  it("writes Arabic relative labels with correct dual and plural forms", () => {
    expect(waitLabel(ago(1), now)).toBe("منذ دقيقة");
    expect(waitLabel(ago(2), now)).toBe("منذ دقيقتين");
    expect(waitLabel(ago(5), now)).toBe("منذ 5 دقائق");
    expect(waitLabel(ago(40), now)).toBe("منذ 40 دقيقة");
    expect(waitLabel(ago(120), now)).toBe("منذ ساعتين");
    expect(waitLabel(ago(6 * 60), now)).toBe("منذ 6 ساعات");
    expect(waitLabel(ago(49 * 60), now)).toBe("منذ يومين");
    expect(waitLabel(ago(4 * 24 * 60), now)).toBe("منذ 4 أيام");
  });

  it("sorts oldest first without mutating the input", () => {
    const items = [{ waitingSince: ago(10) }, { waitingSince: ago(300) }, { waitingSince: ago(60) }];
    const sorted = sortActionQueue(items);
    expect(sorted.map((i) => i.waitingSince)).toEqual([ago(300), ago(60), ago(10)]);
    expect(items[0].waitingSince).toBe(ago(10));
  });
});
