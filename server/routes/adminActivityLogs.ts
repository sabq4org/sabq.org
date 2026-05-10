import { Router } from "express";
import { storage } from "../storage";
import { requireAuth, requirePermission } from "../rbac";

const router: Router = Router();

// Get all activity logs with filtering and pagination (admin/system_admin only)
router.get("/api/admin/activity-logs", requireAuth, requirePermission("system.view_audit"), async (req: any, res) => {
  try {
    const {
      userId,
      action,
      entityType,
      dateFrom,
      dateTo,
      searchQuery,
      page,
      limit,
    } = req.query;

    const filters: any = {};

    if (userId) filters.userId = userId;
    if (action) filters.action = action;
    if (entityType) filters.entityType = entityType;

    if (dateFrom) {
      const parsedDateFrom = new Date(dateFrom);
      if (isNaN(parsedDateFrom.getTime())) {
        return res.status(400).json({ message: "Invalid dateFrom parameter" });
      }
      filters.dateFrom = parsedDateFrom;
    }

    if (dateTo) {
      const parsedDateTo = new Date(dateTo);
      if (isNaN(parsedDateTo.getTime())) {
        return res.status(400).json({ message: "Invalid dateTo parameter" });
      }
      filters.dateTo = parsedDateTo;
    }

    if (searchQuery) filters.searchQuery = searchQuery;
    if (page) filters.page = parseInt(page);
    if (limit) filters.limit = parseInt(limit);

    const result = await storage.getActivityLogs(filters);

    res.json(result);
  } catch (error) {
    console.error("Error fetching activity logs:", error);
    res.status(500).json({ message: "Failed to fetch activity logs" });
  }
});

// Get activity logs analytics (admin/system_admin only)
router.get("/api/admin/activity-logs/analytics", requireAuth, requirePermission("system.view_audit"), async (req: any, res) => {
  try {
    const analytics = await storage.getActivityLogsAnalytics();
    res.json(analytics);
  } catch (error) {
    console.error("Error fetching activity logs analytics:", error);
    res.status(500).json({ message: "Failed to fetch activity logs analytics" });
  }
});

// Get activity log by ID (admin/system_admin only)
router.get("/api/admin/activity-logs/:id", requireAuth, requirePermission("system.view_audit"), async (req: any, res) => {
  try {
    const { id } = req.params;

    const log = await storage.getActivityLogById(id);

    if (!log) {
      return res.status(404).json({ message: "Activity log not found" });
    }

    res.json(log);
  } catch (error) {
    console.error("Error fetching activity log:", error);
    res.status(500).json({ message: "Failed to fetch activity log" });
  }
});

export default router;
