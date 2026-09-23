import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { requireAuth, requirePermission } from '../rbac';
import { loadSummaryAudioSettings, saveSummaryAudioSettings, summaryAudioCatalog, summaryAudioSettingsSchema } from '../services/summaryAudioSettings';
import { previewSummaryVoice } from '../services/summaryAudioService';

const router = Router();
const path = '/api/system/summary-audio-settings';
router.use(path, requireAuth, requirePermission('system.manage_settings'), (_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store'); next();
});
router.get(path, async (_req, res) => {
  try { res.json({ settings: await loadSummaryAudioSettings(), ...summaryAudioCatalog() }); }
  catch { res.status(500).json({ message: 'تعذّر تحميل إعدادات الصوت' }); }
});
router.put(path, async (req, res) => {
  const parsed = summaryAudioSettingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'إعدادات الصوت غير صالحة' });
  try { res.json({ settings: await saveSummaryAudioSettings(parsed.data), ...summaryAudioCatalog() }); }
  catch { res.status(500).json({ message: 'تعذّر حفظ إعدادات الصوت' }); }
});
const previewLimit = rateLimit({ windowMs: 60_000, limit: 6, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { message: 'انتظر دقيقة قبل توليد عينات إضافية' } });
const previewSchema = z.object({ provider: z.enum(['humain', 'elevenlabs']), voiceId: z.string() }).strict();
router.post(`${path}/preview`, previewLimit, async (req, res) => {
  const parsed = previewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'اختر صوتاً صالحاً' });
  const catalog = summaryAudioCatalog();
  const { provider, voiceId } = parsed.data;
  const voices = provider === 'humain' ? catalog.humainVoices : catalog.elevenlabsVoices;
  if (!voices.some(v => v.id === voiceId)) return res.status(400).json({ message: 'الصوت لا يتبع المزود المحدد' });
  if (!catalog.configured[provider]) return res.status(503).json({ message: 'مفتاح المزود غير مضاف في الخادم' });
  try {
    const audio = await previewSummaryVoice(provider, voiceId);
    res.setHeader('Content-Type', audio.contentType);
    res.setHeader('X-TTS-Provider', audio.provider);
    res.send(audio.buffer);
  } catch { res.status(503).json({ message: 'تعذّرت معاينة الصوت المحدد. تحقّق من المزود ورصيده ثم أعد المحاولة.' }); }
});
export default router;
