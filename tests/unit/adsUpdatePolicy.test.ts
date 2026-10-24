import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { adGroupUpdateFields, creativeUpdateFields, isAdsAdminRole } from "../../server/utils/adsUpdatePolicy";

describe("ads update policy", () => {
  it("never lets an ad-group update move the group to another campaign", () => {
    const fields = adGroupUpdateFields({ name: "مجموعة", campaignId: "victim-campaign", status: "paused" });
    expect(fields).toEqual({ name: "مجموعة", status: "paused" });
  });

  it("never lets a creative update re-parent it, even for admins", () => {
    for (const isAdmin of [false, true]) {
      const fields = creativeUpdateFields({ title: "ع", adGroupId: "victim-group" }, { isAdmin, currentStatus: "active" });
      expect(fields).not.toHaveProperty("adGroupId");
      expect(fields).toHaveProperty("title", "ع");
    }
  });

  it("keeps moderation decisions with admins", () => {
    const advertiser = { isAdmin: false, currentStatus: "rejected" };
    expect(creativeUpdateFields({ status: "active", rejectionReason: null }, advertiser)).toEqual({});
    expect(creativeUpdateFields({ status: "rejected" }, { isAdmin: false, currentStatus: "active" })).toEqual({});
    // الإيقاف والتشغيل العاديان يبقيان للمعلن
    expect(creativeUpdateFields({ status: "paused" }, { isAdmin: false, currentStatus: "active" })).toEqual({ status: "paused" });
    expect(creativeUpdateFields({ status: "active" }, { isAdmin: true, currentStatus: "rejected" })).toEqual({ status: "active" });
  });

  it("only admins manage the shared inventory", () => {
    expect(["admin", "superadmin"].every(isAdsAdminRole)).toBe(true);
    expect(["advertiser", "editor", "reporter", undefined].some(isAdsAdminRole)).toBe(false);

    const routes = readFileSync(new URL("../../server/ads-routes.ts", import.meta.url), "utf8");
    for (const method of ["post", "put", "delete"]) {
      expect(routes).toMatch(new RegExp(`router\\.${method}\\("/inventory-slots[^"]*", requireAdmin,`));
    }
  });
});
