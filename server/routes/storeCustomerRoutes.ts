import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { db } from "../db";
import { storeCustomers, storeCartItems, storeCustomerSessions, advertiserProfiles } from "@shared/schema";
import { eq, and, gt } from "drizzle-orm";

const router = Router();

declare global {
  namespace Express {
    interface Request {
      storeCustomer?: {
        id: string;
        email: string;
        name: string;
        phone: string | null;
        companyName: string | null;
        status: string;
        emailVerified: boolean;
        totalOrders: number;
        totalSpent: number;
        lastLoginAt: Date | null;
        createdAt: Date;
      };
    }
  }
}

function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function getSessionExpiry(): Date {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 30);
  return expiry;
}

export async function storeAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.headers["x-store-token"] as string;

    if (!token) {
      return res.status(401).json({ success: false, error: "يرجى تسجيل الدخول" });
    }

    const [session] = await db
      .select()
      .from(storeCustomerSessions)
      .where(
        and(
          eq(storeCustomerSessions.token, token),
          gt(storeCustomerSessions.expiresAt, new Date())
        )
      )
      .limit(1);

    if (!session) {
      return res.status(401).json({ success: false, error: "جلسة منتهية الصلاحية" });
    }

    const [customer] = await db
      .select({
        id: storeCustomers.id,
        email: storeCustomers.email,
        name: storeCustomers.name,
        phone: storeCustomers.phone,
        companyName: storeCustomers.companyName,
        status: storeCustomers.status,
        emailVerified: storeCustomers.emailVerified,
        totalOrders: storeCustomers.totalOrders,
        totalSpent: storeCustomers.totalSpent,
        lastLoginAt: storeCustomers.lastLoginAt,
        createdAt: storeCustomers.createdAt,
      })
      .from(storeCustomers)
      .where(eq(storeCustomers.id, session.customerId))
      .limit(1);

    if (!customer || customer.status !== "active") {
      return res.status(401).json({ success: false, error: "الحساب غير نشط" });
    }

    req.storeCustomer = customer;
    next();
  } catch (error: any) {
    console.error("[Store Auth] Error:", error);
    res.status(500).json({ success: false, error: "خطأ في التحقق من الجلسة" });
  }
}

const registerSchema = z.object({
  email: z.string().email("البريد الإلكتروني غير صالح"),
  password: z.string().min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل"),
  name: z.string().min(2, "الاسم مطلوب"),
  phone: z.string().optional(),
  companyName: z.string().optional(),
});

router.post("/auth/register", async (req: Request, res: Response) => {
  try {
    const body = registerSchema.parse(req.body);

    const [existingCustomer] = await db
      .select({ id: storeCustomers.id })
      .from(storeCustomers)
      .where(eq(storeCustomers.email, body.email.toLowerCase()))
      .limit(1);

    if (existingCustomer) {
      return res.status(400).json({ success: false, error: "البريد الإلكتروني مسجل مسبقاً" });
    }

    const passwordHash = await bcrypt.hash(body.password, 12);

    const [customer] = await db
      .insert(storeCustomers)
      .values({
        email: body.email.toLowerCase(),
        passwordHash,
        name: body.name,
        phone: body.phone || null,
        companyName: body.companyName || null,
        status: "active",
        emailVerified: false,
      })
      .returning({
        id: storeCustomers.id,
        email: storeCustomers.email,
        name: storeCustomers.name,
        phone: storeCustomers.phone,
        companyName: storeCustomers.companyName,
      });

    const token = generateSessionToken();
    const expiresAt = getSessionExpiry();

    await db.insert(storeCustomerSessions).values({
      customerId: customer.id,
      token,
      expiresAt,
      ipAddress: req.ip || null,
      userAgent: req.headers["user-agent"] || null,
    });

    console.log(`[Store Auth] New customer registered: ${customer.email}`);

    res.status(201).json({
      success: true,
      data: {
        customer: {
          id: customer.id,
          email: customer.email,
          name: customer.name,
          phone: customer.phone,
          companyName: customer.companyName,
        },
        token,
        expiresAt: expiresAt.toISOString(),
      },
    });
  } catch (error: any) {
    console.error("[Store Auth] Registration error:", error);
    if (error.name === "ZodError") {
      return res.status(400).json({
        success: false,
        error: "بيانات غير صالحة",
        details: error.errors,
      });
    }
    res.status(500).json({ success: false, error: "فشل في إنشاء الحساب" });
  }
});

const loginSchema = z.object({
  email: z.string().email("البريد الإلكتروني غير صالح"),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});

router.post("/auth/login", async (req: Request, res: Response) => {
  try {
    const body = loginSchema.parse(req.body);
    const emailLower = body.email.toLowerCase();

    let customer = await db
      .select()
      .from(storeCustomers)
      .where(eq(storeCustomers.email, emailLower))
      .limit(1)
      .then(rows => rows[0]);

    if (!customer) {
      const [advertiser] = await db
        .select()
        .from(advertiserProfiles)
        .where(eq(advertiserProfiles.email, emailLower))
        .limit(1);

      if (advertiser) {
        if (!advertiser.isActive) {
          return res.status(403).json({ success: false, error: "حساب المعلن موقوف" });
        }

        const isValidPassword = await bcrypt.compare(body.password, advertiser.password);
        if (!isValidPassword) {
          return res.status(401).json({ success: false, error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
        }

        const [newCustomer] = await db
          .insert(storeCustomers)
          .values({
            email: emailLower,
            passwordHash: advertiser.password,
            name: advertiser.name,
            phone: advertiser.phone || null,
            companyName: advertiser.company || null,
            emailVerified: advertiser.isVerified || false,
          })
          .returning();

        customer = newCustomer;
        console.log(`[Store Auth] Created store account for advertiser: ${emailLower}`);
      }
    }

    if (!customer) {
      return res.status(401).json({ success: false, error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
    }

    if (!customer.passwordHash) {
      return res.status(401).json({ success: false, error: "يرجى استخدام طريقة تسجيل الدخول الأصلية" });
    }

    if (customer.status !== "active") {
      return res.status(403).json({ success: false, error: "الحساب موقوف" });
    }

    const isValidPassword = await bcrypt.compare(body.password, customer.passwordHash);
    if (!isValidPassword) {
      const [advertiser] = await db
        .select()
        .from(advertiserProfiles)
        .where(eq(advertiserProfiles.email, emailLower))
        .limit(1);

      if (advertiser) {
        const isAdvertiserPasswordValid = await bcrypt.compare(body.password, advertiser.password);
        if (isAdvertiserPasswordValid) {
          await db
            .update(storeCustomers)
            .set({ passwordHash: advertiser.password, updatedAt: new Date() })
            .where(eq(storeCustomers.id, customer.id));
          console.log(`[Store Auth] Synced password from advertiser profile for: ${emailLower}`);
        } else {
          return res.status(401).json({ success: false, error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
        }
      } else {
        return res.status(401).json({ success: false, error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
      }
    }

    const token = generateSessionToken();
    const expiresAt = getSessionExpiry();

    await db.insert(storeCustomerSessions).values({
      customerId: customer.id,
      token,
      expiresAt,
      ipAddress: req.ip || null,
      userAgent: req.headers["user-agent"] || null,
    });

    await db
      .update(storeCustomers)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(storeCustomers.id, customer.id));

    console.log(`[Store Auth] Customer logged in: ${customer.email}`);

    res.json({
      success: true,
      data: {
        customer: {
          id: customer.id,
          email: customer.email,
          name: customer.name,
          phone: customer.phone,
          companyName: customer.companyName,
          status: customer.status,
          emailVerified: customer.emailVerified,
          totalOrders: customer.totalOrders,
          totalSpent: customer.totalSpent,
        },
        token,
        expiresAt: expiresAt.toISOString(),
      },
    });
  } catch (error: any) {
    console.error("[Store Auth] Login error:", error);
    if (error.name === "ZodError") {
      return res.status(400).json({
        success: false,
        error: "بيانات غير صالحة",
        details: error.errors,
      });
    }
    res.status(500).json({ success: false, error: "فشل في تسجيل الدخول" });
  }
});

router.get("/auth/me", storeAuthMiddleware, async (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      data: {
        customer: req.storeCustomer,
      },
    });
  } catch (error: any) {
    console.error("[Store Auth] Get profile error:", error);
    res.status(500).json({ success: false, error: "فشل في جلب بيانات الحساب" });
  }
});

router.post("/auth/logout", storeAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const token = req.headers["x-store-token"] as string;

    await db
      .delete(storeCustomerSessions)
      .where(eq(storeCustomerSessions.token, token));

    console.log(`[Store Auth] Customer logged out: ${req.storeCustomer?.email}`);

    res.json({ success: true, message: "تم تسجيل الخروج بنجاح" });
  } catch (error: any) {
    console.error("[Store Auth] Logout error:", error);
    res.status(500).json({ success: false, error: "فشل في تسجيل الخروج" });
  }
});

router.get("/cart", storeAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const items = await db
      .select()
      .from(storeCartItems)
      .where(eq(storeCartItems.customerId, req.storeCustomer!.id));

    const totalHalalas = items.reduce((sum, item) => sum + item.priceHalalas * item.quantity, 0);

    res.json({
      success: true,
      data: {
        items,
        itemCount: items.length,
        totalHalalas,
        totalSAR: (totalHalalas / 100).toFixed(2),
      },
    });
  } catch (error: any) {
    console.error("[Store Cart] Get cart error:", error);
    res.status(500).json({ success: false, error: "فشل في جلب السلة" });
  }
});

const addCartItemSchema = z.object({
  itemType: z.string().min(1, "نوع العنصر مطلوب"),
  itemId: z.string().min(1, "معرف العنصر مطلوب"),
  itemName: z.string().min(1, "اسم العنصر مطلوب"),
  quantity: z.number().int().min(1, "الكمية يجب أن تكون 1 على الأقل").default(1),
  priceHalalas: z.number().int().min(0, "السعر غير صالح"),
  metadata: z.record(z.any()).optional(),
});

router.post("/cart/items", storeAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const body = addCartItemSchema.parse(req.body);

    const [existingItem] = await db
      .select()
      .from(storeCartItems)
      .where(
        and(
          eq(storeCartItems.customerId, req.storeCustomer!.id),
          eq(storeCartItems.itemType, body.itemType),
          eq(storeCartItems.itemId, body.itemId)
        )
      )
      .limit(1);

    if (existingItem) {
      const [updated] = await db
        .update(storeCartItems)
        .set({
          quantity: existingItem.quantity + body.quantity,
          updatedAt: new Date(),
        })
        .where(eq(storeCartItems.id, existingItem.id))
        .returning();

      return res.json({
        success: true,
        data: updated,
        message: "تم تحديث الكمية",
      });
    }

    const [item] = await db
      .insert(storeCartItems)
      .values({
        customerId: req.storeCustomer!.id,
        itemType: body.itemType,
        itemId: body.itemId,
        itemName: body.itemName,
        quantity: body.quantity,
        priceHalalas: body.priceHalalas,
        metadata: body.metadata || null,
      })
      .returning();

    res.status(201).json({
      success: true,
      data: item,
      message: "تمت الإضافة إلى السلة",
    });
  } catch (error: any) {
    console.error("[Store Cart] Add item error:", error);
    if (error.name === "ZodError") {
      return res.status(400).json({
        success: false,
        error: "بيانات غير صالحة",
        details: error.errors,
      });
    }
    res.status(500).json({ success: false, error: "فشل في إضافة العنصر" });
  }
});

const updateCartItemSchema = z.object({
  quantity: z.number().int().min(1, "الكمية يجب أن تكون 1 على الأقل"),
});

router.patch("/cart/items/:id", storeAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const body = updateCartItemSchema.parse(req.body);

    const [existingItem] = await db
      .select()
      .from(storeCartItems)
      .where(
        and(
          eq(storeCartItems.id, id),
          eq(storeCartItems.customerId, req.storeCustomer!.id)
        )
      )
      .limit(1);

    if (!existingItem) {
      return res.status(404).json({ success: false, error: "العنصر غير موجود" });
    }

    const [updated] = await db
      .update(storeCartItems)
      .set({
        quantity: body.quantity,
        updatedAt: new Date(),
      })
      .where(eq(storeCartItems.id, id))
      .returning();

    res.json({
      success: true,
      data: updated,
      message: "تم تحديث الكمية",
    });
  } catch (error: any) {
    console.error("[Store Cart] Update item error:", error);
    if (error.name === "ZodError") {
      return res.status(400).json({
        success: false,
        error: "بيانات غير صالحة",
        details: error.errors,
      });
    }
    res.status(500).json({ success: false, error: "فشل في تحديث العنصر" });
  }
});

router.delete("/cart/items/:id", storeAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [existingItem] = await db
      .select({ id: storeCartItems.id })
      .from(storeCartItems)
      .where(
        and(
          eq(storeCartItems.id, id),
          eq(storeCartItems.customerId, req.storeCustomer!.id)
        )
      )
      .limit(1);

    if (!existingItem) {
      return res.status(404).json({ success: false, error: "العنصر غير موجود" });
    }

    await db.delete(storeCartItems).where(eq(storeCartItems.id, id));

    res.json({ success: true, message: "تم حذف العنصر من السلة" });
  } catch (error: any) {
    console.error("[Store Cart] Delete item error:", error);
    res.status(500).json({ success: false, error: "فشل في حذف العنصر" });
  }
});

router.delete("/cart", storeAuthMiddleware, async (req: Request, res: Response) => {
  try {
    await db
      .delete(storeCartItems)
      .where(eq(storeCartItems.customerId, req.storeCustomer!.id));

    res.json({ success: true, message: "تم تفريغ السلة" });
  } catch (error: any) {
    console.error("[Store Cart] Clear cart error:", error);
    res.status(500).json({ success: false, error: "فشل في تفريغ السلة" });
  }
});

export default router;
