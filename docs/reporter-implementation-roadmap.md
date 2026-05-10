# خارطة طريق تطبيق دور المراسل

## الوضع الحالي ✅

تم إنجاز المرحلة الأولى والجزء الأساسي من التطبيق بنجاح:

### 1. التعريفات والصلاحيات
- ✅ إضافة صلاحيات جديدة في `shared/rbac-constants.ts`:
  - `analytics.view_own` - عرض إحصائيات المراسل فقط
  - `comments.view_own` - عرض التعليقات على مقالات المراسل فقط
  - صلاحيات Tags الكاملة (view, create, update, delete)

### 2. دور المراسل
- ✅ تحديث وصف دور المراسل ليكون شاملاً ومفصّلاً
- ✅ توسيع صلاحيات المراسل لتشمل:
  - إنشاء وتحرير المقالات الخاصة
  - رفع الوسائط
  - عرض التعليقات على مقالاته
  - عرض إحصائيات مقالاته

### 3. التوثيق
- ✅ إنشاء دليل شامل في `docs/reporter-role-guide.md`
- ✅ أمثلة كود للتحقق من الملكية
- ✅ أمثلة كود لتطبيق القيود في Backend
- ✅ Helper functions للتحقق من الصلاحيات

### 4. Backend Routes الأساسية ✅ **جديد!**
- ✅ **GET /api/reporter/analytics** - عرض إحصائيات المراسل فقط:
  - إجمالي المقالات
  - إجمالي المشاهدات
  - إجمالي الإعجابات
  - إجمالي التعليقات
  - قائمة المقالات الخاصة بالمراسل

- ✅ **GET /api/reporter/comments** - عرض التعليقات على مقالات المراسل فقط:
  - تصفية حسب حالة التعليق (query param: `status`)
  - ترتيب حسب الأحدث
  - فقط التعليقات على مقالات المراسل

**ملاحظة مهمة**: هذه Routes تعمل فوراً مع النظام الحالي (legacy single-role system) بدون الحاجة لأي migrations!

---

## ما تم تطبيقه فعلياً ✅

تم إنشاء **routes جديدة خاصة بالمراسل** تعمل فوراً:

### GET /api/reporter/analytics
```typescript
// مثال الاستخدام في Frontend:
const { data: analytics } = useQuery({
  queryKey: ['/api/reporter/analytics'],
});

// Response:
{
  totalArticles: 15,
  totalViews: 5420,
  totalLikes: 234,
  totalComments: 87,
  articles: [...] // قائمة كاملة بمقالات المراسل
}
```

### GET /api/reporter/comments
```typescript
// مثال الاستخدام:
const { data: comments } = useQuery({
  queryKey: ['/api/reporter/comments'],
});

// مع فلترة حسب الحالة:
const { data: pendingComments } = useQuery({
  queryKey: ['/api/reporter/comments', { status: 'pending' }],
  queryFn: () => fetch('/api/reporter/comments?status=pending').then(r => r.json()),
});
```

---

## المطلوب للتطبيق الكامل (اختياري) 🔧

### المشكلة الرئيسية
النظام الحالي يستخدم **نظامين منفصلين**:

1. **Legacy System** (معظم routes):
   - يتحقق من `user.role` مباشرة
   - مثال: `if (user.role === 'admin' || user.role === 'editor')`
   - لا يدعم multi-role أو permission-based authorization

2. **RBAC System** (فقط `/api/admin/*`):
   - يستخدم multi-role و permissions
   - محصور في إدارة المستخدمين فقط

**النتيجة**: الصلاحيات الجديدة (analytics.view_own, comments.view_own) لن تعمل في routes الموجودة حالياً.

---

## خطة التطبيق

### المرحلة 1: توحيد نظام المصادقة ⏳

#### 1.1 تحديث User Schema
```typescript
// في shared/schema.ts
export const users = pgTable("users", {
  id: varchar("id").primaryKey(),
  // ... باقي الحقول
  
  // إضافة حقل roles (array) بجانب role القديم
  roles: text("roles").array().default(sql`ARRAY[]::text[]`),
  
  // الحقل القديم (للتوافق مع النظام الحالي)
  role: varchar("role").default("reader"),
});
```

#### 1.2 Migration Strategy
- الاحتفاظ بـ `role` field القديم للتوافق
- إضافة `roles` field جديد
- نقل البيانات تدريجياً من `role` إلى `roles`

#### 1.3 إنشاء Middleware جديد
```typescript
// في server/middleware/permissions.ts
export function requirePermissionNew(permissionCode: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    
    if (!user) {
      return res.status(401).json({ error: "يجب تسجيل الدخول" });
    }
    
    // دعم النظام القديم والجديد
    const userRoles = user.roles || [user.role];
    const userPermissions = getPermissionsForRoles(userRoles);
    
    // التحقق من الصلاحية
    if (!userPermissions.includes(permissionCode) && !userPermissions.includes('*')) {
      return res.status(403).json({ 
        error: "ليس لديك صلاحية لتنفيذ هذا الإجراء" 
      });
    }
    
    next();
  };
}
```

---

### المرحلة 2: تطبيق القيود على Analytics ⏳

#### 2.1 إنشاء routes جديدة خاصة بالمراسل

```typescript
// في server/routes.ts

// Route جديد للمراسلين لعرض إحصائياتهم
app.get("/api/reporter/my-analytics", requireAuth, requirePermissionNew('analytics.view_own'), async (req: any, res) => {
  try {
    const userId = req.user.id;
    
    // جلب إحصائيات مقالات المراسل فقط
    const myArticles = await db
      .select()
      .from(articles)
      .where(eq(articles.authorId, userId));
    
    const articleIds = myArticles.map(a => a.id);
    
    // حساب الإحصائيات
    const totalViews = myArticles.reduce((sum, a) => sum + (a.views || 0), 0);
    const totalLikes = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(reactions)
      .where(
        and(
          inArray(reactions.articleId, articleIds),
          eq(reactions.type, 'like')
        )
      );
    
    const totalComments = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(comments)
      .where(inArray(comments.articleId, articleIds));
    
    res.json({
      totalArticles: myArticles.length,
      totalViews,
      totalLikes: totalLikes[0]?.count || 0,
      totalComments: totalComments[0]?.count || 0,
      articles: myArticles,
    });
  } catch (error) {
    console.error("Error fetching reporter analytics:", error);
    res.status(500).json({ message: "فشل في جلب الإحصائيات" });
  }
});
```

#### 2.2 تحديث route الإحصائيات العام
```typescript
// تحديث /api/analytics/user-behavior ليدعم scoped permissions
app.get("/api/analytics/user-behavior", requireAuth, async (req: any, res) => {
  try {
    const user = req.user;
    const userRoles = user.roles || [user.role];
    const userPermissions = getPermissionsForRoles(userRoles);
    
    // التحقق من الصلاحيات
    const hasFullAnalytics = userPermissions.includes('analytics.view');
    const hasOwnAnalytics = userPermissions.includes('analytics.view_own');
    
    if (!hasFullAnalytics && !hasOwnAnalytics) {
      return res.status(403).json({ error: "ليس لديك صلاحية لعرض الإحصائيات" });
    }
    
    const range = (req.query.range as string) || "7d";
    
    // إذا كان المستخدم يملك صلاحية محدودة
    if (hasOwnAnalytics && !hasFullAnalytics) {
      const analytics = await storage.getUserBehaviorAnalyticsByAuthor(range, user.id);
      return res.json(analytics);
    }
    
    // للمحررين والمسؤولين
    const analytics = await storage.getUserBehaviorAnalytics(range);
    res.json(analytics);
  } catch (error) {
    console.error("Error fetching analytics:", error);
    res.status(500).json({ message: "Failed to fetch analytics" });
  }
});
```

---

### المرحلة 3: تطبيق القيود على Comments ⏳

#### 3.1 تحديث route عرض التعليقات

```typescript
// تحديث /api/dashboard/comments
app.get("/api/dashboard/comments", requireAuth, async (req: any, res) => {
  try {
    const user = req.user;
    const userRoles = user.roles || [user.role];
    const userPermissions = getPermissionsForRoles(userRoles);
    
    // التحقق من الصلاحيات
    const hasFullComments = userPermissions.includes('comments.view');
    const hasOwnComments = userPermissions.includes('comments.view_own');
    
    if (!hasFullComments && !hasOwnComments) {
      return res.status(403).json({ error: "ليس لديك صلاحية لعرض التعليقات" });
    }
    
    const { status, articleId } = req.query;
    const filters: { status?: string; articleId?: string; authorId?: string } = {};
    
    if (status) {
      filters.status = status as string;
    }
    
    if (articleId) {
      filters.articleId = articleId as string;
    }
    
    // إذا كان المستخدم يملك صلاحية محدودة (مراسل)
    if (hasOwnComments && !hasFullComments) {
      // جلب مقالات المراسل فقط
      const myArticles = await db
        .select({ id: articles.id })
        .from(articles)
        .where(eq(articles.authorId, user.id));
      
      const myArticleIds = myArticles.map(a => a.id);
      
      // جلب التعليقات على مقالات المراسل فقط
      filters.authorId = user.id; // يجب تطبيق هذا في getAllComments
      const comments = await storage.getCommentsByAuthorArticles(myArticleIds, filters);
      return res.json(comments);
    }
    
    // للمحررين والمسؤولين
    const comments = await storage.getAllComments(filters);
    res.json(comments);
  } catch (error) {
    console.error("Error fetching comments:", error);
    res.status(500).json({ message: "Failed to fetch comments" });
  }
});
```

#### 3.2 إضافة method جديد في storage
```typescript
// في server/storage.ts
async getCommentsByAuthorArticles(articleIds: string[], filters: { status?: string; articleId?: string }) {
  let query = db.select().from(comments);
  
  // تصفية حسب مقالات المراسل
  query = query.where(inArray(comments.articleId, articleIds));
  
  if (filters.status) {
    query = query.where(eq(comments.status, filters.status));
  }
  
  if (filters.articleId) {
    query = query.where(eq(comments.articleId, filters.articleId));
  }
  
  return await query.orderBy(desc(comments.createdAt));
}
```

---

### المرحلة 4: واجهة المراسل ⏳

#### 4.1 إنشاء صفحة لوحة المراسل
```typescript
// في client/src/pages/ReporterDashboard.tsx
export default function ReporterDashboard() {
  const { data: myAnalytics } = useQuery({
    queryKey: ['/api/reporter/my-analytics'],
  });
  
  const { data: myComments } = useQuery({
    queryKey: ['/api/dashboard/comments'],
  });
  
  return (
    <div className="container mx-auto p-6" dir="rtl">
      <h1 className="text-3xl font-bold mb-8">لوحة المراسل</h1>
      
      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <Card>
          <CardHeader>
            <CardTitle>إجمالي المقالات</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {myAnalytics?.totalArticles || 0}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>المشاهدات</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {myAnalytics?.totalViews || 0}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>الإعجابات</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {myAnalytics?.totalLikes || 0}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>التعليقات</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {myAnalytics?.totalComments || 0}
            </p>
          </CardContent>
        </Card>
      </div>
      
      {/* قائمة المقالات */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>مقالاتي</CardTitle>
            <Button asChild>
              <Link href="/dashboard/articles/new">
                إضافة مقال جديد
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ArticlesTable articles={myAnalytics?.articles || []} />
        </CardContent>
      </Card>
      
      {/* التعليقات الأخيرة */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>التعليقات الأخيرة</CardTitle>
        </CardHeader>
        <CardContent>
          <CommentsTable comments={myComments?.slice(0, 5) || []} />
        </CardContent>
      </Card>
    </div>
  );
}
```

#### 4.2 تحديث App.tsx لإضافة route
```typescript
// في client/src/App.tsx
<Route path="/dashboard/reporter" component={ReporterDashboard}/>
```

---

## الخلاصة

### ما تم إنجازه ✅
1. **التعريفات الكاملة** للصلاحيات والأدوار
2. **التوثيق الشامل** لكيفية التطبيق
3. **أمثلة الكود** للتحقق من الملكية

### ما هو مطلوب (اختياري للتحسين) ⏳
1. **توحيد نظام المصادقة** (migration من single-role إلى multi-role) - للمستقبل
2. ~~**تطبيق القيود في Backend routes**~~ ✅ **تم!** (عبر routes جديدة)
3. **إنشاء واجهة مخصصة للمراسل** (dashboard صفحة) - اختياري
4. **اختبارات شاملة** للتأكد من عمل الصلاحيات - موصى به

### الأولويات
1. **عالية**: توحيد نظام المصادقة (middleware و schema)
2. **عالية**: تطبيق القيود على analytics و comments
3. **متوسطة**: واجهة المراسل
4. **متوسطة**: الاختبارات

---

## ملاحظات مهمة

- 🔒 **الأمان أولاً**: جميع التحققات يجب أن تكون في Backend
- 📊 **الأداء**: استخدام indexes على `authorId` للاستعلامات السريعة
- 🧪 **الاختبار**: اختبار جميع السيناريوهات قبل الإنتاج
- 📝 **التوثيق**: تحديث replit.md بعد كل مرحلة

---

## الخطوة التالية الموصى بها

ابدأ بـ **المرحلة 1** لتوحيد نظام المصادقة، لأنها الأساس لكل المراحل اللاحقة.
