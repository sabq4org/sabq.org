import { Router, type Request } from "express";
import { randomUUID } from "crypto";
import { requireAuth, userHasAnyRole } from "../rbac";
import { upload } from "../utils/uploadMiddleware";
import { ObjectStorageService, isPrivateObjectStorageConfigured } from "../objectStorage";
import {
  getMediaLicense,
  mediaLicenseExpiryRejection,
  saveMediaLicense,
} from "../services/mediaLicenseService";

const router = Router();
const requestUserId = (req: Request) => (req.user as { id: string }).id;

router.use("/api/reporter/media-license", requireAuth, async (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: "يجب تسجيل الدخول" });
  if (!(await userHasAnyRole(requestUserId(req), ["reporter"]))) {
    return res.status(403).json({ message: "هذه المساحة خاصة بالمراسلين" });
  }
  next();
});

router.get("/api/reporter/media-license", async (req, res) => {
  try {
    res.json(await getMediaLicense(requestUserId(req)));
  } catch (error) {
    console.error("[Reporter] media license status failed:", error);
    res.status(500).json({ message: "تعذر جلب حالة الترخيص" });
  }
});

router.post(
  "/api/reporter/media-license",
  upload.single("licenseFile"),
  async (req, res) => {
    try {
      const licenseNumber = String(req.body?.licenseNumber || "").trim();
      if (licenseNumber.length < 3) {
        return res.status(400).json({ message: "رقم الترخيص المهني مطلوب" });
      }

      const expiry = mediaLicenseExpiryRejection(String(req.body?.licenseExpiresAt || ""));
      if ("error" in expiry) {
        return res.status(400).json({ message: expiry.error });
      }
      const { expiresAt } = expiry;

      const file = req.file;
      if (!file) {
        return res.status(400).json({ message: "يرجى إرفاق صورة الترخيص أو ملف PDF" });
      }
      if (!file.mimetype.startsWith("image/") && file.mimetype !== "application/pdf") {
        return res.status(400).json({ message: "الترخيص يجب أن يكون صورة أو ملف PDF" });
      }

      if (!isPrivateObjectStorageConfigured()) {
        console.error("[Reporter] Private object storage not configured for media license");
        return res.status(502).json({ message: "خدمة رفع المستندات غير متاحة حالياً. حاول لاحقاً." });
      }

      const ext = file.mimetype === "application/pdf" ? "pdf" : (file.mimetype.split("/")[1] || "jpg");
      const key = `reporter-media-licenses/${requestUserId(req)}/${randomUUID()}.${ext}`;
      const uploaded = await new ObjectStorageService().uploadFile(
        key,
        file.buffer,
        file.mimetype,
        "private",
      );

      const status = await saveMediaLicense(requestUserId(req), {
        licenseNumber,
        licenseFileKey: uploaded.path,
        expiresAt,
      });

      res.json({
        message: "شكراً لك — تم استلام بيانات الترخيص بنجاح.",
        ...status,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "";
      if (msg.includes("ترخيص منتهٍ")) {
        return res.status(400).json({ message: msg });
      }
      console.error("[Reporter] media license upload failed:", error);
      res.status(500).json({ message: "تعذر حفظ الترخيص. حاول مرة أخرى لاحقاً." });
    }
  },
);

export default router;
