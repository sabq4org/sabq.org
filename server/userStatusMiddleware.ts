import { Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { getUserEffectiveStatus, getUserStatusMessage } from "@shared/schema";

/**
 * Middleware to check user status before allowing interactions
 * Blocks banned, deleted, suspended, locked users from creating content
 */
export function checkUserStatus() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Get user from request (should be authenticated at this point)
      const userId = (req as any).user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: "غير مصرح" });
      }

      // Fetch user from storage
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(401).json({ message: "المستخدم غير موجود" });
      }

      // Check user's effective status
      const status = getUserEffectiveStatus(user);
      
      console.log(`🔍 [USER STATUS CHECK] User ${userId} status: ${status}`);

      // Block non-active users from interacting
      if (status !== "active") {
        const message = getUserStatusMessage(user);
        console.log(`❌ [USER STATUS CHECK] User blocked - Status: ${status}`);
        
        return res.status(403).json({ 
          message: message || "لا يمكنك القيام بهذا الإجراء بسبب حالة حسابك",
          status: status
        });
      }

      // User is active, allow request to proceed
      console.log(`✅ [USER STATUS CHECK] User ${userId} is active, proceeding`);
      next();
    } catch (error) {
      console.error("❌ [USER STATUS CHECK] Error checking user status:", error);
      res.status(500).json({ message: "خطأ في التحقق من حالة المستخدم" });
    }
  };
}
