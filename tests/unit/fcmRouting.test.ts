import { describe, expect, it } from "vitest";
import {
  groupFcmTargetsByProfile,
  resolveFcmProfile,
} from "../../server/services/fcmRouting";

describe("FCM project routing", () => {
  it("routes native SABQ production and debug tokens to the SABQ project", () => {
    expect(resolveFcmProfile("com.sabqorg.sabq")).toBe("sabq");
    expect(resolveFcmProfile("com.sabqorg.sabq.dev")).toBe("sabq");
  });

  it("keeps VARA and unlabelled migration tokens on the existing project", () => {
    expect(resolveFcmProfile("com.sabq.sports")).toBe("default");
    expect(resolveFcmProfile("com.sabq.gulfcup")).toBe("default");
    expect(resolveFcmProfile(null)).toBe("default");
  });

  it("groups mixed recipients without exposing tokens to the wrong project", () => {
    const groups = groupFcmTargetsByProfile([
      { token: "sabq-token", bundleId: "com.sabqorg.sabq" },
      { token: "vara-token", bundleId: "com.sabq.sports" },
      { token: "legacy-token", bundleId: null },
    ]);

    expect(groups.get("sabq")?.map((item) => item.token)).toEqual(["sabq-token"]);
    expect(groups.get("default")?.map((item) => item.token)).toEqual([
      "vara-token",
      "legacy-token",
    ]);
  });
});
