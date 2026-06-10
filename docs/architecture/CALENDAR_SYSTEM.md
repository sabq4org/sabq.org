# تقويم سبق - Sabq Editorial Calendar System

## نظرة عامة - Overview

نظام تقويم سبق هو نظام تحريري متكامل لإدارة الأحداث والمناسبات الهامة، مع توليد محتوى ذكي باستخدام AI وإدارة المهام والتذكيرات.

The Sabq Calendar is a comprehensive editorial calendar system for managing important events and occasions, with AI-powered content generation, task management, and automated reminders.

## ✨ الميزات الرئيسية - Key Features

### 1. إدارة الأحداث - Event Management
- **أنواع الأحداث**: عالمي (GLOBAL)، وطني (NATIONAL)، داخلي (INTERNAL)
- **مستويات الأهمية**: 1 (منخفض) إلى 5 (عاجل جداً)
- **التصفية والبحث**: حسب التاريخ، النوع، الأهمية، الوسوم
- **الربط بالتصنيفات**: ربط الأحداث بتصنيفات المحتوى

### 2. التوليد الذكي للمحتوى - AI Content Generation
- **أفكار تحريرية**: 5 زوايا قصصية لكل حدث
- **عناوين**: رئيسي، ثانوي، و3 بدائل
- **إنفوجرافيك**: 8 نقاط بيانات جاهزة
- **محتوى سوشيال ميديا**: تويتر، إنستجرام، لينكدإن مع هاشتاجات
- **SEO**: كلمات مفتاحية، عنوان ميتا، وصف ميتا
- **مسودة مقال كامل**: من أي زاوية تحريرية

### 3. إدارة المهام - Task Management
- **تعيين المهام**: لمحررين، مراسلين، مصممين، فريق السوشيال ميديا
- **حالات المهام**: pending, in_progress, done, cancelled
- **الأدوار**: editor, reporter, designer, social
- **التتبع**: متابعة تقدم كل مهمة

### 4. التذكيرات - Reminders
- **قنوات متعددة**: IN_APP, EMAIL, WHATSAPP, SLACK
- **جدولة مرنة**: تذكير قبل الحدث بعدد أيام محدد
- **رسائل مخصصة**: رسالة تذكير لكل حدث
- **تفعيل/تعطيل**: إمكانية التحكم في كل تذكير

### 5. الأتمتة - Automation
- **توليد مسودات تلقائي**: يومياً للأحداث المهمة
- **معالجة التذكيرات**: كل ساعة
- **تخزين مؤقت**: تحديث كل 15 دقيقة للأحداث القادمة

## 🏗️ البنية التقنية - Technical Architecture

### Database Schema

```typescript
// Calendar Events
calendarEvents {
  id: string (PK)
  title: string
  slug: string (unique)
  description: text
  type: GLOBAL | NATIONAL | INTERNAL
  dateStart: date
  dateEnd: date (nullable)
  importance: 1-5
  tags: string[]
  categoryId: string (FK)
  createdById: string (FK)
  createdAt: timestamp
  updatedAt: timestamp
}

// Calendar Reminders
calendarReminders {
  id: string (PK)
  eventId: string (FK)
  fireWhen: number (days before event)
  channels: string[] (IN_APP, EMAIL, WHATSAPP, SLACK)
  message: text
  enabled: boolean
  createdAt: timestamp
}

// Calendar AI Drafts
calendarAiDrafts {
  id: string (PK)
  eventId: string (FK, unique)
  editorialIdeas: json
  headlines: json
  infographicData: json
  socialMedia: json
  seo: json
  createdAt: timestamp
  updatedAt: timestamp
}

// Calendar Assignments
calendarAssignments {
  id: string (PK)
  eventId: string (FK)
  userId: string (FK, nullable)
  role: editor | reporter | designer | social
  status: pending | in_progress | done | cancelled
  notes: text
  createdById: string (FK)
  createdAt: timestamp
  updatedAt: timestamp
}
```

### API Endpoints

#### Events
- `GET /api/calendar` - List events with filters (type, importance, dateFrom, dateTo, tags, search)
- `POST /api/calendar` - Create event (requires: calendar:create)
- `GET /api/calendar/:id` - Get event details
- `PATCH /api/calendar/:id` - Update event (requires: calendar:edit)
- `DELETE /api/calendar/:id` - Delete event (requires: calendar:delete)
- `GET /api/calendar/upcoming` - Get upcoming events (7-day lookahead)

#### Reminders
- `GET /api/calendar/:id/reminders` - Get event reminders
- `POST /api/calendar/:id/reminders` - Create reminder (requires: calendar:create)
- `DELETE /api/calendar/reminders/:id` - Delete reminder (requires: calendar:edit)

#### Assignments
- `GET /api/calendar/:id/assignments` - Get event assignments
- `POST /api/calendar/:id/assignments` - Create assignment (requires: calendar:assign_tasks)
- `PATCH /api/calendar/assignments/:id` - Update assignment (requires: calendar:assign_tasks)
- `DELETE /api/calendar/assignments/:id` - Delete assignment (requires: calendar:assign_tasks)
- `PATCH /api/calendar/assignments/:id/status` - Update status (self or calendar:assign_tasks)

#### AI Generation
- `POST /api/calendar/:id/generate` - Generate AI draft (requires: calendar:generate_ai)
- `GET /api/calendar/:id/ai-draft` - Get cached AI draft
- `POST /api/calendar/:id/create-article-draft` - Create article from event

### Storage Layer

```typescript
interface IStorage {
  // Events
  getCalendarEvents(filters): Promise<CalendarEvent[]>
  getCalendarEventById(id): Promise<CalendarEvent | undefined>
  createCalendarEvent(data): Promise<CalendarEvent>
  updateCalendarEvent(id, data): Promise<CalendarEvent>
  deleteCalendarEvent(id): Promise<void>
  getUpcomingCalendarEvents(days): Promise<CalendarEvent[]>
  
  // Reminders
  getCalendarReminders(eventId): Promise<CalendarReminder[]>
  createCalendarReminder(data): Promise<CalendarReminder>
  deleteCalendarReminder(id): Promise<void>
  getRemindersToFire(date): Promise<CalendarReminderWithEvent[]>
  updateCalendarReminder(id, data): Promise<CalendarReminder>
  
  // AI Drafts
  getCalendarAiDraft(eventId): Promise<CalendarAiDraft | undefined>
  createCalendarAiDraft(data): Promise<CalendarAiDraft>
  updateCalendarAiDraft(eventId, data): Promise<CalendarAiDraft>
  
  // Assignments
  getCalendarAssignments(filters): Promise<CalendarAssignment[]>
  createCalendarAssignment(data): Promise<CalendarAssignment>
  updateCalendarAssignment(id, data): Promise<CalendarAssignment>
  deleteCalendarAssignment(id): Promise<void>
}
```

### AI Service

```typescript
// services/calendarAi.ts
export async function generateCalendarEventIdeas(
  title: string,
  description: string,
  type: string,
  date: Date
): Promise<CalendarAIDraft>

export async function generateArticleDraft(
  eventTitle: string,
  eventDescription: string,
  selectedAngle: string
): Promise<ArticleDraft>
```

### Cron Jobs

```typescript
// jobs/calendar.ts

// Daily at 2:00 AM - Generate AI drafts for high-importance events
autoGenerateAiDrafts: '0 2 * * *'

// Every hour - Process and send reminders
processReminders: '0 * * * *'

// Every 15 minutes - Update upcoming events cache
updateUpcomingEventsCache: '*/15 * * * *'
```

## 🔐 RBAC Permissions

### Calendar Module Permissions
- `calendar:view` - عرض التقويم
- `calendar:create` - إنشاء أحداث التقويم
- `calendar:edit` - تعديل أحداث التقويم
- `calendar:delete` - حذف أحداث التقويم
- `calendar:assign_tasks` - تعيين مهام التقويم
- `calendar:generate_ai` - توليد محتوى ذكي

### Role Mappings
- **system_admin**: All permissions
- **admin**: All calendar permissions
- **editor**: view, create, edit, assign_tasks, generate_ai
- **reporter**: view, create

## 🌱 Seed Data

### 300+ Arabic Occasions Included

#### International (عالمي)
- UN International Days (أيام الأمم المتحدة)
- WHO Health Days (منظمة الصحة العالمية)
- UNESCO Cultural Days (اليونسكو)
- Global awareness days

#### National (وطني)
- Saudi National Occasions
  - اليوم الوطني السعودي (23 سبتمبر)
  - يوم التأسيس السعودي (22 فبراير)
  - يوم العلم السعودي (11 مارس)
  - يوم بيعة الملك سلمان (3 أبريل)
- GCC National Days
  - الإماراتي، القطري، البحريني، الكويتي، العماني
- Saudi Seasons & Festivals
  - موسم الرياض، موسم جدة
  - معرض الكتاب، مهرجان الأفلام
  - منتدى مبادرة مستقبل الاستثمار

#### Technology & Business (تقنية واقتصاد)
- CES, MWC, Google I/O, Apple WWDC
- Computex, Davos Forum

#### Sports (رياضة)
- رالي داكار السعودية
- الدرعية للفورمولا إي
- بطولات عالمية

#### Cultural (ثقافة وفن)
- Oscars, Grammy, Cannes, Venice
- Art Dubai, Biennale

#### Internal (داخلي)
- Editorial meetings
- Training workshops
- Marketing campaigns
- Report deadlines

## 📝 Usage Example

### Create Event with Reminders

```typescript
// Create event
const event = await storage.createCalendarEvent({
  title: "اليوم الوطني السعودي",
  description: "ذكرى توحيد المملكة العربية السعودية",
  type: "NATIONAL",
  dateStart: new Date("2025-09-23"),
  importance: 5,
  tags: ["سعودية", "وطني", "احتفال"],
  categoryId: "...",
  createdById: "..."
});

// Add reminder
await storage.createCalendarReminder({
  eventId: event.id,
  fireWhen: 7, // 7 days before
  channels: ["IN_APP", "EMAIL"],
  message: "اقتراب اليوم الوطني السعودي - جهز خطة التغطية",
  enabled: true
});
```

### Generate AI Content

```typescript
// Generate AI draft
const response = await fetch(`/api/calendar/${eventId}/generate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
});

const aiDraft = await response.json();
// aiDraft contains: editorialIdeas, headlines, infographicData, socialMedia, seo
```

### Assign Tasks

```typescript
// Assign to reporter
await storage.createCalendarAssignment({
  eventId: event.id,
  userId: reporterId,
  role: "reporter",
  status: "pending",
  notes: "كتابة تقرير شامل عن الفعاليات",
  createdById: editorId
});

// Assign to designer
await storage.createCalendarAssignment({
  eventId: event.id,
  userId: designerId,
  role: "designer",
  status: "pending",
  notes: "تصميم إنفوجرافيك احتفالي",
  createdById: editorId
});
```

## 🚀 Getting Started

### 1. Run Database Migrations
```bash
npm run db:push
```

### 2. Seed RBAC Permissions
```bash
npm run seed
```

### 3. Seed Calendar Data
```typescript
import { seedCalendarEvents } from './server/scripts/seedCalendar';
await seedCalendarEvents();
```

### 4. Start Calendar Jobs
```typescript
import { startCalendarJobs } from './server/jobs/calendar';
startCalendarJobs();
```

## 🔄 Integration Points

### With Existing Systems
- **Articles**: Create article drafts from calendar events
- **Notifications**: Send reminders via notification engine
- **Categories**: Link events to content categories
- **RBAC**: Full permission control
- **Activity Logs**: All actions logged

### OpenAI Integration
- Uses GPT-4 model for Arabic content generation
- Structured JSON outputs
- Context-aware prompts for Saudi/Arab audience

## 📊 Performance Considerations

- **Caching**: In-memory cache for upcoming events (15-min refresh)
- **Batch Processing**: AI draft generation runs off-peak (2 AM)
- **Rate Limiting**: 2-second delay between AI requests
- **Database Indexes**: On dateStart, type, importance for fast queries

## 🔮 Future Enhancements

- [ ] CSV/ICS import functionality
- [ ] Export to calendar formats (iCal, Google Calendar)
- [ ] WhatsApp/Slack reminder integration
- [ ] Calendar view frontend UI
- [ ] Analytics dashboard
- [ ] Recurring events support
- [ ] Calendar templates
- [ ] Multi-language support

## 📄 License

Part of Sabq News Platform - All Rights Reserved
