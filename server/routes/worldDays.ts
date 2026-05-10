import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { requireAuth, requireRole } from "../rbac";
import { insertWorldDaySchema, type InsertWorldDay, type InsertWorldDaySuggestion } from "@shared/schema";
import OpenAI from "openai";

const router = Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// GET /api/world-days - List all world days with optional filters
router.get("/", async (req: Request, res: Response) => {
  try {
    const { category, month, isActive } = req.query;
    
    const filters: { category?: string; isActive?: boolean; month?: number } = {};
    
    if (category && typeof category === "string") {
      filters.category = category;
    }
    if (month && typeof month === "string") {
      filters.month = parseInt(month, 10);
    }
    if (isActive !== undefined) {
      filters.isActive = isActive === "true";
    }
    
    const worldDays = await storage.getAllWorldDays(filters);
    res.json(worldDays);
  } catch (error) {
    console.error("[WorldDays] Error fetching world days:", error);
    res.status(500).json({ message: "حدث خطأ أثناء جلب الأيام العالمية" });
  }
});

// GET /api/world-days/upcoming - Get upcoming world days (next 30 days)
router.get("/upcoming", async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string, 10) || 30;
    const upcomingDays = await storage.getUpcomingWorldDays(days);
    res.json(upcomingDays);
  } catch (error) {
    console.error("[WorldDays] Error fetching upcoming world days:", error);
    res.status(500).json({ message: "حدث خطأ أثناء جلب الأيام العالمية القادمة" });
  }
});

// GET /api/world-days/calendar - Return world days for calendar integration
router.get("/calendar", async (req: Request, res: Response) => {
  try {
    const { start, end } = req.query;
    
    let startDate: Date | undefined;
    let endDate: Date | undefined;
    
    if (start && typeof start === "string") {
      startDate = new Date(start);
    }
    if (end && typeof end === "string") {
      endDate = new Date(end);
    }
    
    const allDays = await storage.getAllWorldDays({ isActive: true });
    
    const calendarEvents = allDays
      .filter(day => {
        if (!startDate && !endDate) return true;
        const eventDate = new Date(day.eventDate);
        if (startDate && eventDate < startDate) return false;
        if (endDate && eventDate > endDate) return false;
        return true;
      })
      .map(day => ({
        id: day.id,
        title: day.nameAr,
        titleEn: day.nameEn,
        start: day.eventDate,
        end: day.eventDate,
        allDay: true,
        color: day.color,
        category: day.category,
        description: day.description,
      }));
    
    res.json(calendarEvents);
  } catch (error) {
    console.error("[WorldDays] Error fetching calendar events:", error);
    res.status(500).json({ message: "حدث خطأ أثناء جلب بيانات التقويم" });
  }
});

// GET /api/world-days/:id - Get a single world day by ID
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const worldDay = await storage.getWorldDayById(id);
    
    if (!worldDay) {
      return res.status(404).json({ message: "اليوم العالمي غير موجود" });
    }
    
    res.json(worldDay);
  } catch (error) {
    console.error("[WorldDays] Error fetching world day:", error);
    res.status(500).json({ message: "حدث خطأ أثناء جلب اليوم العالمي" });
  }
});

// POST /api/world-days - Create a new world day (admin only)
router.post("/", requireAuth, requireRole("admin", "editor"), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const validatedData = insertWorldDaySchema.parse(req.body);
    
    const worldDay = await storage.createWorldDay({
      ...validatedData,
      createdBy: userId,
    });
    
    res.status(201).json(worldDay);
  } catch (error: any) {
    console.error("[WorldDays] Error creating world day:", error);
    if (error.name === "ZodError") {
      return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
    }
    res.status(500).json({ message: "حدث خطأ أثناء إنشاء اليوم العالمي" });
  }
});

// PUT /api/world-days/:id - Update a world day (admin only)
router.put("/:id", requireAuth, requireRole("admin", "editor"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const existingDay = await storage.getWorldDayById(id);
    if (!existingDay) {
      return res.status(404).json({ message: "اليوم العالمي غير موجود" });
    }
    
    const updatedDay = await storage.updateWorldDay(id, req.body);
    res.json(updatedDay);
  } catch (error) {
    console.error("[WorldDays] Error updating world day:", error);
    res.status(500).json({ message: "حدث خطأ أثناء تحديث اليوم العالمي" });
  }
});

// DELETE /api/world-days/:id - Delete a world day (admin only)
router.delete("/:id", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const existingDay = await storage.getWorldDayById(id);
    if (!existingDay) {
      return res.status(404).json({ message: "اليوم العالمي غير موجود" });
    }
    
    await storage.deleteWorldDay(id);
    res.json({ success: true, message: "تم حذف اليوم العالمي بنجاح" });
  } catch (error) {
    console.error("[WorldDays] Error deleting world day:", error);
    res.status(500).json({ message: "حدث خطأ أثناء حذف اليوم العالمي" });
  }
});

// POST /api/world-days/import-ics - Import world days from ICS file content (admin only)
router.post("/import-ics", requireAuth, requireRole("admin", "editor"), async (req: Request, res: Response) => {
  try {
    const { icsContent, category = "international" } = req.body;
    const userId = (req as any).user?.id;
    
    if (!icsContent || typeof icsContent !== "string") {
      return res.status(400).json({ message: "محتوى ICS مطلوب" });
    }
    
    const parsedEvents = parseIcsContent(icsContent);
    
    if (parsedEvents.length === 0) {
      return res.status(400).json({ message: "لم يتم العثور على أحداث في الملف" });
    }
    
    const worldDaysToCreate: InsertWorldDay[] = [];
    const skippedDuplicates: string[] = [];
    
    for (const event of parsedEvents) {
      if (event.uid) {
        const existing = await storage.getWorldDayBySourceUid(event.uid);
        if (existing) {
          skippedDuplicates.push(event.summary);
          continue;
        }
      }
      
      const eventDate = new Date(event.dtstart);
      const month = eventDate.getMonth() + 1;
      const day = eventDate.getDate();
      
      let nameAr = event.summary;
      let nameEn: string | undefined;
      
      if (event.summary.includes("\n")) {
        const parts = event.summary.split("\n");
        nameAr = parts[0].trim();
        nameEn = parts[1]?.trim();
      }
      
      worldDaysToCreate.push({
        nameAr,
        nameEn,
        eventDate: eventDate.toISOString().split("T")[0],
        month,
        day,
        category,
        sourceUid: event.uid,
        createdBy: userId,
        isRecurring: true,
        isActive: true,
      });
    }
    
    let created: any[] = [];
    if (worldDaysToCreate.length > 0) {
      created = await storage.bulkCreateWorldDays(worldDaysToCreate);
    }
    
    res.json({
      success: true,
      imported: created.length,
      skipped: skippedDuplicates.length,
      skippedNames: skippedDuplicates,
      total: parsedEvents.length,
    });
  } catch (error) {
    console.error("[WorldDays] Error importing ICS:", error);
    res.status(500).json({ message: "حدث خطأ أثناء استيراد ملف ICS" });
  }
});

// GET /api/world-days/:id/suggestions - Get existing suggestions for a world day
router.get("/:id/suggestions", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const worldDay = await storage.getWorldDayById(id);
    if (!worldDay) {
      return res.status(404).json({ message: "اليوم العالمي غير موجود" });
    }
    
    const suggestions = await storage.getWorldDaySuggestions(id);
    res.json(suggestions);
  } catch (error) {
    console.error("[WorldDays] Error fetching suggestions:", error);
    res.status(500).json({ message: "حدث خطأ أثناء جلب الاقتراحات" });
  }
});

// POST /api/world-days/:id/generate-suggestions - Generate content suggestions using OpenAI
router.post("/:id/generate-suggestions", requireAuth, requireRole("admin", "editor"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const worldDay = await storage.getWorldDayById(id);
    if (!worldDay) {
      return res.status(404).json({ message: "اليوم العالمي غير موجود" });
    }
    
    const prompt = `أنت محرر صحفي متخصص. لديك يوم عالمي هو: "${worldDay.nameAr}"${worldDay.nameEn ? ` (${worldDay.nameEn})` : ""}
${worldDay.description ? `الوصف: ${worldDay.description}` : ""}

قم بتوليد 5 اقتراحات محتوى متنوعة لهذه المناسبة. لكل اقتراح، حدد:
1. نوع المحتوى (خبر، تقرير، إنفوجرافيك، فعالية، منشور_سوشيال)
2. عنوان جذاب
3. ملخص قصير (جملتين)

أعد النتيجة بصيغة JSON:
{
  "suggestions": [
    {
      "type": "news|report|infographic|event|social_post",
      "title": "العنوان",
      "summary": "الملخص"
    }
  ]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "أنت محرر صحفي خبير في إنشاء محتوى إبداعي للمناسبات العالمية. أجب دائماً بصيغة JSON فقط." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      max_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from OpenAI");
    }

    const parsed = JSON.parse(content);
    const suggestions = parsed.suggestions || [];
    
    const createdSuggestions = [];
    const typeMapping: Record<string, string> = {
      "news": "news",
      "خبر": "news",
      "report": "report",
      "تقرير": "report",
      "infographic": "infographic",
      "إنفوجرافيك": "infographic",
      "event": "event",
      "فعالية": "event",
      "social_post": "social_post",
      "منشور_سوشيال": "social_post",
    };
    
    for (const suggestion of suggestions) {
      const suggestionType = typeMapping[suggestion.type] || "news";
      
      const created = await storage.createWorldDaySuggestion({
        worldDayId: id,
        suggestionType,
        title: suggestion.title,
        summary: suggestion.summary,
        aiProvider: "openai",
        confidenceScore: 0.85,
        status: "pending",
      });
      
      createdSuggestions.push(created);
    }
    
    res.json({
      success: true,
      count: createdSuggestions.length,
      suggestions: createdSuggestions,
    });
  } catch (error) {
    console.error("[WorldDays] Error generating suggestions:", error);
    res.status(500).json({ message: "حدث خطأ أثناء توليد الاقتراحات" });
  }
});

// POST /api/world-days/suggestions/:suggestionId/accept - Accept a suggestion
router.post("/suggestions/:suggestionId/accept", requireAuth, requireRole("admin", "editor"), async (req: Request, res: Response) => {
  try {
    const { suggestionId } = req.params;
    const userId = (req as any).user?.id;
    
    await storage.updateWorldDaySuggestionStatus(suggestionId, "accepted", userId);
    res.json({ success: true, message: "تم قبول الاقتراح" });
  } catch (error) {
    console.error("[WorldDays] Error accepting suggestion:", error);
    res.status(500).json({ message: "حدث خطأ أثناء قبول الاقتراح" });
  }
});

// POST /api/world-days/suggestions/:suggestionId/reject - Reject a suggestion
router.post("/suggestions/:suggestionId/reject", requireAuth, requireRole("admin", "editor"), async (req: Request, res: Response) => {
  try {
    const { suggestionId } = req.params;
    
    await storage.updateWorldDaySuggestionStatus(suggestionId, "rejected");
    res.json({ success: true, message: "تم رفض الاقتراح" });
  } catch (error) {
    console.error("[WorldDays] Error rejecting suggestion:", error);
    res.status(500).json({ message: "حدث خطأ أثناء رفض الاقتراح" });
  }
});

function parseIcsContent(icsContent: string): Array<{ uid: string; summary: string; dtstart: string }> {
  const events: Array<{ uid: string; summary: string; dtstart: string }> = [];
  
  const eventBlocks = icsContent.split("BEGIN:VEVENT");
  
  for (let i = 1; i < eventBlocks.length; i++) {
    const block = eventBlocks[i];
    const endIndex = block.indexOf("END:VEVENT");
    const eventContent = endIndex > -1 ? block.substring(0, endIndex) : block;
    
    const result = { uid: "", summary: "", dtstart: "" };
    
    const lines = eventContent.split(/\r?\n/);
    let currentField = "";
    let currentValue = "";
    
    const processField = (field: string, value: string) => {
      switch (field.toUpperCase()) {
        case "UID":
          result.uid = value;
          break;
        case "SUMMARY":
          result.summary = value.replace(/\\n/g, "\n").replace(/\\,/g, ",").replace(/\\\\/g, "\\");
          break;
        case "DTSTART":
          result.dtstart = parseDtstart(value);
          break;
      }
    };
    
    for (const line of lines) {
      if (line.startsWith(" ") || line.startsWith("\t")) {
        currentValue += line.trim();
      } else {
        if (currentField && currentValue) {
          processField(currentField, currentValue);
        }
        
        const colonIndex = line.indexOf(":");
        if (colonIndex > -1) {
          currentField = line.substring(0, colonIndex).split(";")[0].trim();
          currentValue = line.substring(colonIndex + 1).trim();
        }
      }
    }
    
    if (currentField && currentValue) {
      processField(currentField, currentValue);
    }
    
    if (result.summary && result.dtstart) {
      events.push({ uid: result.uid, summary: result.summary, dtstart: result.dtstart });
    }
  }
  
  return events;
}

function parseDtstart(value: string): string {
  const cleanValue = value.replace(/[TZ]/g, "");
  
  if (cleanValue.length >= 8) {
    const year = cleanValue.substring(0, 4);
    const month = cleanValue.substring(4, 6);
    const day = cleanValue.substring(6, 8);
    return `${year}-${month}-${day}`;
  }
  
  return value;
}

export default router;
