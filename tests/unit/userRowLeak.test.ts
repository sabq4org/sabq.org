// Audit 2026-11-10: `GET /api/social/followers/:userId` (public) returned the
// whole joined `users` row — passwordHash, twoFactorSecret, backup codes — and
// the tasks/calendar/shorts reads did the same for logged-in callers.

import { describe, expect, it, vi } from "vitest";

const FULL_USER = {
  id: "u_admin",
  email: "admin@sabq.org",
  phone: "+966500000000",
  role: "system_admin",
  firstName: "مدير",
  lastName: "النظام",
  profileImageUrl: null,
  bio: null,
  passwordHash: "$2b$12$hash",
  twoFactorSecret: "TOTPSECRET",
  twoFactorBackupCodes: ["a", "b"],
  fcmToken: "fcm",
};

vi.mock("../../server/storage", () => ({
  storage: {
    getUser: vi.fn(async () => ({ id: "u_1" })),
    getFollowers: vi.fn(async () => [{ id: "f_1", followerId: "u_admin", followingId: "u_1", follower: { ...FULL_USER } }]),
    getFollowing: vi.fn(async () => [{ id: "f_2", followerId: "u_1", followingId: "u_admin", following: { ...FULL_USER } }]),
  },
}));
vi.mock("../../server/rbac", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  logActivity: vi.fn(),
}));

import router from "../../server/routes/socialFollowing";
import { stripSensitiveUserFields, toPublicProfile } from "../../server/utils/publicUser";

const SECRET_KEYS = ["passwordHash", "twoFactorSecret", "twoFactorBackupCodes", "fcmToken"];

async function callGet(path: string, params: Record<string, string>) {
  const layer = (router as any).stack.find((l: any) => l.route?.path === path && l.route.methods.get);
  const handler = layer.route.stack[layer.route.stack.length - 1].handle;
  let body: any;
  const res = { status: () => res, json: (b: unknown) => { body = b; return res; } };
  await handler({ params, query: {} }, res);
  return body;
}

describe("public follower lists", () => {
  it.each([
    ["/api/social/followers/:userId", "follower"],
    ["/api/social/following/:userId", "following"],
  ])("%s exposes only public profile fields", async (path, key) => {
    const body = await callGet(path, { userId: "u_1" });
    expect(body).toHaveLength(1);
    const nested = body[0][key];
    expect(nested.id).toBe("u_admin");
    expect(nested.firstName).toBe("مدير");
    for (const secret of [...SECRET_KEYS, "email", "phone", "role"]) {
      expect(nested, `${key}.${secret} leaked`).not.toHaveProperty(secret);
    }
  });
});

describe("toPublicProfile", () => {
  it("returns null for a missing row", () => {
    expect(toPublicProfile(null)).toBeNull();
    expect(toPublicProfile(undefined)).toBeNull();
  });
});

describe("stripSensitiveUserFields", () => {
  it("removes secrets at any depth and keeps everything else", () => {
    const due = new Date("2026-11-10T00:00:00Z");
    const task = {
      id: "t_1",
      dueDate: due,
      createdBy: { ...FULL_USER },
      assignedTo: null,
      comments: [{ id: "c_1", user: { ...FULL_USER } }],
    };
    const out = stripSensitiveUserFields(task);
    expect(JSON.stringify(out)).not.toMatch(/passwordHash|twoFactorSecret|twoFactorBackupCodes|fcmToken/);
    expect(out.createdBy.email).toBe("admin@sabq.org");
    expect(out.comments[0].user.id).toBe("u_admin");
    expect(out.dueDate).toBe(due);
    expect(out.assignedTo).toBeNull();
    // the input row is not mutated
    expect(task.createdBy.passwordHash).toBe("$2b$12$hash");
  });
});
