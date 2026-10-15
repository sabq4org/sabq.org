import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { requireAuth, requirePermission } from '../rbac';
import { cfKeyGenerator, cfValidate } from '../utils/rateLimiting';
import {
  approveBulletinDraft,
  articleTitles,
  BulletinConflictError,
  bulletinAdminView,
  cloneCurrentToDraft,
  createBulletinDraft,
  discardBulletinDraft,
  draftEditSchema,
  hideCurrentBulletin,
  loadBulletinState,
  loadCandidates,
  publicBulletin,
  setBulletinSchedule,
  updateBulletinDraft,
} from '../services/audioBulletinService';

const router = Router();

/** Public: the bulletin shown under the header, or null when none is recent. */
router.get('/api/audio-bulletin/current', async (_req, res) => {
  try {
    const bulletin = publicBulletin(await loadBulletinState());
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=120');
    res.json({ bulletin });
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    res.status(500).json({ bulletin: null });
  }
});

const admin = '/api/audio-bulletin/admin';
router.use(admin, (_req, res, next) => { res.setHeader('Cache-Control', 'private, no-store'); next(); },
  requireAuth, requirePermission('articles.publish'));

function actorId(req: { user?: unknown }): string {
  const user = req.user as { id?: unknown } | undefined;
  return typeof user?.id === 'string' ? user.id : '';
}

function fail(res: import('express').Response, error: unknown, fallback: string) {
  const status = error instanceof BulletinConflictError ? 409 : 400;
  res.status(status).json({ message: error instanceof Error && /[؀-ۿ]/.test(error.message) ? error.message : fallback });
}

async function adminPayload() {
  const view = bulletinAdminView(await loadBulletinState());
  const ids = [
    ...new Set([
      ...(view.draft?.items ?? []).flatMap(item => item.articleIds),
      ...(view.current?.items ?? []).flatMap(item => item.articleIds),
    ]),
  ];
  const [titles, rawCandidates] = await Promise.all([
    articleTitles(ids),
    loadCandidates(new Date(), 15).catch(() => []),
  ]);
  const candidates = rawCandidates.map(({ id, title, href, category, newsType, views, isFeatured, publishedAt }) => ({
    id,
    title,
    href,
    category,
    newsType,
    views,
    isFeatured,
    publishedAt,
  }));
  return { ...view, sourceTitles: Object.fromEntries(titles), candidates };
}

router.get(admin, async (_req, res) => {
  try { res.json(await adminPayload()); }
  catch { res.status(500).json({ message: 'تعذّر تحميل النشرة' }); }
});

const draftLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  message: { message: 'تجاوزت حد إنشاء المسودات؛ حاول بعد دقائق' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String((req.user as { id?: string } | undefined)?.id || cfKeyGenerator(req)),
  validate: cfValidate,
});

const createDraftOptionsSchema = z.object({
  articleIds: z.array(z.string().min(1).max(64)).max(15).optional(),
  title: z.string().trim().min(3).max(80).optional(),
}).strict().optional();

router.post(`${admin}/draft`, draftLimiter, async (req, res) => {
  const parsed = createDraftOptionsSchema.safeParse(req.body && Object.keys(req.body).length > 0 ? req.body : undefined);
  if (!parsed.success) return res.status(400).json({ message: 'خيارات إنشاء المسودة غير صالحة' });
  try { await createBulletinDraft(actorId(req), new Date(), parsed.data); res.json(await adminPayload()); }
  catch (error) { fail(res, error, 'تعذّر كتابة مسودة النشرة'); }
});

router.post(`${admin}/draft/from-current`, async (req, res) => {
  try { await cloneCurrentToDraft(actorId(req)); res.json(await adminPayload()); }
  catch (error) { fail(res, error, 'تعذّر نسخ النشرة الحالية كمسودة'); }
});

router.put(`${admin}/draft`, async (req, res) => {
  const parsed = draftEditSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'نص النشرة غير صالح' });
  try { await updateBulletinDraft(parsed.data, actorId(req)); res.json(await adminPayload()); }
  catch (error) { fail(res, error, 'تعذّر حفظ المسودة'); }
});

router.delete(`${admin}/draft`, async (req, res) => {
  try { await discardBulletinDraft(actorId(req)); res.json(await adminPayload()); }
  catch (error) { fail(res, error, 'تعذّر حذف المسودة'); }
});

const approveSchema = z.object({ revision: z.number().int().positive() }).strict();
router.post(`${admin}/draft/approve`, async (req, res) => {
  const parsed = approveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'طلب اعتماد غير صالح' });
  try { await approveBulletinDraft(parsed.data.revision, actorId(req)); res.json(await adminPayload()); }
  catch (error) { fail(res, error, 'تعذّر اعتماد النشرة'); }
});

router.post(`${admin}/hide`, async (req, res) => {
  try { await hideCurrentBulletin(actorId(req)); res.json(await adminPayload()); }
  catch (error) { fail(res, error, 'تعذّر إخفاء النشرة'); }
});

const scheduleSchema = z.object({ enabled: z.boolean() }).strict();
router.put(`${admin}/schedule`, requirePermission('system.manage_settings'), async (req, res) => {
  const parsed = scheduleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'قيمة غير صالحة' });
  try { await setBulletinSchedule(parsed.data.enabled); res.json(await adminPayload()); }
  catch (error) { fail(res, error, 'تعذّر حفظ الجدولة'); }
});

export default router;
