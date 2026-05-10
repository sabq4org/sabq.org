# دليل دور المراسل (Reporter Role)

## نظرة عامة

دور **المراسل** هو دور تحريري محدود مصمم للصحفيين الميدانيين الذين يقومون بإنشاء المحتوى دون صلاحيات النشر أو الإدارة.

## الصلاحيات

### ✅ ما يستطيع المراسل فعله:

1. **إدارة المحتوى الخاص**
   - إنشاء مقالات جديدة (`articles.create`)
   - تعديل مقالاته الخاصة فقط (`articles.edit_own`)
   - عرض جميع المقالات (`articles.view`)

2. **إدارة الوسائط**
   - عرض الوسائط (`media.view`)
   - رفع صور ومقاطع فيديو (`media.upload`)

3. **متابعة التفاعل**
   - عرض التعليقات على مقالاته (`comments.view_own`)
   - عرض إحصائيات مقالاته فقط (`analytics.view_own`)

### ❌ ما لا يستطيع المراسل فعله:

- **نشر المقالات** - يجب أن يوافق محرر أو مسؤول
- **حذف المقالات** - حتى مقالاته الخاصة
- **تعديل مقالات الآخرين**
- **إدارة المستخدمين** أو تغيير الأدوار
- **تعديل التصنيفات** أو الإعدادات
- **الموافقة على التعليقات** أو حذفها

---

## التطبيق في Backend

### 1. التحقق من الملكية (Ownership Check)

عند تعديل مقال، يجب التأكد من أن المراسل يحرر مقاله فقط:

```typescript
// في server/routes.ts
app.patch("/api/articles/:id", requireAuth, async (req, res) => {
  const user = req.user;
  const articleId = req.params.id;
  
  // جلب المقال من قاعدة البيانات
  const article = await storage.getArticleById(articleId);
  
  if (!article) {
    return res.status(404).json({ error: "المقال غير موجود" });
  }
  
  // التحقق من الصلاحيات
  const canEdit = 
    user.roles.includes('system_admin') ||
    user.roles.includes('admin') ||
    user.roles.includes('editor') ||
    (user.roles.includes('reporter') && article.authorId === user.id);
  
  if (!canEdit) {
    return res.status(403).json({ 
      error: "ليس لديك صلاحية لتعديل هذا المقال" 
    });
  }
  
  // تنفيذ التعديل
  const updated = await storage.updateArticle(articleId, req.body);
  res.json(updated);
});
```

### 2. تقييد النشر (Publish Restriction)

المراسل لا يستطيع نشر المقالات:

```typescript
// في server/routes.ts
app.post("/api/articles/:id/publish", requireAuth, requirePermission('articles.publish'), async (req, res) => {
  // هذا الـ route محمي بصلاحية articles.publish
  // المراسل لا يملكها، لذلك سيحصل على 403
  
  const articleId = req.params.id;
  await storage.publishArticle(articleId);
  
  res.json({ message: "تم نشر المقال بنجاح" });
});
```

### 3. تصفية البيانات حسب المالك (Owner Filtering)

عند جلب المقالات، المراسل يرى فقط مقالاته:

```typescript
// في server/routes.ts
app.get("/api/my-articles", requireAuth, async (req, res) => {
  const user = req.user;
  
  // إذا كان مراسل، جلب مقالاته فقط
  if (user.roles.includes('reporter') && 
      !user.roles.includes('editor') && 
      !user.roles.includes('admin')) {
    const articles = await storage.getArticlesByAuthor(user.id);
    return res.json(articles);
  }
  
  // للمحررين والمسؤولين، جلب كل المقالات
  const articles = await storage.getAllArticles();
  res.json(articles);
});
```

### 4. تقييد عرض الإحصائيات (Analytics Scoping)

المراسل يرى إحصائيات مقالاته فقط:

```typescript
// في server/routes.ts
app.get("/api/analytics", requireAuth, async (req, res) => {
  const user = req.user;
  
  // التحقق من الصلاحيات
  const hasFullAnalytics = user.permissions.includes('analytics.view');
  const hasOwnAnalytics = user.permissions.includes('analytics.view_own');
  
  if (!hasFullAnalytics && !hasOwnAnalytics) {
    return res.status(403).json({ error: "ليس لديك صلاحية لعرض الإحصائيات" });
  }
  
  // إذا كان المستخدم يملك صلاحية عرض إحصائياته فقط
  if (hasOwnAnalytics && !hasFullAnalytics) {
    const analytics = await storage.getAnalyticsByAuthor(user.id);
    return res.json(analytics);
  }
  
  // للمحررين والمسؤولين، عرض كل الإحصائيات
  const analytics = await storage.getAllAnalytics();
  res.json(analytics);
});
```

### 5. تقييد التعليقات (Comments Scoping)

المراسل يرى التعليقات على مقالاته فقط:

```typescript
// في server/routes.ts
app.get("/api/comments", requireAuth, requirePermission('comments.view'), async (req, res) => {
  const user = req.user;
  const { articleId } = req.query;
  
  // إذا تم تحديد مقال معين
  if (articleId) {
    const article = await storage.getArticleById(articleId as string);
    
    // التحقق من أن المراسل يطلع على تعليقات مقاله فقط
    if (user.roles.includes('reporter') && 
        !user.roles.includes('comments_moderator') &&
        article.authorId !== user.id) {
      return res.status(403).json({ 
        error: "يمكنك فقط عرض التعليقات على مقالاتك الخاصة" 
      });
    }
    
    const comments = await storage.getCommentsByArticle(articleId as string);
    return res.json(comments);
  }
  
  // إذا لم يحدد مقال، جلب التعليقات حسب الدور
  if (user.roles.includes('reporter')) {
    // جلب التعليقات على مقالات المراسل فقط
    const comments = await storage.getCommentsByAuthor(user.id);
    return res.json(comments);
  }
  
  // للمشرفين، جلب كل التعليقات
  const comments = await storage.getAllComments();
  res.json(comments);
});
```

---

## التطبيق في Frontend

### 1. إخفاء الأزرار حسب الصلاحيات

```typescript
// في client/src/components/ArticleActions.tsx
import { useUser } from '@/hooks/useUser';
import { hasPermission } from '@/lib/rbac-utils';

function ArticleActions({ article }: { article: Article }) {
  const { user } = useUser();
  
  const canEdit = 
    hasPermission(user, 'articles.edit_any') ||
    (hasPermission(user, 'articles.edit_own') && article.authorId === user.id);
  
  const canPublish = hasPermission(user, 'articles.publish');
  const canDelete = hasPermission(user, 'articles.delete');
  
  return (
    <div className="flex gap-2">
      {canEdit && (
        <Button onClick={() => editArticle(article.id)}>
          تعديل
        </Button>
      )}
      
      {canPublish && (
        <Button onClick={() => publishArticle(article.id)}>
          نشر
        </Button>
      )}
      
      {canDelete && (
        <Button variant="destructive" onClick={() => deleteArticle(article.id)}>
          حذف
        </Button>
      )}
    </div>
  );
}
```

### 2. واجهة مخصصة للمراسل

```typescript
// في client/src/pages/ReporterDashboard.tsx
import { useQuery } from '@tanstack/react-query';

export default function ReporterDashboard() {
  const { data: myArticles } = useQuery({
    queryKey: ['/api/my-articles'],
  });
  
  const { data: myAnalytics } = useQuery({
    queryKey: ['/api/analytics'],
  });
  
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">لوحة المراسل</h1>
      
      {/* مؤشرات الأداء */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>إجمالي المقالات</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl">{myArticles?.length || 0}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>المشاهدات</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl">{myAnalytics?.totalViews || 0}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>الإعجابات</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl">{myAnalytics?.totalLikes || 0}</p>
          </CardContent>
        </Card>
      </div>
      
      {/* قائمة المقالات */}
      <Card>
        <CardHeader>
          <CardTitle>مقالاتي</CardTitle>
        </CardHeader>
        <CardContent>
          <ArticlesList articles={myArticles} />
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## Helper Functions

### التحقق من الصلاحيات

```typescript
// في shared/rbac-utils.ts
import { User } from './schema';
import { getPermissionsForRoles } from './rbac-constants';

export function hasPermission(user: User, permissionCode: string): boolean {
  if (!user || !user.roles) return false;
  
  const userPermissions = getPermissionsForRoles(user.roles);
  
  // System admin لديه كل الصلاحيات
  if (userPermissions.includes('*')) return true;
  
  return userPermissions.includes(permissionCode);
}

export function canEditArticle(user: User, article: Article): boolean {
  if (!user) return false;
  
  return (
    hasPermission(user, 'articles.edit_any') ||
    (hasPermission(user, 'articles.edit_own') && article.authorId === user.id)
  );
}

export function canViewAnalytics(user: User, articleId?: string): boolean {
  if (!user) return false;
  
  // إذا لديه صلاحية عرض كل الإحصائيات
  if (hasPermission(user, 'analytics.view')) return true;
  
  // إذا لديه صلاحية عرض إحصائياته فقط
  if (hasPermission(user, 'analytics.view_own')) {
    // يجب التحقق من أن المقال له
    return true; // سيتم التحقق في Backend
  }
  
  return false;
}
```

---

## ملاحظات أمنية مهمة

### 1. التحقق المزدوج (Double Verification)

**دائماً** تحقق من الصلاحيات في:
- ✅ **Frontend** - لإخفاء الأزرار وتحسين تجربة المستخدم
- ✅ **Backend** - للأمان الفعلي (لا تثق بالـ frontend!)

### 2. استخدام Middleware

```typescript
// في server/middleware/permissions.ts
export function requirePermission(permissionCode: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    
    if (!user) {
      return res.status(401).json({ error: "يجب تسجيل الدخول" });
    }
    
    const userPermissions = getPermissionsForRoles(user.roles);
    
    if (!userPermissions.includes(permissionCode) && !userPermissions.includes('*')) {
      return res.status(403).json({ 
        error: "ليس لديك صلاحية لتنفيذ هذا الإجراء" 
      });
    }
    
    next();
  };
}
```

### 3. SQL Injection Prevention

عند التصفية حسب المالك، استخدم parameterized queries:

```typescript
// ✅ آمن
const articles = await db
  .select()
  .from(articlesTable)
  .where(eq(articlesTable.authorId, userId));

// ❌ غير آمن
const articles = await db.execute(`
  SELECT * FROM articles WHERE author_id = '${userId}'
`);
```

---

## الخلاصة

دور المراسل مصمم ليكون:
- **محدود**: لا يستطيع النشر أو الحذف أو الإدارة
- **مركّز**: يعمل فقط على محتواه الخاص
- **شفاف**: يرى أداء مقالاته وتفاعل القراء
- **آمن**: جميع القيود مطبقة في Backend

هذا التصميم يضمن توزيع المهام بكفاءة مع الحفاظ على سلامة المحتوى وأمان النظام.
