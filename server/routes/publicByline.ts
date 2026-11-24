// «صفتك تحت اسمك» — مسار ذاتي للكاتب/المراسل، ومسار مراجعة للمحرر.
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth";
import { getUserPermissions } from "../rbac";
import { PUBLIC_BYLINE_STATUSES } from "@shared/publicByline";
import {
  PublicBylineError,
  approvePublicByline,
  getMyPublicByline,
  isSelfBioLocked,
  listPublicBylineRequests,
  requestPublicBylineChanges,
  submitPublicByline,
  withdrawPublicByline,
} from "../services/publicBylineRequestsService";

const router = Router();

/** نفس صلاحية اعتماد ملفات المنسوبين. */
async function requireReviewer(req: Request, res: Response, next: () => void) {
  const user = req.user as { id: string } | undefined;
  if (!user) return res.status(401).json({ message: "غير مصرح" });
  const perms = await getUserPermissions(user.id);
  if (perms.includes("*") || perms.includes("staff_profiles.manage")) return next();
  return res.status(403).json({ message: "لا تملك صلاحية مراجعة الملفات" });
}

function sendError(res: Response, error: unknown, label: string) {
  if (error instanceof PublicBylineError) return res.status(error.status).json({ message: error.message });
  console.error(`[PublicByline] ${label}:`, error);
  return res.status(500).json({ message: "تعذر تنفيذ الطلب" });
}

const userId = (req: Request) => (req.user as { id: string }).id;

router.use("/api/public-byline", isAuthenticated);

/** يسبق PATCH /api/auth/user في routes.ts: الكاتب لا يكتب users.bio بنفسه. */
router.patch("/api/auth/user", async (req, _res, next) => {
  const user = req.user as { id?: string } | undefined;
  if (user?.id && req.body && typeof req.body === "object" && "bio" in req.body) {
    try {
      if (await isSelfBioLocked(user.id)) delete (req.body as Record<string, unknown>).bio;
    } catch (error) {
      console.warn("[PublicByline] bio lock check failed, continuing:", error);
    }
  }
  next();
});
router.use("/api/admin/public-byline", isAuthenticated, requireReviewer);

router.get("/api/public-byline/me", async (req, res) => {
  try {
    res.set("Cache-Control", "private, no-store");
    res.json(await getMyPublicByline(userId(req)));
  } catch (error) {
    sendError(res, error, "get me");
  }
});

const submitSchema = z.object({
  titleAr: z.string().max(200).nullish(),
  bioAr: z.string().max(4000).nullish(),
});

router.put("/api/public-byline/me", async (req, res) => {
  const parsed = submitSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ message: "بيانات غير صالحة" });
  try {
    res.json({ request: await submitPublicByline(userId(req), parsed.data) });
  } catch (error) {
    sendError(res, error, "submit");
  }
});

router.post("/api/public-byline/me/withdraw", async (req, res) => {
  try {
    res.json({ request: await withdrawPublicByline(userId(req)) });
  } catch (error) {
    sendError(res, error, "withdraw");
  }
});

router.get("/api/admin/public-byline/requests", async (req, res) => {
  const raw = String(req.query.status ?? "pending");
  const status = (PUBLIC_BYLINE_STATUSES as readonly string[]).includes(raw)
    ? (raw as (typeof PUBLIC_BYLINE_STATUSES)[number])
    : "pending";
  try {
    res.set("Cache-Control", "private, no-store");
    res.json(await listPublicBylineRequests(status));
  } catch (error) {
    sendError(res, error, "list");
  }
});

router.post("/api/admin/public-byline/requests/:userId/approve", async (req, res) => {
  try {
    res.json(await approvePublicByline(req.params.userId, userId(req)));
  } catch (error) {
    sendError(res, error, "approve");
  }
});

const noteSchema = z.object({ note: z.string().max(2000) });

router.post("/api/admin/public-byline/requests/:userId/request-changes", async (req, res) => {
  const parsed = noteSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ message: "اكتب ما يحتاج تعديلًا" });
  try {
    res.json(await requestPublicBylineChanges(req.params.userId, userId(req), parsed.data.note));
  } catch (error) {
    sendError(res, error, "request changes");
  }
});

export default router;
