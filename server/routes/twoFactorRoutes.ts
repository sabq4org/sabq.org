import type { Express } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcrypt";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { users } from "@shared/schema";
import { isAuthenticated } from "../auth";
import { logActivity } from "../rbac";
import { sendSMSOTP, verifySMSOTP } from "../twilio";
import { generateSecret, generateQRCode, verifyToken, generateBackupCodes, verifyBackupCode } from "../twoFactor";

function getRealIp(req: any): string {
  return (
    (req.headers['cf-connecting-ip'] as string) ||
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.ip ||
    'unknown'
  );
}

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { message: "تم تجاوز حد الطلبات للعمليات الحساسة. يرجى المحاولة بعد قليل" },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => getRealIp(req),
  validate: { xForwardedForHeader: false, ip: false, keyGeneratorIpFallback: false },
});

export function registerTwoFactorRoutes(app: Express) {
  app.get("/api/2fa/status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      
      res.json({
        enabled: user.twoFactorEnabled || false,
        hasBackupCodes: (user.twoFactorBackupCodes?.length || 0) > 0,
        backupCodesCount: user.twoFactorBackupCodes?.length || 0,
        method: user.twoFactorMethod || 'authenticator'
      });
    } catch (error) {
      console.error("Error checking 2FA status:", error);
      res.status(500).json({ message: "فشل في التحقق من حالة المصادقة الثنائية" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // Setup 2FA - Generate secret and QR code
  app.get("/api/2fa/setup", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      
      if (!user.email) {
        return res.status(400).json({ message: "البريد الإلكتروني مطلوب" });
      }

      // Generate new secret
      const secret = generateSecret();
      const qrCode = await generateQRCode(user.email, secret);
      const backupCodes = generateBackupCodes();

      // Store secret temporarily (not enabled yet until verified)
      await db.update(users)
        .set({ 
          twoFactorSecret: secret,
          twoFactorBackupCodes: backupCodes 
        })
        .where(eq(users.id, userId));

      res.json({
        secret,
        qrCode,
        backupCodes
      });
    } catch (error) {
      console.error("Error setting up 2FA:", error);
      res.status(500).json({ message: "فشل في إعداد المصادقة الثنائية" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // Enable 2FA - Verify token and enable
  app.post("/api/2fa/enable", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({ message: "الرمز مطلوب" });
      }

      const [user] = await db.select().from(users).where(eq(users.id, userId));

      if (!user.twoFactorSecret) {
        return res.status(400).json({ message: "يجب إعداد المصادقة الثنائية أولاً" });
      }

      // Verify the token
      const isValid = verifyToken(user.twoFactorSecret, token);

      if (!isValid) {
        return res.status(400).json({ message: "الرمز غير صحيح" });
      }

      // Enable 2FA
      await db.update(users)
        .set({ twoFactorEnabled: true })
        .where(eq(users.id, userId));

      await logActivity({
        userId,
        action: 'enable_2fa',
        entityType: '2fa',
        entityId: userId,
        newValue: { enabled: true }
      });

      // Return the backup codes that were generated during setup
      res.json({ 
        message: "تم تفعيل المصادقة الثنائية بنجاح",
        backupCodes: user.twoFactorBackupCodes || []
      });
    } catch (error) {
      console.error("Error enabling 2FA:", error);
      res.status(500).json({ message: "فشل في تفعيل المصادقة الثنائية" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // Disable 2FA
  app.post("/api/2fa/disable", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { password, token } = req.body;

      if (!password) {
        return res.status(400).json({ message: "كلمة المرور مطلوبة" });
      }

      const [user] = await db.select().from(users).where(eq(users.id, userId));

      if (!user.twoFactorEnabled) {
        return res.status(400).json({ message: "المصادقة الثنائية غير مفعلة" });
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.passwordHash || '');
      if (!isPasswordValid) {
        return res.status(400).json({ message: "كلمة المرور غير صحيحة" });
      }

      // Verify 2FA token if provided
      if (token) {
        const isTokenValid = verifyToken(user.twoFactorSecret || '', token);
        if (!isTokenValid) {
          return res.status(400).json({ message: "رمز المصادقة غير صحيح" });
        }
      }

      // Disable 2FA
      await db.update(users)
        .set({ 
          twoFactorEnabled: false,
          twoFactorSecret: null,
          twoFactorBackupCodes: null
        })
        .where(eq(users.id, userId));

      await logActivity({
        userId,
        action: 'disable_2fa',
        entityType: '2fa',
        entityId: userId,
        oldValue: { enabled: true },
        newValue: { enabled: false }
      });

      res.json({ message: "تم تعطيل المصادقة الثنائية بنجاح" });
    } catch (error) {
      console.error("Error disabling 2FA:", error);
      res.status(500).json({ message: "فشل في تعطيل المصادقة الثنائية" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // Verify 2FA token during login
  app.post("/api/2fa/verify", async (req: any, res) => {
    try {
      const { token, backupCode } = req.body;

      // Get userId from session
      const userId = (req.session as any).pending2FAUserId;

      if (!userId) {
        return res.status(400).json({ message: "الجلسة منتهية. الرجاء تسجيل الدخول مرة أخرى" });
      }

      if (!token && !backupCode) {
        return res.status(400).json({ message: "الرمز أو الرمز الاحتياطي مطلوب" });
      }

      const [user] = await db.select().from(users).where(eq(users.id, userId));

      if (!user || !user.twoFactorEnabled) {
        return res.status(400).json({ message: "المستخدم غير موجود أو المصادقة الثنائية غير مفعلة" });
      }

      let isValid = false;

      // Try backup code first
      if (backupCode) {
        const result = verifyBackupCode(user.twoFactorBackupCodes || [], backupCode);
        if (result.valid) {
          isValid = true;
          // Update backup codes (remove used code)
          await db.update(users)
            .set({ twoFactorBackupCodes: result.remainingCodes || [] })
            .where(eq(users.id, userId));
        }
      } 
      // Try regular token
      else if (token) {
        isValid = verifyToken(user.twoFactorSecret || '', token);
      }

      if (!isValid) {
        return res.status(400).json({ message: "الرمز غير صحيح" });
      }

      // Log the user in
      req.login(user, (err: any) => {
        if (err) {
          console.error("Error logging in user after 2FA:", err);
          return res.status(500).json({ message: "فشل في تسجيل الدخول" });
        }

        // Clear the pending 2FA userId from session
        delete (req.session as any).pending2FAUserId;

      res.json({ 
          message: "تم التحقق بنجاح",
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role
          }
        });
      });
    } catch (error) {
      console.error("Error verifying 2FA:", error);
      res.status(500).json({ message: "فشل في التحقق من الرمز" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // Send SMS OTP for 2FA setup or verification
  app.post("/api/2fa/send-sms", strictLimiter, async (req: any, res) => {
    try {
      const userId = (req.session as any).pending2FAUserId || req.user?.id;

      if (!userId) {
        return res.status(401).json({ message: "غير مصرح" });
      }

      const [user] = await db.select().from(users).where(eq(users.id, userId));

      if (!user) {
        return res.status(404).json({ message: "المستخدم غير موجود" });
      }

      if (!user.phoneNumber) {
        return res.status(400).json({ message: "يرجى إضافة رقم الجوال أولاً في الملف الشخصي" });
      }

      // Send SMS OTP
      const result = await sendSMSOTP(user.phoneNumber);

      if (!result.success) {
        return res.status(500).json({ message: result.message });
      }

      res.json({ 
        success: true,
        message: result.message,
        phoneNumber: user.phoneNumber.replace(/(\d{3})\d{4}(\d{3})/, '$1****$2') // Mask phone number
      });
    } catch (error) {
      console.error("Error sending SMS OTP:", error);
      res.status(500).json({ message: "فشل في إرسال رمز التحقق" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // Get pending 2FA method
  app.get("/api/2fa/pending-method", async (req: any, res) => {
    try {
      const userId = (req.session as any).pending2FAUserId;

      if (!userId) {
        return res.status(401).json({ message: "غير مصرح" });
      }

      const [user] = await db.select().from(users).where(eq(users.id, userId));

      if (!user) {
        return res.status(404).json({ message: "المستخدم غير موجود" });
      }

      res.json({
        method: user.twoFactorMethod || 'authenticator',
        hasPhoneNumber: !!user.phoneNumber
      });
    } catch (error) {
      console.error("Error getting pending 2FA method:", error);
      res.status(500).json({ message: "فشل في الحصول على طريقة التحقق" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // Verify SMS OTP during login
  app.post("/api/2fa/verify-sms", strictLimiter, async (req: any, res) => {
    try {
      const { code } = req.body;

      // Get userId from session
      const userId = (req.session as any).pending2FAUserId;

      if (!userId) {
        return res.status(400).json({ message: "الجلسة منتهية. الرجاء تسجيل الدخول مرة أخرى" });
      }

      const [user] = await db.select().from(users).where(eq(users.id, userId));

      if (!user) {
        return res.status(404).json({ message: "المستخدم غير موجود" });
      }

      if (!user.phoneNumber) {
        return res.status(400).json({ message: "رقم الجوال غير موجود" });
      }

      // Verify SMS OTP
      const verification = await verifySMSOTP(user.phoneNumber, code);

      if (!verification.valid) {
        return res.status(400).json({ message: verification.message });
      }

      // Log the user in
      req.login(user, (err: any) => {
        if (err) {
          console.error("Error logging in user after SMS 2FA:", err);
          return res.status(500).json({ message: "فشل في تسجيل الدخول" });
        }

        // Clear the pending 2FA userId from session
        delete (req.session as any).pending2FAUserId;

      res.json({ 
          message: "تم التحقق بنجاح",
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role
          }
        });
      });
    } catch (error) {
      console.error("Error verifying SMS OTP:", error);
      res.status(500).json({ message: "فشل في التحقق من الرمز" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // Update 2FA method preference
  app.post("/api/2fa/update-method", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { method, password } = req.body;

      if (!method || !['authenticator', 'sms', 'both'].includes(method)) {
        return res.status(400).json({ message: "طريقة غير صالحة" });
      }

      if (!password) {
        return res.status(400).json({ message: "كلمة المرور مطلوبة" });
      }

      const [user] = await db.select().from(users).where(eq(users.id, userId));

      if (!user.twoFactorEnabled) {
        return res.status(400).json({ message: "المصادقة الثنائية غير مفعلة" });
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.passwordHash || '');
      if (!isPasswordValid) {
        return res.status(400).json({ message: "كلمة المرور غير صحيحة" });
      }

      // Check if phone number is required for SMS methods
      if ((method === 'sms' || method === 'both') && !user.phoneNumber) {
        return res.status(400).json({ message: "يرجى إضافة رقم الجوال أولاً في الملف الشخصي" });
      }

      // Update method
      await db.update(users)
        .set({ twoFactorMethod: method })
        .where(eq(users.id, userId));

      await logActivity({
        userId,
        action: 'update_2fa_method',
        entityType: '2fa',
        entityId: userId,
        newValue: { method }
      });

      res.json({ 
        success: true,
        message: "تم تحديث طريقة المصادقة الثنائية بنجاح",
        method
      });
    } catch (error) {
      console.error("Error updating 2FA method:", error);
      res.status(500).json({ message: "فشل في تحديث طريقة المصادقة الثنائية" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // Generate new backup codes
  app.post("/api/2fa/backup-codes", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { password } = req.body;

      if (!password) {
        return res.status(400).json({ message: "كلمة المرور مطلوبة" });
      }

      const [user] = await db.select().from(users).where(eq(users.id, userId));

      if (!user.twoFactorEnabled) {
        return res.status(400).json({ message: "المصادقة الثنائية غير مفعلة" });
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.passwordHash || '');
      if (!isPasswordValid) {
        return res.status(400).json({ message: "كلمة المرور غير صحيحة" });
      }

      // Generate new backup codes
      const backupCodes = generateBackupCodes();

      await db.update(users)
        .set({ twoFactorBackupCodes: backupCodes })
        .where(eq(users.id, userId));

      await logActivity({
        userId,
        action: 'regenerate_backup_codes',
        entityType: '2fa',
        entityId: userId,
        newValue: { count: backupCodes.length }
      });

      res.json({ backupCodes });
    } catch (error) {
      console.error("Error generating backup codes:", error);
      res.status(500).json({ message: "فشل في إنشاء الرموز الاحتياطية" });
    }
  });

}
