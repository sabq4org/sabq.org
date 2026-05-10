import { Router } from "express";
import { db, pool } from "../db";
import { bootstrapAdmin } from "../utils/bootstrapAdmin";
import { setupProductionDatabase } from "../utils/setupProduction";
import { seedProductionData } from "../utils/seedProductionData";

const router: Router = Router();

// Seed production data only (no schema changes)
router.post("/api/setup/seed", async (req, res) => {
  try {
    const isEnabled = process.env.ENABLE_PRODUCTION_SETUP === "true";
    if (!isEnabled) {
      return res.status(404).json({ message: "Not found" });
    }

    const setupSecret = req.headers["x-setup-secret"];
    const expectedSecret = process.env.SETUP_SECRET;

    if (!expectedSecret || setupSecret !== expectedSecret) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const result = await seedProductionData(db);

    console.log("✅ Production data seeding completed successfully");
    res.json(result);
  } catch (error) {
    console.error("❌ Production seeding error:", error);
    res.status(500).json({
      success: false,
      message: "Seeding failed",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Complete production database setup (schema + seed + admin)
router.post("/api/setup/production", async (req, res) => {
  try {
    const isEnabled = process.env.ENABLE_PRODUCTION_SETUP === "true";
    if (!isEnabled) {
      return res.status(404).json({ message: "Not found" });
    }

    const setupSecret = req.headers["x-setup-secret"];
    const expectedSecret = process.env.SETUP_SECRET;

    if (!expectedSecret || setupSecret !== expectedSecret) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const result = await setupProductionDatabase(pool, db);

    console.log("✅ Production setup completed successfully");
    res.json(result);
  } catch (error) {
    console.error("❌ Production setup error:", error);
    res.status(500).json({
      success: false,
      message: "Setup failed",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Bootstrap admin user endpoint (for production deployment) - Legacy
router.post("/api/setup/admin", async (req, res) => {
  try {
    const isEnabled = process.env.ENABLE_ADMIN_BOOTSTRAP === "true";
    if (!isEnabled) {
      return res.status(404).json({ message: "Not found" });
    }

    const setupSecret = req.headers["x-setup-secret"];
    const expectedSecret = process.env.SETUP_ADMIN_SECRET;

    if (!expectedSecret || setupSecret !== expectedSecret) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const result = await bootstrapAdmin(db);

    console.log("✅ Admin bootstrap completed successfully");
    res.json({
      success: true,
      message: "Admin user created successfully",
      credentials: {
        email: result.email,
        password: result.password,
      },
    });
  } catch (error) {
    console.error("❌ Admin bootstrap error:", error);
    res.status(500).json({ message: "Bootstrap failed" });
  }
});

export default router;
