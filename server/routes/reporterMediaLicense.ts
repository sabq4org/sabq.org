import { Router, type Request } from "express";
import { randomUUID } from "crypto";
import { requireAuth, userHasAnyRole } from "../rbac";
import { mediaLicenseUpload } from "../utils/uploadMiddleware";
import {
  getMediaLicense,
  mediaLicenseExpiryRejection,
  saveMediaLicense,
} from "../services/mediaLicenseService";
import { uploadMediaLicenseDocument } from "../services/mediaLicenseUpload";

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
  mediaLicenseUpload.single("licenseFile"),
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

      const uploaded = await uploadMediaLicenseDocument({
        relativeKey: `reporter-media-licenses/${requestUserId(req)}/${randomUUID()}.bin`,
        buffer: file.buffer,
        contentType: file.mimetype,
      });

      const status = await saveMediaLicense(requestUserId(req), {
        licenseNumber,
        licenseFileKey: uploaded.path,
        expiresAt,
      });

      res.json({
        message:
          "وصلنا ملفك وهو تحت مراجعة مسؤول النظام. لن تتمكن من إضافة خبر حتى تتم الموافقة على الترخيص.",
        ...status,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "";
      if (msg.includes("ترخيص منتهٍ") || msg.includes("صورة أو ملف PDF")) {
        return res.status(400).json({ message: msg });
      }
      if (msg.includes("غير متاحة حالياً")) {
        console.error("[Reporter] Private object storage not configured for media license");
        return res.status(502).json({ message: msg });
      }
      console.error("[Reporter] media license upload failed:", error);
      res.status(500).json({ message: "تعذر حفظ الترخيص. حاول مرة أخرى لاحقاً." });
    }
  },
);

export default router;
