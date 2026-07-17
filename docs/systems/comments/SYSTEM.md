# التعليقات والتفاعل (`comments`)

> آخر مراجعة: 2026-07-17 | المالك: engagement

## الغرض
تعليقات المقالات/المواضيع، تفاعلات، إشراف آلي، وتحليل مشاعر التعليقات.

## مفاتيح AI (حصرية)
`comment-moderation`, `sentiment-analysis`

## نقاط الدخول
`server/ai/commentModeration.ts`, `server/sentiment-analyzer.ts`, مسارات comment*, لوحات `/dashboard/ai-moderation` و`/dashboard/sentiment-*`

## عقود مهمة
- المفتاح الحقيقي هو `comment-moderation` (وليس `comments.moderation`).
- Rate limit للكتابة المجهولة — احترم `X-Sabq-Client-IP`.

## عند التعديل
- [ ] قرأت هذا الملف
