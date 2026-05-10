import { Router, Request, Response, raw } from "express";
import { z } from "zod";
import crypto from "crypto";
import { db } from "../db";
import { 
  mediaServices, 
  mediaServiceOrders, 
  mediaOrderEvents,
  paymentAlerts,
  users 
} from "@shared/schema";
import { eq, and, desc, asc, like, or, sql, gte, lte, count, sum } from "drizzle-orm";
import * as tapService from "../services/tapPaymentService";

const VAT_RATE = 0.15;

function calculateVAT(baseAmountHalalas: number): {
  baseAmount: number;
  vatAmount: number;
  totalAmount: number;
} {
  const vatAmount = Math.round(baseAmountHalalas * VAT_RATE);
  return {
    baseAmount: baseAmountHalalas,
    vatAmount,
    totalAmount: baseAmountHalalas + vatAmount,
  };
}

function generateOrderNumber(): string {
  return `MS-${Date.now()}`;
}

function generateTrackingToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

async function createPaymentAlert(
  alertType: string,
  title: string,
  message: string,
  referenceId?: string,
  metadata?: Record<string, any>,
  severity: "low" | "medium" | "high" | "critical" = "medium"
) {
  try {
    await db.insert(paymentAlerts).values({
      type: alertType,
      severity,
      paymentType: "article",
      referenceId,
      title,
      message,
      metadata,
    });
    console.log(`[Media Store] Created alert: ${alertType} for ${referenceId}`);
  } catch (error) {
    console.error("[Media Store] Failed to create alert:", error);
  }
}

async function addOrderEvent(
  orderId: string,
  eventType: string,
  description: string,
  metadata?: Record<string, any>,
  createdBy?: string
) {
  try {
    await db.insert(mediaOrderEvents).values({
      orderId,
      eventType,
      description,
      metadata,
      createdBy,
    });
  } catch (error) {
    console.error("[Media Store] Failed to add order event:", error);
  }
}

const initialServices = [
  {
    type: "press_release" as const,
    nameAr: "خبر صحفي",
    nameEn: "News Article",
    descriptionAr: "نشر خبرك على منصة سبق الإخبارية مع وصول لملايين القراء",
    descriptionEn: "Publish your news on Sabq news platform reaching millions of readers",
    priceHalalas: 500000, // 5000 ريال
    currency: "SAR",
    features: ["وصول لملايين القراء", "تغطية إعلامية واسعة", "أرشفة دائمة"],
    duration: "24 ساعة",
    platform: "press",
    icon: "Newspaper",
    color: "blue",
    sortOrder: 1,
    isActive: true,
    isFeatured: true,
  },
  {
    type: "x_post" as const,
    nameAr: "منشور على منصة إكس",
    nameEn: "X Post",
    descriptionAr: "نشر منشور على حساب سبق في منصة إكس (تويتر سابقاً)",
    descriptionEn: "Publish a post on Sabq's X (formerly Twitter) account",
    priceHalalas: 350000, // 3500 ريال
    currency: "SAR",
    features: ["ملايين المتابعين", "تفاعل عالي", "وصول سريع"],
    duration: "12 ساعة",
    platform: "x",
    icon: "Twitter",
    color: "sky",
    sortOrder: 2,
    isActive: true,
    isFeatured: false,
  },
  {
    type: "x_pinned_post" as const,
    nameAr: "منشور مثبت على إكس",
    nameEn: "X Pinned Post",
    descriptionAr: "تثبيت منشورك على حساب سبق في منصة إكس لمدة 24 ساعة",
    descriptionEn: "Pin your post on Sabq's X account for 24 hours",
    priceHalalas: 650000, // 6500 ريال
    currency: "SAR",
    features: ["تثبيت 24 ساعة", "ظهور أعلى", "تفاعل مضاعف"],
    duration: "24 ساعة",
    platform: "x",
    icon: "Pin",
    color: "indigo",
    sortOrder: 3,
    isActive: true,
    isFeatured: true,
  },
  {
    type: "x_repost" as const,
    nameAr: "إعادة منشور على إكس",
    nameEn: "X Repost",
    descriptionAr: "إعادة نشر منشورك من حساب سبق على منصة إكس",
    descriptionEn: "Repost your content from Sabq's X account",
    priceHalalas: 300000, // 3000 ريال
    currency: "SAR",
    features: ["وصول سريع", "تفاعل فوري"],
    duration: "6 ساعات",
    platform: "x",
    icon: "Repeat",
    color: "green",
    sortOrder: 4,
    isActive: true,
    isFeatured: false,
  },
  {
    type: "instagram_post" as const,
    nameAr: "منشور على إنستقرام",
    nameEn: "Instagram Post",
    descriptionAr: "نشر محتواك على حساب سبق في إنستقرام",
    descriptionEn: "Publish your content on Sabq's Instagram account",
    priceHalalas: 350000, // 3500 ريال
    currency: "SAR",
    features: ["جمهور واسع", "محتوى مرئي", "تفاعل عالي"],
    duration: "24 ساعة",
    platform: "instagram",
    icon: "Instagram",
    color: "pink",
    sortOrder: 5,
    isActive: true,
    isFeatured: false,
  },
];

export async function seedMediaServices() {
  try {
    const existingServices = await db
      .select({ id: mediaServices.id })
      .from(mediaServices)
      .limit(1);

    if (existingServices.length === 0) {
      console.log("[Media Store] Seeding initial media services...");
      for (const service of initialServices) {
        await db.insert(mediaServices).values(service);
      }
      console.log("[Media Store] Seeded", initialServices.length, "media services");
    } else {
      // Update existing services with new prices
      for (const service of initialServices) {
        await db.update(mediaServices)
          .set({ 
            priceHalalas: service.priceHalalas,
            nameAr: service.nameAr,
            nameEn: service.nameEn,
            descriptionAr: service.descriptionAr,
          })
          .where(eq(mediaServices.type, service.type));
      }
      console.log("[Media Store] Updated prices for existing services");
    }
  } catch (error) {
    console.error("[Media Store] Error seeding services:", error);
  }
}

const router = Router();

router.get("/services", async (_req: Request, res: Response) => {
  try {
    await seedMediaServices();

    const services = await db
      .select()
      .from(mediaServices)
      .where(eq(mediaServices.isActive, true))
      .orderBy(asc(mediaServices.sortOrder));

    res.json({
      success: true,
      data: services.map(service => ({
        ...service,
        priceSAR: (service.priceHalalas / 100).toFixed(2),
      })),
    });
  } catch (error: any) {
    console.error("[Media Store] Error fetching services:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/services/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [service] = await db
      .select()
      .from(mediaServices)
      .where(and(eq(mediaServices.id, id), eq(mediaServices.isActive, true)))
      .limit(1);

    if (!service) {
      return res.status(404).json({ success: false, error: "الخدمة غير موجودة" });
    }

    const vatDetails = calculateVAT(service.priceHalalas);

    res.json({
      success: true,
      data: {
        ...service,
        priceSAR: (service.priceHalalas / 100).toFixed(2),
        vatSAR: (vatDetails.vatAmount / 100).toFixed(2),
        totalSAR: (vatDetails.totalAmount / 100).toFixed(2),
        vatRate: "15%",
      },
    });
  } catch (error: any) {
    console.error("[Media Store] Error fetching service:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const createOrderSchema = z.object({
  serviceId: z.string(),
  customerName: z.string().min(2, "الاسم مطلوب"),
  customerEmail: z.string().email("البريد الإلكتروني غير صالح"),
  customerPhone: z.string().optional(),
  customerCompany: z.string().optional(),
  contentTitle: z.string().optional(),
  contentBody: z.string().optional(),
  contentUrl: z.string().url().optional().or(z.literal("")),
  socialHandle: z.string().optional(),
  additionalNotes: z.string().optional(),
});

router.post("/orders", async (req: Request, res: Response) => {
  try {
    const body = createOrderSchema.parse(req.body);

    const [service] = await db
      .select()
      .from(mediaServices)
      .where(and(eq(mediaServices.id, body.serviceId), eq(mediaServices.isActive, true)))
      .limit(1);

    if (!service) {
      return res.status(404).json({ success: false, error: "الخدمة غير موجودة" });
    }

    const vatDetails = calculateVAT(service.priceHalalas);
    const orderNumber = generateOrderNumber();
    const trackingToken = generateTrackingToken();

    const [order] = await db
      .insert(mediaServiceOrders)
      .values({
        orderNumber,
        trackingToken,
        serviceId: body.serviceId,
        serviceType: service.type,
        serviceName: service.nameAr,
        customerName: body.customerName,
        customerEmail: body.customerEmail,
        customerPhone: body.customerPhone || null,
        customerCompany: body.customerCompany || null,
        contentTitle: body.contentTitle || null,
        contentBody: body.contentBody || null,
        contentUrl: body.contentUrl || null,
        socialHandle: body.socialHandle || null,
        additionalNotes: body.additionalNotes || null,
        priceHalalas: vatDetails.baseAmount,
        vatHalalas: vatDetails.vatAmount,
        totalHalalas: vatDetails.totalAmount,
        currency: "SAR",
        status: "pending",
        ipAddress: req.ip || null,
        userAgent: req.headers["user-agent"] || null,
      })
      .returning();

    await addOrderEvent(order.id, "created", `تم إنشاء الطلب ${orderNumber}`);

    const baseUrl = process.env.FRONTEND_URL 
      || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null) 
      || "https://sabq.org";

    const redirectUrl = `${baseUrl}/media-store/payment/callback?order_id=${order.id}`;
    const webhookUrl = `${baseUrl}/api/media-store/webhook`;

    const charge = await tapService.createCharge({
      amountHalalas: vatDetails.totalAmount,
      currency: "SAR",
      customer: {
        firstName: body.customerName,
        email: body.customerEmail,
        phone: body.customerPhone ? { countryCode: "966", number: body.customerPhone.replace(/^\+966/, "") } : undefined,
      },
      redirectUrl,
      postUrl: webhookUrl,
      description: `طلب خدمة إعلامية: ${service.nameAr} (شامل ضريبة القيمة المضافة 15%)`,
      metadata: {
        orderId: order.id,
        orderNumber,
        serviceId: body.serviceId,
        serviceName: service.nameAr,
        baseAmount: vatDetails.baseAmount,
        vatAmount: vatDetails.vatAmount,
        vatRate: "15%",
      },
    });

    await db.update(mediaServiceOrders)
      .set({ 
        paymentChargeId: charge.id,
        status: "payment_pending",
        updatedAt: new Date(),
      })
      .where(eq(mediaServiceOrders.id, order.id));

    await addOrderEvent(order.id, "payment_initiated", `تم بدء عملية الدفع - Charge: ${charge.id}`);

    console.log(`[Media Store] Order created: ${orderNumber}, charge: ${charge.id}`);

    res.json({
      success: true,
      data: {
        orderId: order.id,
        orderNumber,
        trackingToken,
        chargeId: charge.id,
        paymentUrl: charge.transaction?.url,
        status: "payment_pending",
      },
    });
  } catch (error: any) {
    console.error("[Media Store] Error creating order:", error);
    if (error.name === "ZodError") {
      return res.status(400).json({ 
        success: false, 
        error: "بيانات غير صالحة",
        details: error.errors,
      });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// Cart order - multiple services in one order
const createCartOrderSchema = z.object({
  items: z.array(z.object({
    serviceId: z.string(),
    quantity: z.number().min(1).max(10),
  })).min(1, "السلة فارغة"),
  customerName: z.string().min(2, "الاسم مطلوب"),
  customerEmail: z.string().email("البريد الإلكتروني غير صالح"),
  customerPhone: z.string().optional(),
  customerCompany: z.string().optional(),
  additionalNotes: z.string().optional(),
});

router.post("/orders/cart", async (req: Request, res: Response) => {
  try {
    const body = createCartOrderSchema.parse(req.body);

    // Fetch all requested services
    const serviceIds = body.items.map(item => item.serviceId);
    const services = await db
      .select()
      .from(mediaServices)
      .where(eq(mediaServices.isActive, true));

    const activeServices = services.filter(s => serviceIds.includes(s.id));
    
    if (activeServices.length !== serviceIds.length) {
      return res.status(404).json({ success: false, error: "بعض الخدمات غير متوفرة" });
    }

    // Calculate totals
    let totalBaseHalalas = 0;
    const orderItems: { service: typeof activeServices[0]; quantity: number }[] = [];
    
    for (const item of body.items) {
      const service = activeServices.find(s => s.id === item.serviceId)!;
      totalBaseHalalas += service.priceHalalas * item.quantity;
      orderItems.push({ service, quantity: item.quantity });
    }

    const vatDetails = calculateVAT(totalBaseHalalas);
    const orderNumber = generateOrderNumber();
    const trackingToken = generateTrackingToken();

    // Create a combined service name
    const serviceNames = orderItems.map(item => 
      `${item.service.nameAr}${item.quantity > 1 ? ` (×${item.quantity})` : ''}`
    ).join(', ');

    // Create order for first service (main order) with combined totals
    const [order] = await db
      .insert(mediaServiceOrders)
      .values({
        orderNumber,
        trackingToken,
        serviceId: orderItems[0].service.id,
        serviceType: orderItems[0].service.type,
        serviceName: serviceNames,
        customerName: body.customerName,
        customerEmail: body.customerEmail,
        customerPhone: body.customerPhone || null,
        customerCompany: body.customerCompany || null,
        additionalNotes: body.additionalNotes || null,
        priceHalalas: vatDetails.baseAmount,
        vatHalalas: vatDetails.vatAmount,
        totalHalalas: vatDetails.totalAmount,
        currency: "SAR",
        status: "pending",
        ipAddress: req.ip || null,
        userAgent: req.headers["user-agent"] || null,
        metadata: {
          cartItems: orderItems.map(item => ({
            serviceId: item.service.id,
            serviceName: item.service.nameAr,
            quantity: item.quantity,
            priceHalalas: item.service.priceHalalas,
            subtotalHalalas: item.service.priceHalalas * item.quantity,
          })),
        },
      })
      .returning();

    await addOrderEvent(order.id, "created", `تم إنشاء طلب سلة: ${serviceNames}`);

    const baseUrl = process.env.FRONTEND_URL 
      || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null) 
      || "https://sabq.org";

    const redirectUrl = `${baseUrl}/media-store/payment/callback?order_id=${order.id}`;
    const webhookUrl = `${baseUrl}/api/media-store/webhook`;

    const charge = await tapService.createCharge({
      amountHalalas: vatDetails.totalAmount,
      currency: "SAR",
      customer: {
        firstName: body.customerName,
        email: body.customerEmail,
        phone: body.customerPhone ? { countryCode: "966", number: body.customerPhone.replace(/^\+966/, "") } : undefined,
      },
      redirectUrl,
      postUrl: webhookUrl,
      description: `طلب خدمات إعلامية: ${serviceNames} (شامل ضريبة القيمة المضافة 15%)`,
      metadata: {
        orderId: order.id,
        orderNumber,
        itemCount: orderItems.length,
        baseAmount: vatDetails.baseAmount,
        vatAmount: vatDetails.vatAmount,
        vatRate: "15%",
      },
    });

    await db.update(mediaServiceOrders)
      .set({ 
        paymentChargeId: charge.id,
        status: "payment_pending",
        updatedAt: new Date(),
      })
      .where(eq(mediaServiceOrders.id, order.id));

    await addOrderEvent(order.id, "payment_initiated", `تم بدء عملية الدفع - Charge: ${charge.id}`);

    console.log(`[Media Store] Cart order created: ${orderNumber}, items: ${orderItems.length}, charge: ${charge.id}`);

    res.json({
      success: true,
      data: {
        orderId: order.id,
        orderNumber,
        trackingToken,
        chargeId: charge.id,
        paymentUrl: charge.transaction?.url,
        status: "payment_pending",
        itemCount: orderItems.length,
      },
    });
  } catch (error: any) {
    console.error("[Media Store] Error creating cart order:", error);
    if (error.name === "ZodError") {
      return res.status(400).json({ 
        success: false, 
        error: "بيانات غير صالحة",
        details: error.errors,
      });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/orders/track/:token", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const [order] = await db
      .select({
        id: mediaServiceOrders.id,
        orderNumber: mediaServiceOrders.orderNumber,
        serviceName: mediaServiceOrders.serviceName,
        serviceType: mediaServiceOrders.serviceType,
        status: mediaServiceOrders.status,
        totalHalalas: mediaServiceOrders.totalHalalas,
        currency: mediaServiceOrders.currency,
        createdAt: mediaServiceOrders.createdAt,
        paidAt: mediaServiceOrders.paidAt,
        executedAt: mediaServiceOrders.executedAt,
        executionUrl: mediaServiceOrders.executionUrl,
      })
      .from(mediaServiceOrders)
      .where(eq(mediaServiceOrders.trackingToken, token))
      .limit(1);

    if (!order) {
      return res.status(404).json({ success: false, error: "الطلب غير موجود" });
    }

    const events = await db
      .select({
        eventType: mediaOrderEvents.eventType,
        description: mediaOrderEvents.description,
        createdAt: mediaOrderEvents.createdAt,
      })
      .from(mediaOrderEvents)
      .where(eq(mediaOrderEvents.orderId, order.id))
      .orderBy(desc(mediaOrderEvents.createdAt));

    res.json({
      success: true,
      data: {
        ...order,
        totalSAR: (order.totalHalalas / 100).toFixed(2),
        events,
      },
    });
  } catch (error: any) {
    console.error("[Media Store] Error tracking order:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/webhook", raw({ type: "application/json" }), async (req: Request, res: Response) => {
  try {
    const rawBody = req.body.toString("utf8");
    const hashstring = req.headers["hashstring"] as string || req.headers["hash"] as string;

    if (!tapService.verifyWebhookSignature(rawBody, hashstring || "")) {
      console.error("[Media Store] Invalid or missing webhook signature");
      return res.status(401).send("Unauthorized");
    }

    const payload = JSON.parse(rawBody);
    const chargeId = payload.id;
    const orderId = payload.metadata?.orderId;

    console.log(`[Media Store] Webhook received for charge ${chargeId}, order ${orderId}`);

    if (!orderId) {
      console.error("[Media Store] No orderId in webhook metadata");
      return res.status(400).send("Missing orderId");
    }

    const [order] = await db
      .select()
      .from(mediaServiceOrders)
      .where(eq(mediaServiceOrders.id, orderId))
      .limit(1);

    if (!order) {
      console.error(`[Media Store] Order not found: ${orderId}`);
      return res.status(404).send("Order not found");
    }

    const verifiedCharge = await tapService.retrieveCharge(chargeId);
    const verifiedStatus = verifiedCharge.status;

    console.log(`[Media Store] Verified status from Tap API: ${verifiedStatus}`);

    if (tapService.isPaymentSuccessful(verifiedStatus)) {
      await db.update(mediaServiceOrders)
        .set({
          status: "paid",
          paymentId: chargeId,
          paymentMethod: verifiedCharge.source?.payment_method || "card",
          paidAt: new Date(),
          updatedAt: new Date(),
          metadata: {
            ...(order.metadata || {}),
            tapResponse: verifiedCharge.response,
            cardBrand: verifiedCharge.card?.brand,
            cardLastFour: verifiedCharge.card?.last_four,
          },
        })
        .where(eq(mediaServiceOrders.id, orderId));

      await addOrderEvent(orderId, "paid", `تم الدفع بنجاح - المبلغ: ${(order.totalHalalas / 100).toFixed(2)} ريال`);

      console.log(`[Media Store] Order ${order.orderNumber} marked as paid`);

    } else if (tapService.isPaymentFailed(verifiedStatus)) {
      await db.update(mediaServiceOrders)
        .set({
          status: "cancelled",
          updatedAt: new Date(),
          metadata: {
            ...(order.metadata || {}),
            failureReason: verifiedCharge.response?.message,
          },
        })
        .where(eq(mediaServiceOrders.id, orderId));

      await addOrderEvent(orderId, "payment_failed", `فشل الدفع: ${verifiedCharge.response?.message || verifiedStatus}`);

      await createPaymentAlert(
        "failed_payment",
        "فشل دفع خدمة إعلامية",
        `فشلت عملية الدفع للطلب ${order.orderNumber}`,
        chargeId,
        {
          chargeId,
          orderId,
          orderNumber: order.orderNumber,
          amount: order.totalHalalas,
          status: verifiedStatus,
          gatewayResponse: verifiedCharge.response,
        },
        "high"
      );

      console.log(`[Media Store] Order ${order.orderNumber} payment failed`);
    }

    res.status(200).send("OK");
  } catch (error: any) {
    console.error("[Media Store] Webhook error:", error);
    res.status(500).send("Internal error");
  }
});

router.get("/orders/status/:orderId", async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    const [order] = await db
      .select({
        id: mediaServiceOrders.id,
        orderNumber: mediaServiceOrders.orderNumber,
        status: mediaServiceOrders.status,
        trackingToken: mediaServiceOrders.trackingToken,
      })
      .from(mediaServiceOrders)
      .where(eq(mediaServiceOrders.id, orderId))
      .limit(1);

    if (!order) {
      return res.status(404).json({ success: false, error: "الطلب غير موجود" });
    }

    res.json({
      success: true,
      data: order,
    });
  } catch (error: any) {
    console.error("[Media Store] Error checking order status:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ADMIN ROUTES - مسارات الإدارة
// ============================================

const requireAdmin = (req: Request, res: Response, next: Function) => {
  if (!req.isAuthenticated?.() || !req.user) {
    return res.status(401).json({ success: false, error: "يجب تسجيل الدخول" });
  }
  const user = req.user as any;
  const adminRoles = ["admin", "super_admin", "superadmin", "system_admin"];
  if (!adminRoles.includes(user.role)) {
    return res.status(403).json({ success: false, error: "غير مصرح لك بالوصول" });
  }
  next();
};

// GET /admin/stats - Dashboard statistics
router.get("/admin/stats", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const [totalResult] = await db
      .select({ count: count() })
      .from(mediaServiceOrders);
    
    const [pendingResult] = await db
      .select({ count: count() })
      .from(mediaServiceOrders)
      .where(or(eq(mediaServiceOrders.status, "pending"), eq(mediaServiceOrders.status, "payment_pending")));
    
    const [paidResult] = await db
      .select({ count: count() })
      .from(mediaServiceOrders)
      .where(eq(mediaServiceOrders.status, "paid"));
    
    const [processingResult] = await db
      .select({ count: count() })
      .from(mediaServiceOrders)
      .where(eq(mediaServiceOrders.status, "processing"));
    
    const [completedResult] = await db
      .select({ count: count() })
      .from(mediaServiceOrders)
      .where(eq(mediaServiceOrders.status, "completed"));
    
    const [cancelledResult] = await db
      .select({ count: count() })
      .from(mediaServiceOrders)
      .where(eq(mediaServiceOrders.status, "cancelled"));
    
    const [revenueResult] = await db
      .select({ total: sum(mediaServiceOrders.totalHalalas) })
      .from(mediaServiceOrders)
      .where(or(
        eq(mediaServiceOrders.status, "paid"),
        eq(mediaServiceOrders.status, "processing"),
        eq(mediaServiceOrders.status, "completed")
      ));

    const totalRevenue = Number(revenueResult?.total || 0);

    res.json({
      success: true,
      data: {
        totalOrders: totalResult?.count || 0,
        pendingOrders: pendingResult?.count || 0,
        paidOrders: paidResult?.count || 0,
        processingOrders: processingResult?.count || 0,
        completedOrders: completedResult?.count || 0,
        cancelledOrders: cancelledResult?.count || 0,
        totalRevenueHalalas: totalRevenue,
        totalRevenueSAR: (totalRevenue / 100).toFixed(2),
      },
    });
  } catch (error: any) {
    console.error("[Media Store Admin] Error fetching stats:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /admin/orders - List all orders with pagination and filters
router.get("/admin/orders", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { 
      page = "1", 
      limit = "20", 
      status, 
      search,
      startDate,
      endDate,
      sortBy = "createdAt",
      sortOrder = "desc"
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];

    if (status && status !== "all") {
      conditions.push(eq(mediaServiceOrders.status, status as string));
    }

    if (search) {
      const searchTerm = `%${search}%`;
      conditions.push(
        or(
          like(mediaServiceOrders.orderNumber, searchTerm),
          like(mediaServiceOrders.customerName, searchTerm),
          like(mediaServiceOrders.customerEmail, searchTerm),
          like(mediaServiceOrders.customerPhone, searchTerm)
        )!
      );
    }

    if (startDate) {
      conditions.push(gte(mediaServiceOrders.createdAt, new Date(startDate as string)));
    }

    if (endDate) {
      const endDateTime = new Date(endDate as string);
      endDateTime.setHours(23, 59, 59, 999);
      conditions.push(lte(mediaServiceOrders.createdAt, endDateTime));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db
      .select({ count: count() })
      .from(mediaServiceOrders)
      .where(whereClause);

    const orderByColumn = sortBy === "totalHalalas" ? mediaServiceOrders.totalHalalas : mediaServiceOrders.createdAt;
    const orderDirection = sortOrder === "asc" ? asc : desc;

    const orders = await db
      .select({
        id: mediaServiceOrders.id,
        orderNumber: mediaServiceOrders.orderNumber,
        serviceId: mediaServiceOrders.serviceId,
        serviceType: mediaServiceOrders.serviceType,
        serviceName: mediaServiceOrders.serviceName,
        customerName: mediaServiceOrders.customerName,
        customerEmail: mediaServiceOrders.customerEmail,
        customerPhone: mediaServiceOrders.customerPhone,
        customerCompany: mediaServiceOrders.customerCompany,
        contentTitle: mediaServiceOrders.contentTitle,
        priceHalalas: mediaServiceOrders.priceHalalas,
        vatHalalas: mediaServiceOrders.vatHalalas,
        totalHalalas: mediaServiceOrders.totalHalalas,
        currency: mediaServiceOrders.currency,
        status: mediaServiceOrders.status,
        paymentMethod: mediaServiceOrders.paymentMethod,
        paidAt: mediaServiceOrders.paidAt,
        executedAt: mediaServiceOrders.executedAt,
        createdAt: mediaServiceOrders.createdAt,
        updatedAt: mediaServiceOrders.updatedAt,
      })
      .from(mediaServiceOrders)
      .where(whereClause)
      .orderBy(orderDirection(orderByColumn))
      .limit(limitNum)
      .offset(offset);

    const totalCount = countResult?.count || 0;
    const totalPages = Math.ceil(totalCount / limitNum);

    res.json({
      success: true,
      data: {
        orders: orders.map(order => ({
          ...order,
          priceSAR: (order.priceHalalas / 100).toFixed(2),
          vatSAR: (order.vatHalalas / 100).toFixed(2),
          totalSAR: (order.totalHalalas / 100).toFixed(2),
        })),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: totalCount,
          totalPages,
          hasMore: pageNum < totalPages,
        },
      },
    });
  } catch (error: any) {
    console.error("[Media Store Admin] Error fetching orders:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /admin/orders/:id - Get single order with all details
router.get("/admin/orders/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [order] = await db
      .select()
      .from(mediaServiceOrders)
      .where(eq(mediaServiceOrders.id, id))
      .limit(1);

    if (!order) {
      return res.status(404).json({ success: false, error: "الطلب غير موجود" });
    }

    const events = await db
      .select({
        id: mediaOrderEvents.id,
        eventType: mediaOrderEvents.eventType,
        description: mediaOrderEvents.description,
        metadata: mediaOrderEvents.metadata,
        createdBy: mediaOrderEvents.createdBy,
        createdAt: mediaOrderEvents.createdAt,
      })
      .from(mediaOrderEvents)
      .where(eq(mediaOrderEvents.orderId, id))
      .orderBy(desc(mediaOrderEvents.createdAt));

    const eventsWithUsers = await Promise.all(
      events.map(async (event) => {
        if (event.createdBy) {
          const [user] = await db
            .select({ firstName: users.firstName, lastName: users.lastName, email: users.email })
            .from(users)
            .where(eq(users.id, event.createdBy))
            .limit(1);
          return { ...event, creatorName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : null };
        }
        return { ...event, creatorName: null };
      })
    );

    res.json({
      success: true,
      data: {
        ...order,
        priceSAR: (order.priceHalalas / 100).toFixed(2),
        vatSAR: (order.vatHalalas / 100).toFixed(2),
        totalSAR: (order.totalHalalas / 100).toFixed(2),
        events: eventsWithUsers,
      },
    });
  } catch (error: any) {
    console.error("[Media Store Admin] Error fetching order details:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /admin/orders/:id/status - Update order status
const updateStatusSchema = z.object({
  status: z.enum(["pending", "payment_pending", "paid", "processing", "completed", "cancelled", "refunded"]),
  notes: z.string().optional(),
});

router.patch("/admin/orders/:id/status", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const body = updateStatusSchema.parse(req.body);
    const userId = (req.user as any)?.id;

    const [order] = await db
      .select()
      .from(mediaServiceOrders)
      .where(eq(mediaServiceOrders.id, id))
      .limit(1);

    if (!order) {
      return res.status(404).json({ success: false, error: "الطلب غير موجود" });
    }

    const oldStatus = order.status;
    const newStatus = body.status;

    const updateData: any = {
      status: newStatus,
      updatedAt: new Date(),
    };

    if (newStatus === "processing" && !order.executedAt) {
      updateData.executedBy = userId;
    }

    if (newStatus === "completed" && !order.executedAt) {
      updateData.executedAt = new Date();
      updateData.executedBy = userId;
    }

    await db.update(mediaServiceOrders)
      .set(updateData)
      .where(eq(mediaServiceOrders.id, id));

    const statusLabels: Record<string, string> = {
      pending: "قيد الانتظار",
      payment_pending: "بانتظار الدفع",
      paid: "تم الدفع",
      processing: "قيد التنفيذ",
      completed: "مكتمل",
      cancelled: "ملغي",
      refunded: "مسترجع",
    };

    const eventDescription = body.notes 
      ? `تم تغيير الحالة من "${statusLabels[oldStatus]}" إلى "${statusLabels[newStatus]}" - ${body.notes}`
      : `تم تغيير الحالة من "${statusLabels[oldStatus]}" إلى "${statusLabels[newStatus]}"`;

    await addOrderEvent(
      id,
      `status_changed_to_${newStatus}`,
      eventDescription,
      { oldStatus, newStatus, notes: body.notes },
      userId
    );

    console.log(`[Media Store Admin] Order ${order.orderNumber} status changed: ${oldStatus} -> ${newStatus}`);

    res.json({
      success: true,
      data: {
        id,
        oldStatus,
        newStatus,
        message: "تم تحديث حالة الطلب بنجاح",
      },
    });
  } catch (error: any) {
    console.error("[Media Store Admin] Error updating order status:", error);
    if (error.name === "ZodError") {
      return res.status(400).json({ 
        success: false, 
        error: "بيانات غير صالحة",
        details: error.errors,
      });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
