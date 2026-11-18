import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NASHR_EDITOR_CAPABILITIES,
  PROTECTED_ARTICLE_IDS,
  disabledEditorCapabilities,
  isEditorCapabilityEnabled,
  isProtectedArticleId,
  protectedArticleIds,
} from "../../shared/botEditorCapabilities";
import { botGptDailyCap } from "../../shared/botEditorCapabilities";

afterEach(() => vi.unstubAllEnvs());

describe("kill switch BOT_EDITOR_DISABLED_CAPS", () => {
  it("is empty by default and enables everything", () => {
    expect(disabledEditorCapabilities("").size).toBe(0);
    expect(disabledEditorCapabilities(undefined).size).toBe(0);
    for (const cap of NASHR_EDITOR_CAPABILITIES) expect(isEditorCapabilityEnabled(cap, "")).toBe(true);
  });
  it("disables only the named capabilities and ignores unknown names", () => {
    const off = disabledEditorCapabilities(" article.delete , image.generate_gpt, typo.cap ");
    expect([...off].sort()).toEqual(["article.delete", "image.generate_gpt"]);
    expect(isEditorCapabilityEnabled("article.edit", "article.delete")).toBe(true);
    expect(isEditorCapabilityEnabled("article.delete", "article.delete")).toBe(false);
  });
  it("star disables every capability", () => {
    expect(disabledEditorCapabilities("*").size).toBe(NASHR_EDITOR_CAPABILITIES.length);
  });
  it("reads the environment on every call", () => {
    vi.stubEnv("BOT_EDITOR_DISABLED_CAPS", "article.push");
    expect(isEditorCapabilityEnabled("article.push")).toBe(false);
    vi.stubEnv("BOT_EDITOR_DISABLED_CAPS", "");
    expect(isEditorCapabilityEnabled("article.push")).toBe(true);
  });
  it("has unique capability names", () => {
    expect(new Set(NASHR_EDITOR_CAPABILITIES).size).toBe(NASHR_EDITOR_CAPABILITIES.length);
  });
});

describe("protected articles", () => {
  it("lists the five articles by full id (prefixes as agreed with Ali)", () => {
    expect(PROTECTED_ARTICLE_IDS.map((id) => id.slice(0, 8)).sort()).toEqual(["4cfda185", "690f5287", "7696f378", "8dab8d72", "d05bc8d5"]);
    for (const id of PROTECTED_ARTICLE_IDS) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
  it("matches full ids only, never a prefix", () => {
    expect(isProtectedArticleId("d05bc8d5-dc9e-40d1-a07d-27dbe3ebd33a")).toBe(true);
    expect(isProtectedArticleId("d05bc8d5")).toBe(false);
    expect(isProtectedArticleId("another-article")).toBe(false);
  });
  it("accepts extra ids from BOT_EDITOR_PROTECTED_ARTICLE_IDS and drops malformed entries", () => {
    const ids = protectedArticleIds("extra-article-01, x, bad id");
    expect(ids.has("extra-article-01")).toBe(true);
    expect(ids.has("x")).toBe(false);
    expect(ids.size).toBe(PROTECTED_ARTICLE_IDS.length + 1);
  });
});

describe("GPT image daily cap", () => {
  it("defaults to 20, accepts integers and zero, and falls back on garbage", () => {
    expect(botGptDailyCap(undefined)).toBe(20);
    expect(botGptDailyCap("")).toBe(20);
    expect(botGptDailyCap("5")).toBe(5);
    expect(botGptDailyCap("0")).toBe(0);
    expect(botGptDailyCap("-3")).toBe(20);
    expect(botGptDailyCap("abc")).toBe(20);
  });
});
