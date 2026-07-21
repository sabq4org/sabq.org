// Shared in-memory multer instance — moved out of server/routes.ts during
// the 2026-06-10 Milestone-2 extraction so split route modules can reuse the
// same upload policy without importing from the monolith.
import multer from "multer";

// إعداد multer للتعامل مع رفع الملفات في الذاكرة
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    // GIF removed (security audit M8, 2026-05-11). Animated GIFs let
    // an attacker hold long-lived browser connections and stall page
    // rendering; we don't have an animation-aware probe in this path.
    // If GIF is needed back, add a sharp.metadata().pages <= 1 gate.
    const allowedTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
      // آيفون يرفع HEIC افتراضياً — تُحوَّل إلى JPEG في مسار الترخيص
      'image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence',
      'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/webm',
      'video/mp4', 'video/webm', 'video/quicktime',
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('نوع الملف غير مسموح'));
    }
  },
});

/** رفع مستندات الترخيص فقط — نفس الحدود مع قبول HEIC صراحة. */
export const mediaLicenseUpload = upload;
