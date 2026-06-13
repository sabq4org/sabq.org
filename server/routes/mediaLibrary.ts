import { Router } from "express";
import { requireAuth, requirePermission } from "../rbac";
import { bulkMediaOperation, type BulkMediaAction } from "../services/mediaLibraryService";

const router: Router = Router();

const VALID_ACTIONS: BulkMediaAction[] = ["move", "delete", "favorite", "unfavorite"];

// POST /api/media/bulk - bulk move/delete/(un)favorite over selected media files.
// Gated by media.view (blocks readers); per-item ownership + media.edit/delete
// are enforced inside the service.
router.post("/api/media/bulk", requireAuth, requirePermission("media.view"), async (req: any, res) => {
  try {
    const { action, ids, folderId } = req.body || {};
    if (!VALID_ACTIONS.includes(action)) {
      return res.status(400).json({ message: "عملية غير مدعومة" });
    }
    const result = await bulkMediaOperation(req.user.id, action, ids, folderId);
    res.json(result);
  } catch (error: any) {
    if (error?.statusCode === 400) {
      return res.status(400).json({ message: error.message });
    }
    console.error("Error in bulk media operation:", error);
    res.status(500).json({ message: "فشل في تنفيذ العملية الجماعية" });
  }
});

export default router;
