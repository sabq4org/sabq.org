import type { Express } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { storage } from "../storage";
import { db } from "../db";
import { themes } from "@shared/schema";
import { isAuthenticated } from "../auth";
import { requireRole, logActivity } from "../rbac";
import { cacheControl, CACHE_DURATIONS } from "../cacheMiddleware";
import { withSWR, CACHE_TTL } from "../memoryCache";

export function registerThemeRoutes(app: Express) {
  app.get("/api/themes/active", cacheControl({ maxAge: CACHE_DURATIONS.LONG }), async (req, res) => {
    try {
      const scope = (req.query.scope as string) || 'site_full';
      const cacheKey = `themes:active:${scope}`;
      const theme = await withSWR(cacheKey, CACHE_TTL.LONG, CACHE_TTL.VERY_LONG, async () => {
        return await storage.getActiveTheme(scope);
      });
      res.json(theme || null);
    } catch (error) {
      console.error("Error fetching active theme:", error);
      res.status(500).json({ message: "Failed to fetch active theme" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  app.get("/api/themes", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || (user.role !== 'admin' && user.role !== 'editor')) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { status, createdBy } = req.query;
      const themes = await storage.getAllThemes({
        status: status as string,
        createdBy: createdBy as string,
      });
      res.json(themes);
    } catch (error) {
      console.error("Error fetching themes:", error);
      res.status(500).json({ message: "Failed to fetch themes" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // Export all themes (must be before :id route)
  app.get("/api/themes/export", requireRole("admin"), async (req: any, res) => {
    try {
      const userId = req.user.id;

      // Get all themes from database
      const allThemes = await db
        .select()
        .from(themes)
        .orderBy(themes.createdAt);

      // Log activity
      await logActivity({
        userId,
        action: "export",
        entityType: "themes",
        entityId: "all",
        newValue: { count: allThemes.length },
      });

      // Format response with metadata
      const exportData = {
        version: "1.0",
        exportedAt: new Date().toISOString(),
        themes: allThemes,
      };

      res.json(exportData);
    } catch (error) {
      console.error("Error exporting themes:", error);
      res.status(500).json({ message: "فشل في تصدير السمات" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // Import themes (must be before :id route)
  app.post("/api/themes/import", requireRole("admin"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { version, themes: importThemes, mode = "merge" } = req.body;

      // Validate request body
      if (!version || !importThemes || !Array.isArray(importThemes)) {
        return res.status(400).json({ 
          message: "بيانات الاستيراد غير صحيحة. يجب توفير version و themes" 
        });
      }

      // Validate each theme
      for (const theme of importThemes) {
        if (!theme.name || !theme.tokens) {
          return res.status(400).json({ 
            message: "كل سمة يجب أن تحتوي على name و tokens" 
          });
        }
      }

      let imported = 0;
      let updated = 0;
      let created = 0;

      // Use transaction for safety
      await db.transaction(async (tx) => {
        // If mode is replace, delete all existing themes first
        if (mode === "replace") {
          await tx.delete(themes);
        }

        // Process each theme
        for (const importTheme of importThemes) {
          const themeId = importTheme.id;

          // Check if theme exists
          const [existingTheme] = themeId 
            ? await tx
                .select()
                .from(themes)
                .where(eq(themes.id, themeId))
                .limit(1)
            : [];

          if (existingTheme) {
            // Update existing theme
            await tx
              .update(themes)
              .set({
                name: importTheme.name,
                slug: importTheme.slug || importTheme.name.toLowerCase().replace(/\s+/g, '-'),
                isDefault: importTheme.isDefault || false,
                priority: importTheme.priority || 0,
                status: importTheme.status || "draft",
                startAt: importTheme.startAt ? new Date(importTheme.startAt) : null,
                endAt: importTheme.endAt ? new Date(importTheme.endAt) : null,
                assets: importTheme.assets || null,
                tokens: importTheme.tokens,
                applyTo: importTheme.applyTo || [],
                updatedAt: new Date(),
              })
              .where(eq(themes.id, themeId));
            
            updated++;
          } else {
            // Create new theme with new ID
            await tx
              .insert(themes)
              .values({
                name: importTheme.name,
                slug: importTheme.slug || importTheme.name.toLowerCase().replace(/\s+/g, '-'),
                isDefault: importTheme.isDefault || false,
                priority: importTheme.priority || 0,
                status: importTheme.status || "draft",
                startAt: importTheme.startAt ? new Date(importTheme.startAt) : null,
                endAt: importTheme.endAt ? new Date(importTheme.endAt) : null,
                assets: importTheme.assets || null,
                tokens: importTheme.tokens,
                applyTo: importTheme.applyTo || [],
                createdBy: userId,
              });
            
            created++;
          }
          
          imported++;
        }

        // Ensure only one default theme exists
        const defaultThemes = await tx
          .select()
          .from(themes)
          .where(eq(themes.isDefault, true));

        if (defaultThemes.length > 1) {
          // Keep only the first one as default
          for (let i = 1; i < defaultThemes.length; i++) {
            await tx
              .update(themes)
              .set({ isDefault: false })
              .where(eq(themes.id, defaultThemes[i].id));
          }
        }
      });

      // Log activity
      await logActivity({
        userId,
        action: "import",
        entityType: "themes",
        entityId: "bulk",
        newValue: { mode, imported, updated, created },
      });

      res.json({
        message: "تم استيراد السمات بنجاح",
        imported,
        updated,
        created,
      });
    } catch (error) {
      console.error("Error importing themes:", error);
      res.status(500).json({ message: "فشل في استيراد السمات" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  app.get("/api/themes/:id", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || (user.role !== 'admin' && user.role !== 'editor')) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const theme = await storage.getThemeById(req.params.id);
      if (!theme) {
        return res.status(404).json({ message: "Theme not found" });
      }
      res.json(theme);
    } catch (error) {
      console.error("Error fetching theme:", error);
      res.status(500).json({ message: "Failed to fetch theme" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  app.post("/api/themes", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || (user.role !== 'admin' && user.role !== 'editor')) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const parsed = insertThemeSchema.safeParse({
        ...req.body,
        createdBy: req.user.id,
      });

      if (!parsed.success) {
        return res.status(400).json({ 
          message: "بيانات السمة غير صحيحة",
          errors: parsed.error.errors 
        });
      }

      const theme = await storage.createTheme(parsed.data);
      res.json(theme);
    } catch (error) {
      console.error("Error creating theme:", error);
      res.status(500).json({ message: "Failed to create theme" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  app.patch("/api/themes/:id", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || (user.role !== 'admin' && user.role !== 'editor')) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const parsed = updateThemeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ 
          message: "بيانات السمة غير صحيحة",
          errors: parsed.error.errors 
        });
      }

      const theme = await storage.updateTheme(
        req.params.id, 
        parsed.data, 
        req.user.id
      );
      res.json(theme);
    } catch (error) {
      console.error("Error updating theme:", error);
      res.status(500).json({ message: "Failed to update theme" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  app.delete("/api/themes/:id", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Forbidden - Admin only" });
      }

      await storage.deleteTheme(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting theme:", error);
      res.status(500).json({ message: "Failed to delete theme" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // POST /api/themes/:id/duplicate - Duplicate existing theme
  app.post("/api/themes/:id/duplicate", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || (user.role !== 'admin' && user.role !== 'editor')) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const sourceTheme = await storage.getThemeById(req.params.id);
      if (!sourceTheme) {
        return res.status(404).json({ message: "Theme not found" });
      }

      const { name, slug } = req.body;
      if (!name || !slug) {
        return res.status(400).json({ message: "Name and slug are required" });
      }

      // Create duplicated theme
      const duplicatedTheme = await storage.createTheme({
        name,
        slug,
        isDefault: false,
        priority: 0,
        status: 'draft',
        assets: sourceTheme.assets,
        tokens: sourceTheme.tokens,
        applyTo: sourceTheme.applyTo,
        createdBy: req.user.id,
      });

      // Log duplication
      await storage.createThemeAuditLog({
        themeId: duplicatedTheme.id,
        userId: req.user.id,
        action: 'duplicate',
        metadata: {
          reason: `Duplicated from theme ${sourceTheme.name} (ID: ${sourceTheme.id})`,
        },
      });

      res.json(duplicatedTheme);
    } catch (error: any) {
      console.error("Error duplicating theme:", error);
      res.status(500).json({ message: error.message || "Failed to duplicate theme" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // POST /api/themes/:id/activate - Activate theme and deactivate others (transactional)
  app.post("/api/themes/:id/activate", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Forbidden - Admin only" });
      }

      const themeToActivate = await storage.getThemeById(req.params.id);
      if (!themeToActivate) {
        return res.status(404).json({ message: "Theme not found" });
      }

      // Use transaction to ensure atomic activation
      await db.transaction(async (tx) => {
        // 1. Get all currently active themes
        const activeThemes = await tx
          .select()
          .from(themes)
          .where(eq(themes.status, 'active'));

        // 2. Deactivate all active themes
        for (const activeTheme of activeThemes) {
          await tx
            .update(themes)
            .set({
              status: 'draft',
              updatedAt: new Date(),
            })
            .where(eq(themes.id, activeTheme.id));

          await tx.insert(themeAuditLog).values({
            themeId: activeTheme.id,
            userId: req.user.id,
            action: 'deactivate',
            metadata: {
              reason: `Deactivated to activate theme ${themeToActivate.name}`,
              previousStatus: 'active',
              newStatus: 'draft',
            },
          });
        }

        // 3. Activate the selected theme
        await tx
          .update(themes)
          .set({
            status: 'active',
            updatedAt: new Date(),
          })
          .where(eq(themes.id, req.params.id));

        await tx.insert(themeAuditLog).values({
          themeId: req.params.id,
          userId: req.user.id,
          action: 'activate',
          metadata: {
            previousStatus: themeToActivate.status,
            newStatus: 'active',
          },
        });
      });

      // Fetch and return the activated theme
      const activatedTheme = await storage.getThemeById(req.params.id);

      res.json(activatedTheme);
    } catch (error) {
      console.error("Error activating theme:", error);
      res.status(500).json({ message: "Failed to activate theme" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  app.post("/api/themes/:id/publish", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Forbidden - Admin only" });
      }

      const theme = await storage.publishTheme(req.params.id, req.user.id);
      res.json(theme);
    } catch (error) {
      console.error("Error publishing theme:", error);
      res.status(500).json({ message: "Failed to publish theme" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // POST /api/themes/seed/sabq-red - Create Sabq Red theme (one-time setup)
  app.post("/api/themes/seed/sabq-red", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Forbidden - Admin only" });
      }

      // Check if already exists
      const existing = await db
        .select()
        .from(themes)
        .where(eq(themes.slug, "sabq-red"))
        .limit(1);

      if (existing.length > 0) {
        return res.json({ 
          message: "Theme 'سبق الأحمر' already exists",
          theme: existing[0] 
        });
      }

      // Create the Sabq Red theme
      const sabqRedTheme = await storage.createTheme({
        name: "سبق الأحمر",
        slug: "sabq-red",
        isDefault: false,
        priority: 0,
        status: "draft",
        assets: {
          logoLight: "/assets/sabq_no_bg_high_res_1762663557037.png",
          logoDark: "/assets/sabq_no_bg_high_res_1762663557037.png",
        },
        tokens: {
          colors: {
            "primary-light": "348 100% 45%",
            "primary-dark": "348 95% 60%",
            "primary-foreground-light": "0 0% 100%",
            "primary-foreground-dark": "0 0% 100%",
            "secondary-light": "220 9% 62%",
            "secondary-dark": "220 9% 62%",
            "secondary-foreground-light": "0 0% 0%",
            "secondary-foreground-dark": "0 0% 100%",
            "muted-light": "220 8% 33%",
            "muted-dark": "220 8% 33%",
            "muted-foreground-light": "0 0% 100%",
            "muted-foreground-dark": "0 0% 100%",
            "accent-light": "348 100% 45%",
            "accent-dark": "348 95% 60%",
            "accent-foreground-light": "0 0% 100%",
            "accent-foreground-dark": "0 0% 100%",
            "destructive-light": "0 84% 60%",
            "destructive-dark": "0 62% 30%",
            "destructive-foreground-light": "0 0% 100%",
            "destructive-foreground-dark": "0 0% 100%",
            "border-light": "220 13% 91%",
            "border-dark": "220 13% 18%",
            "input-light": "220 13% 91%",
            "input-dark": "220 13% 18%",
            "ring-light": "348 100% 45%",
            "ring-dark": "348 95% 60%",
            "background-light": "0 0% 100%",
            "background-dark": "220 15% 8%",
            "foreground-light": "220 9% 15%",
            "foreground-dark": "0 0% 95%",
            "card-light": "0 0% 100%",
            "card-dark": "220 15% 12%",
            "card-foreground-light": "220 9% 15%",
            "card-foreground-dark": "0 0% 95%",
            "popover-light": "0 0% 100%",
            "popover-dark": "220 15% 12%",
            "popover-foreground-light": "220 9% 15%",
            "popover-foreground-dark": "0 0% 95%",
          },
        },
        applyTo: ["site_full"],
        createdBy: req.user.id,
      });

      res.json({
        message: "تم إنشاء ثيم 'سبق الأحمر' بنجاح",
        theme: sabqRedTheme,
      });
    } catch (error: any) {
      console.error("Error creating Sabq Red theme:", error);
      res.status(500).json({ message: error.message || "Failed to create theme" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // GET/POST /api/celebration-mode - Get or toggle celebration mode for 19th anniversary
  app.get("/api/celebration-mode", async (req, res) => {
    try {
      const theme = await storage.getActiveTheme('site_full');
      const tokens = theme?.tokens as any || {};
      res.json({ 
        enabled: tokens.celebrationMode === true,
        balloonsEnabled: tokens.balloonsEnabled === true,
        years: tokens.celebrationYears || 19
      });
    } catch (error) {
      console.error("Error fetching celebration mode:", error);
      res.status(500).json({ message: "Failed to fetch celebration mode" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // GET/POST /api/balloon-mode - Toggle balloon effect separately
  app.get("/api/balloon-mode", async (req, res) => {
    try {
      const theme = await storage.getActiveTheme('site_full');
      const tokens = theme?.tokens as any || {};
      res.json({ 
        enabled: tokens.balloonsEnabled === true,
        intervalMinutes: tokens.balloonInterval || 3
      });
    } catch (error) {
      console.error("Error fetching balloon mode:", error);
      res.status(500).json({ message: "Failed to fetch balloon mode" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  app.post("/api/balloon-mode", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || (user.role !== 'admin' && user.role !== 'editor')) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const balloonSchema = z.object({
        enabled: z.boolean(),
        intervalMinutes: z.number().int().min(1).max(30).optional().default(3),
      });
      const parseResult = balloonSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          message: "بيانات غير صالحة",
          errors: parseResult.error.errors,
        });
      }
      const { enabled, intervalMinutes } = parseResult.data;
      const theme = await storage.getActiveTheme('site_full');
      
      if (!theme) {
        return res.status(404).json({ message: "No active theme found" });
      }

      const currentTokens = theme.tokens as any || {};
      const updatedTokens = {
        ...currentTokens,
        balloonsEnabled: enabled === true,
        balloonInterval: intervalMinutes,
      };

      await storage.updateTheme(theme.id, { tokens: updatedTokens }, user.id);
      
      res.json({ 
        enabled: enabled === true,
        intervalMinutes,
        message: enabled ? "تم تفعيل البالونات" : "تم إلغاء البالونات"
      });
    } catch (error) {
      console.error("Error toggling balloon mode:", error);
      res.status(500).json({ message: "Failed to toggle balloon mode" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  app.post("/api/celebration-mode", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || (user.role !== 'admin' && user.role !== 'editor')) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Validate request body
      const celebrationSchema = z.object({
        enabled: z.boolean(),
        years: z.number().int().min(1).max(100).optional().default(19),
      });
      const parseResult = celebrationSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          message: "بيانات غير صالحة",
          errors: parseResult.error.errors,
        });
      }
      const { enabled, years } = parseResult.data;
      const theme = await storage.getActiveTheme('site_full');
      
      if (!theme) {
        return res.status(404).json({ message: "No active theme found" });
      }

      const currentTokens = theme.tokens as any || {};
      const updatedTokens = {
        ...currentTokens,
        celebrationMode: enabled === true,
        celebrationYears: years,
      };

      await storage.updateTheme(theme.id, { tokens: updatedTokens }, user.id);
      
      res.json({ 
        enabled: enabled === true,
        years,
        message: enabled ? "تم تفعيل وضع الاحتفال" : "تم إلغاء وضع الاحتفال"
      });
    } catch (error) {
      console.error("Error toggling celebration mode:", error);
      res.status(500).json({ message: "Failed to toggle celebration mode" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  app.post("/api/themes/:id/expire", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Forbidden - Admin only" });
      }

      const theme = await storage.expireTheme(req.params.id, req.user.id);
      res.json(theme);
    } catch (error) {
      console.error("Error expiring theme:", error);
      res.status(500).json({ message: "Failed to expire theme" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  app.post("/api/themes/:id/rollback", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Forbidden - Admin only" });
      }

      const theme = await storage.rollbackTheme(req.params.id, req.user.id);
      res.json(theme);
    } catch (error: any) {
      console.error("Error rolling back theme:", error);
      res.status(500).json({ message: error.message || "Failed to rollback theme" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  app.get("/api/themes/:id/logs", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || (user.role !== 'admin' && user.role !== 'editor')) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const logs = await storage.getThemeAuditLogs(req.params.id);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching theme logs:", error);
      res.status(500).json({ message: "Failed to fetch theme logs" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  app.post("/api/themes/initialize", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Forbidden - Admin only" });
      }

      const theme = await storage.initializeDefaultTheme(req.user.id);
      res.json(theme);
    } catch (error) {
      console.error("Error initializing default theme:", error);
      res.status(500).json({ message: "Failed to initialize default theme" });
    }
  });


}
