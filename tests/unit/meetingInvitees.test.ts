import { describe, expect, it } from "vitest";
import { resolveMeetingInvitees, roleGroupMembers, departmentMembers } from "../../shared/meetingInvitees";

const staff = [
  { userId: "r1", roles: ["reporter"], departmentId: "news" },
  { userId: "r2", roles: ["reporter", "opinion_author"], departmentId: null },
  { userId: "o1", roles: ["opinion_author"], departmentId: null },
  { userId: "e1", roles: ["editor"], departmentId: "news" },
  { userId: "m1", roles: ["reader"], departmentId: "marketing" },
];

describe("meeting invitee groups", () => {
  it("collects role group members", () => {
    expect(roleGroupMembers(staff, "reporter").sort()).toEqual(["r1", "r2"]);
    expect(roleGroupMembers(staff, "opinion_author").sort()).toEqual(["o1", "r2"]);
    expect(roleGroupMembers(staff, "unknown")).toEqual([]);
    expect(departmentMembers(staff, "news").sort()).toEqual(["e1", "r1"]);
  });

  it("combines reporters and opinion writers without duplicates", () => {
    const r = resolveMeetingInvitees(staff, { roleGroups: ["reporter", "opinion_author"] });
    expect(r.userIds.sort()).toEqual(["o1", "r1", "r2"]);
    expect(r.extraNames).toBe(0);
  });

  it("adds hand-picked names and counts only those outside the groups", () => {
    const r = resolveMeetingInvitees(staff, {
      roleGroups: ["reporter"],
      departmentIds: ["news"],
      memberIds: ["r1", "m1"],
    });
    expect(r.userIds.sort()).toEqual(["e1", "m1", "r1", "r2"]);
    expect(r.extraNames).toBe(1);
    expect(r.viaGroup.has("m1")).toBe(false);
    expect(r.viaGroup.has("e1")).toBe(true);
  });

  it("names only behaves like the old selected list", () => {
    const r = resolveMeetingInvitees(staff, { memberIds: ["m1", "m1"] });
    expect(r.userIds).toEqual(["m1"]);
  });
});
