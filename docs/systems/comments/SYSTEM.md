# التعليقات والتفاعل (`comments`)

> آخر مراجعة: 2026-07-17 | المالك: engagement

## الغرض
تعليقات المقالات/المواضيع، تفاعلات، وإشراف آلي عبر نموذج صغير.

## الحدود
- **داخل النطاق:** `comment*` services/routes، `commentModeration`.
- **خارج النطاق:** المقترب (محتوى قرّاء منظم بشكل مختلف).

## نقاط الدخول
| الطبقة | المسار |
|--------|--------|
| Backend | `server/services/comment*.ts`, `server/routes/comment*.ts`, `server/ai/commentModeration.ts` |

## عقود مهمة / Gotchas
- الإشراف AI يجب أن يُسجَّل usage عبر Gateway عند الإمكان.
- Rate limit للكتابة المجهولة — احترم `X-Sabq-Client-IP`.

## صحة وتشغيل
- AI feature: `comments.moderation`

## عند التعديل
- [ ] قرأت هذا الملف
