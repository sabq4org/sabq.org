import { describe, expect, it } from "vitest";
import { z } from "zod";
import * as schema from "../../shared/schema";
import { partialWithoutDefaults } from "../../shared/zodPartial";

describe("partialWithoutDefaults", () => {
  const base = z.object({
    name: z.string().min(1),
    status: z.enum(["draft", "published"]).default("draft"),
    order: z.number().int().optional().default(0),
    note: z.string().nullable().default(null),
    tags: z.array(z.string()).prefault([]),
  });
  const update = partialWithoutDefaults(base);

  it("keeps absent keys absent", () => {
    expect(update.parse({})).toEqual({});
    expect(update.parse({ name: "x" })).toEqual({ name: "x" });
  });

  it("keeps explicit values and their validation", () => {
    expect(update.parse({ status: "published", order: 3, note: null, tags: ["a"] })).toEqual({
      status: "published",
      order: 3,
      note: null,
      tags: ["a"],
    });
    expect(update.safeParse({ status: "archived" }).success).toBe(false);
    expect(update.safeParse({ name: "" }).success).toBe(false);
  });

  it("differs from plain .partial(), which injects defaults in zod 4", () => {
    expect(base.partial().parse({})).toMatchObject({ status: "draft" });
  });
});

describe("shared/schema update* schemas", () => {
  const updateSchemas = Object.entries(schema).filter(
    ([name, value]) => /^update\w*Schema$/.test(name) && value instanceof z.ZodType,
  ) as Array<[string, z.ZodType]>;

  it("finds the update schemas", () => {
    expect(updateSchemas.length).toBeGreaterThan(10);
  });

  it.each(updateSchemas)("%s adds no keys to an empty body", (_name, s) => {
    const result = s.safeParse({});
    if (result.success) expect(result.data).toEqual({});
  });
});
