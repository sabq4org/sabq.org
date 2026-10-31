import { describe, expect, it, vi } from "vitest";

const execute = vi.fn(async () => ({ rows: [{ published: "4", scheduled: "1", draft: "2", archived: "0", ready_to_publish: "0" }] }));
vi.mock("../../server/db", () => ({ db: { execute: (...a: unknown[]) => execute(...(a as [])) } }));
import { getArticleMetricsForUser, seesAllArticles } from "../../server/services/adminArticleList";

const site = { published: 951654, scheduled: 3, draft: 10, archived: 5, readyToPublish: 1 };

describe("getArticleMetricsForUser", () => {
  it("gives editors and wildcard admins the site-wide numbers", async () => {
    expect(seesAllArticles("editor", [])).toBe(true);
    expect(seesAllArticles("reporter", ["*"])).toBe(true);
    expect(seesAllArticles("reporter", ["articles.view_all"])).toBe(true);
    const r = await getArticleMetricsForUser({ id: "e1", role: "editor" }, [], async () => site);
    expect(r).toEqual(site);
    expect(execute).not.toHaveBeenCalled();
  });

  it("gives a reporter only their own counts", async () => {
    expect(seesAllArticles("reporter", ["articles.view", "articles.create"])).toBe(false);
    const siteFn = vi.fn(async () => site);
    const r = await getArticleMetricsForUser({ id: "r1", role: "reporter" }, ["articles.view"], siteFn);
    expect(siteFn).not.toHaveBeenCalled();
    expect(r).toEqual({ published: 4, scheduled: 1, draft: 2, archived: 0, readyToPublish: 0 });
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
