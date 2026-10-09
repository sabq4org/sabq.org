/**
 * «نشرة سَبْق» الصوتية: جولة مسموعة لأهم الأخبار المنشورة.
 *
 * المسار: اختيار الأخبار ← نص يكتبه النموذج ← مراجعة المحرر واعتماده ← توليد الصوت
 * مرة واحدة ← رفعه إلى R2 ← ظهور الشريط تحت الهيدر. لا شيء يُسمع قبل اعتماد محرر.
 *
 * الحالة كلها في إعداد نظام واحد (`audio_bulletin_state`): مسودة واحدة، النشرة
 * الحالية، وسجل مختصر. لا جداول جديدة؛ الملف الصوتي نفسه في R2.
 */
import { randomUUID } from 'node:crypto';
import { and, desc, eq, gte, inArray, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import { articles, categories } from '@shared/schema';
import { db } from '../db';
import { aiGateway } from '../ai/gateway';
import { SABQ_FALLBACK_EDITOR_MODEL, SABQ_PRIMARY_EDITOR_MODEL } from '../ai/sabqEditorialPrompt';
import { storage } from '../storage';
import { isBulletinStorageConfigured, synthesizeBulletin, uploadBulletinAudio } from './audioBulletinAudio';

export const AUDIO_BULLETIN_STATE_KEY = 'audio_bulletin_state';
/** A bulletin older than this disappears from the site instead of playing stale news. */
export const BULLETIN_MAX_AGE_MS = 6 * 60 * 60 * 1000;
/** Fixed opening and closing, read by the code, not written by the model. سَبْق is vowelled on purpose. */
export const BULLETIN_INTRO = 'مرحباً بكم في نشرة سَبْق، نأخذكم في جولة سريعة لأهم الأخبار.';
export const BULLETIN_OUTRO = 'كانت هذه أبرز الأخبار، والتفاصيل كاملة على سَبْق دوت أورغ. شكراً لاستماعكم.';
/** Scheduled editions in Riyadh time. */
export const BULLETIN_SLOTS = [7, 13, 21] as const;

export type BulletinStatus = 'draft' | 'generating' | 'failed' | 'published';

export interface BulletinItem {
  id: string;
  articleIds: string[];
  /** Article path on sabq.org for the first source story. */
  href: string | null;
  /** Short label shown in the player while this item plays. */
  label: string;
  text: string;
}

export interface BulletinChapter {
  start: number;
  label: string;
  href: string | null;
}

export interface Bulletin {
  id: string;
  title: string;
  status: BulletinStatus;
  revision: number;
  items: BulletinItem[];
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
  updatedBy: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  publishedAt: string | null;
  error: string | null;
  audio: {
    url: string;
    contentType: string;
    durationSec: number;
    bytes: number;
    provider: string;
    chapters: BulletinChapter[];
  } | null;
}

export interface BulletinState {
  version: 1;
  scheduleEnabled: boolean;
  /** `YYYY-MM-DD@H` of the last scheduled slot that produced a draft, so a slot fires once. */
  lastScheduledSlot: string | null;
  draft: Bulletin | null;
  current: Bulletin | null;
  history: Array<Pick<Bulletin, 'id' | 'title' | 'publishedAt' | 'approvedBy'> & { durationSec: number; provider: string; hiddenAt?: string }>;
}

const EMPTY_STATE: BulletinState = { version: 1, scheduleEnabled: false, lastScheduledSlot: null, draft: null, current: null, history: [] };

function stripMarkup(value: string | null | undefined): string {
  return (value || '').replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|amp|lt|gt|quot|#39);/gi, ' ').replace(/\s+/g, ' ').trim();
}

/** The model may name the paper; it must be read سَبْق, never سَبَق. */
export function vowelSabq(text: string): string {
  return text
    .replace(/(نشرة|صحيفة|موقع|تطبيق)\s+سبق(?=[\s،.,:؛!؟]|$)/g, '$1 سَبْق')
    .replace(/(^|[\s«"(])سبق(?=\s+دوت)/g, '$1سَبْق');
}

export function riyadhClock(now: Date): { date: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value || '0';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')), minute: Number(get('minute')) };
}

export function editionTitle(now: Date): string {
  const { hour } = riyadhClock(now);
  if (hour >= 4 && hour < 11) return 'نشرة الصباح';
  if (hour >= 11 && hour < 17) return 'نشرة الظهيرة';
  return 'نشرة المساء';
}

/** The scheduled slot due now (within its first 20 minutes), or null. */
export function dueSlot(now: Date): string | null {
  const { date, hour, minute } = riyadhClock(now);
  return (BULLETIN_SLOTS as readonly number[]).includes(hour) && minute < 20 ? `${date}@${hour}` : null;
}

export function bulletinParagraphs(items: BulletinItem[]): string[] {
  return [BULLETIN_INTRO, ...items.map(item => vowelSabq(item.text)), BULLETIN_OUTRO];
}

export function bulletinChapters(items: BulletinItem[], starts: number[]): BulletinChapter[] {
  const labels: Array<{ label: string; href: string | null }> = [
    { label: 'الترحيب', href: null },
    ...items.map(item => ({ label: item.label, href: item.href })),
    { label: 'الختام', href: null },
  ];
  if (starts.length !== labels.length) throw new Error('BULLETIN_CHAPTER_MISMATCH');
  return labels.map((entry, index) => ({ ...entry, start: Math.round(starts[index] * 10) / 10 }));
}

/** A published bulletin is shown only while it is recent. */
export function publicBulletin(state: BulletinState, now = Date.now()) {
  const current = state.current;
  if (!current?.audio || !current.publishedAt) return null;
  if (now - Date.parse(current.publishedAt) > BULLETIN_MAX_AGE_MS) return null;
  return {
    id: current.id,
    title: current.title,
    publishedAt: current.publishedAt,
    audioUrl: current.audio.url,
    durationSec: current.audio.durationSec,
    chapters: current.audio.chapters,
  };
}

// ── state ────────────────────────────────────────────────────────────────

export async function loadBulletinState(): Promise<BulletinState> {
  const stored = await storage.getSystemSetting(AUDIO_BULLETIN_STATE_KEY);
  if (!stored || typeof stored !== 'object' || stored.version !== 1) return { ...EMPTY_STATE };
  return { ...EMPTY_STATE, ...stored } as BulletinState;
}

async function saveBulletinState(state: BulletinState): Promise<void> {
  await storage.upsertSystemSetting(AUDIO_BULLETIN_STATE_KEY, state, 'audio', false);
}

// Writes are serialized inside this process; the job runs on the leader only.
let queue: Promise<unknown> = Promise.resolve();
function mutate<T>(change: (state: BulletinState) => T | Promise<T>): Promise<T> {
  const next = queue.then(async () => {
    const state = await loadBulletinState();
    const result = await change(state);
    await saveBulletinState(state);
    return result;
  });
  queue = next.catch(() => undefined);
  return next;
}

// ── story selection ─────────────────────────────────────────────────────

export interface CandidateStory {
  id: string;
  title: string;
  href: string;
  category: string | null;
  newsType: string;
  views: number;
  isFeatured: boolean;
  publishedAt: Date | null;
  body: string;
}

/** Breaking first, then featured, then most read; ties go to the newest. */
export function rankCandidates(rows: CandidateStory[]): CandidateStory[] {
  const weight = (r: CandidateStory) => (r.newsType === 'breaking' ? 2 : 0) + (r.isFeatured || r.newsType === 'featured' ? 1 : 0);
  return [...rows].sort((a, b) => weight(b) - weight(a) || b.views - a.views
    || (b.publishedAt?.getTime() || 0) - (a.publishedAt?.getTime() || 0));
}

async function loadCandidates(now: Date): Promise<CandidateStory[]> {
  const query = (hours: number) => db.select({
    id: articles.id,
    title: articles.title,
    slug: articles.slug,
    englishSlug: articles.englishSlug,
    excerpt: articles.excerpt,
    content: articles.content,
    newsType: articles.newsType,
    views: articles.views,
    isFeatured: articles.isFeatured,
    publishedAt: articles.publishedAt,
    category: categories.nameAr,
  }).from(articles)
    .leftJoin(categories, eq(articles.categoryId, categories.id))
    .where(and(
      eq(articles.status, 'published'),
      eq(articles.articleType, 'news'),
      eq(articles.hideFromHomepage, false),
      isNotNull(articles.publishedAt),
      gte(articles.publishedAt, new Date(now.getTime() - hours * 3600_000)),
    ))
    .orderBy(desc(articles.publishedAt))
    .limit(60);
  let rows = await query(6);
  if (rows.length < 6) rows = await query(12);
  return rankCandidates(rows.map(r => ({
    id: r.id,
    title: stripMarkup(r.title),
    href: `/article/${r.englishSlug || r.slug}`,
    category: r.category,
    newsType: r.newsType,
    views: r.views,
    isFeatured: r.isFeatured,
    publishedAt: r.publishedAt,
    body: stripMarkup(r.content).slice(0, 1800) || stripMarkup(r.excerpt),
  }))).slice(0, 10);
}

// ── script ──────────────────────────────────────────────────────────────

const SCRIPT_INSTRUCTION = `أنت محرر النشرة الصوتية في صحيفة سبق. تكتب ما يقرؤه المذيع بعد الترحيب مباشرة، بالعربية الفصحى السهلة.
- اختر من 5 إلى 8 أخبار من المواد المرفقة حسب الأهمية: الأمن الوطني والشأن السعودي أولاً، ثم الدولي، ثم الاقتصاد، ثم الرياضة، ثم المحلي.
- ادمج الأخبار المتصلة بالحدث نفسه في فقرة واحدة واذكر كل معرّفاتها.
- كل فقرة موجز قصير: جملة واحدة أو جملتان، بين 20 و40 كلمة، تقول الخبر الأساسي فقط (من، ماذا، أين) بلا خلفية ولا تفاصيل ثانوية ولا اقتباسات طويلة. ابدأ كل فقرة بعد الأولى بانتقال قصير طبيعي مثل «وفي الشأن الاقتصادي،».
- لا تضف أي معلومة أو رقم أو اسم أو تاريخ غير موجود في المواد. لا آراء ولا تعليق.
- اكتب الأرقام بالكلمات كما تُنطق (مئة وستة وثلاثون هدفاً، واحد وثلاثة أعشار بالمئة).
- لا ترحيب ولا ختام؛ يضيفهما النظام. بلا عناوين أو رموز أو تنسيق.
- إذا ذكرت الصحيفة فاكتبها «سَبْق» مشكولة.
- مجموع الفقرات بين 180 و280 كلمة. إن طالت فاحذف تفاصيل لا أخباراً.
- لكل فقرة عنوان قصير للمشغّل لا يتجاوز 60 حرفاً.
أعد JSON فقط بالشكل: {"items":[{"articleIds":["..."],"label":"...","text":"..."}]}`;

const generatedSchema = z.object({
  items: z.array(z.object({
    articleIds: z.array(z.string()).min(1).max(6),
    label: z.string().min(2).max(120),
    text: z.string().min(20).max(1600),
  })).min(1).max(10),
});

export function parseScript(raw: string, candidates: CandidateStory[]): BulletinItem[] {
  const json = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  const start = json.indexOf('{');
  const parsed = generatedSchema.parse(JSON.parse(start > 0 ? json.slice(start) : json));
  const byId = new Map(candidates.map(c => [c.id, c]));
  const items = parsed.items
    .map(item => ({ ...item, articleIds: item.articleIds.filter(id => byId.has(id)) }))
    .filter(item => item.articleIds.length > 0)
    .map(item => ({
      id: randomUUID(),
      articleIds: item.articleIds,
      href: byId.get(item.articleIds[0])?.href ?? null,
      label: stripMarkup(item.label).slice(0, 60),
      text: stripMarkup(item.text),
    }));
  if (items.length < 3) throw new Error('BULLETIN_SCRIPT_TOO_SHORT');
  return items;
}

async function writeScript(candidates: CandidateStory[], userId: string | null): Promise<BulletinItem[]> {
  const material = candidates.map(c => [
    `ID: ${c.id}`,
    `القسم: ${c.category || '—'}${c.newsType === 'breaking' ? ' (عاجل)' : ''}`,
    `العنوان: ${c.title}`,
    `النص: ${c.body}`,
  ].join('\n')).join('\n\n---\n\n');
  const call = (modelId: string) => aiGateway.complete({
    feature: 'audio-bulletin-script',
    userId: userId ?? undefined,
    model: { provider: modelId.startsWith('claude') ? 'anthropic' : 'openai', modelId },
    messages: [{ role: 'system', content: SCRIPT_INSTRUCTION }, { role: 'user', content: material }],
    // No temperature: newer Claude models reject it.
    options: { maxTokens: 6000, jsonMode: true },
  });
  try {
    return parseScript((await call(SABQ_PRIMARY_EDITOR_MODEL)).content, candidates);
  } catch (error) {
    console.warn(`[AudioBulletin] primary script model failed: ${error instanceof Error ? error.message : 'unknown'}`);
    return parseScript((await call(SABQ_FALLBACK_EDITOR_MODEL)).content, candidates);
  }
}

// ── operations ──────────────────────────────────────────────────────────

export class BulletinConflictError extends Error {}

export async function createBulletinDraft(userId: string | null, now = new Date()): Promise<Bulletin> {
  const existing = (await loadBulletinState()).draft;
  if (existing?.status === 'generating') throw new BulletinConflictError('النشرة الحالية قيد التوليد الصوتي؛ انتظر حتى تنتهي');
  const candidates = await loadCandidates(now);
  if (candidates.length < 3) throw new Error('لا توجد أخبار منشورة كافية في الساعات الأخيرة');
  const items = await writeScript(candidates, userId);
  const iso = now.toISOString();
  const draft: Bulletin = {
    id: randomUUID(), title: editionTitle(now), status: 'draft', revision: 1, items,
    createdAt: iso, createdBy: userId, updatedAt: iso, updatedBy: userId,
    approvedAt: null, approvedBy: null, publishedAt: null, error: null, audio: null,
  };
  return mutate(state => {
    if (state.draft?.status === 'generating') throw new BulletinConflictError('النشرة الحالية قيد التوليد الصوتي؛ انتظر حتى تنتهي');
    state.draft = draft;
    return draft;
  });
}

export const draftEditSchema = z.object({
  revision: z.number().int().positive(),
  title: z.string().trim().min(2).max(80),
  items: z.array(z.object({
    id: z.string(),
    label: z.string().trim().min(2).max(60),
    text: z.string().trim().min(20).max(1600),
  })).min(1).max(10),
}).strict();

export async function updateBulletinDraft(input: z.infer<typeof draftEditSchema>, userId: string): Promise<Bulletin> {
  return mutate(state => {
    const draft = state.draft;
    if (!draft || draft.status === 'generating') throw new BulletinConflictError('لا توجد مسودة قابلة للتعديل');
    if (draft.revision !== input.revision) throw new BulletinConflictError('عدّل محرر آخر المسودة؛ حدّث الصفحة');
    const byId = new Map(draft.items.map(item => [item.id, item]));
    if (input.items.some(item => !byId.has(item.id))) throw new BulletinConflictError('فقرة غير معروفة في المسودة');
    // Editors may rewrite, reorder or drop paragraphs, but not invent new sources.
    draft.items = input.items.map(item => ({ ...byId.get(item.id)!, label: item.label, text: stripMarkup(item.text) }));
    draft.title = input.title;
    draft.revision += 1;
    draft.status = 'draft';
    draft.error = null;
    draft.updatedAt = new Date().toISOString();
    draft.updatedBy = userId;
    return draft;
  });
}

export async function discardBulletinDraft(userId: string): Promise<void> {
  await mutate(state => {
    if (state.draft?.status === 'generating') throw new BulletinConflictError('لا يمكن حذف نشرة قيد التوليد');
    if (state.draft) console.log(`[AudioBulletin] draft ${state.draft.id} discarded by ${userId}`);
    state.draft = null;
  });
}

/** Marks the draft as generating and returns it; audio is produced in the background. */
export async function approveBulletinDraft(revision: number, userId: string): Promise<Bulletin> {
  if (!isBulletinStorageConfigured()) throw new Error('تخزين الملفات الصوتية غير مضبوط على الخادم');
  const approved = await mutate(state => {
    const draft = state.draft;
    if (!draft || draft.status === 'generating') throw new BulletinConflictError('لا توجد مسودة جاهزة للاعتماد');
    if (draft.revision !== revision) throw new BulletinConflictError('تغيّرت المسودة منذ فتحها؛ حدّث الصفحة');
    if (draft.items.length === 0) throw new BulletinConflictError('المسودة فارغة');
    draft.status = 'generating';
    draft.error = null;
    draft.approvedAt = new Date().toISOString();
    draft.approvedBy = userId;
    return structuredClone(draft);
  });
  void produceAudio(approved);
  return approved;
}

async function produceAudio(bulletin: Bulletin): Promise<void> {
  try {
    const audio = await synthesizeBulletin(bulletinParagraphs(bulletin.items));
    const url = await uploadBulletinAudio(bulletin.id, new Date(bulletin.createdAt), audio);
    const chapters = bulletinChapters(bulletin.items, audio.starts);
    await mutate(state => {
      if (state.draft?.id !== bulletin.id) return; // discarded meanwhile
      const publishedAt = new Date().toISOString();
      const published: Bulletin = {
        ...state.draft, status: 'published', publishedAt,
        audio: { url, contentType: audio.contentType, durationSec: Math.round(audio.durationSec * 10) / 10, bytes: audio.buffer.length, provider: audio.provider, chapters },
      };
      state.current = published;
      state.draft = null;
      state.history = [
        { id: published.id, title: published.title, publishedAt, approvedBy: published.approvedBy, durationSec: published.audio!.durationSec, provider: audio.provider },
        ...state.history,
      ].slice(0, 30);
    });
    console.log(`[AudioBulletin] published ${bulletin.id} (${audio.provider}, ${Math.round(audio.durationSec)}s, ${Math.round(audio.buffer.length / 1024)}KB)`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    console.error(`[AudioBulletin] audio generation failed for ${bulletin.id}: ${message}`);
    await mutate(state => {
      if (state.draft?.id !== bulletin.id) return;
      state.draft.status = 'failed';
      state.draft.error = message === 'TTS_INPUT_NOT_ALLOWED'
        ? 'رفض مزود الصوت قراءة النص. عدّل الصياغة ثم أعد الاعتماد.'
        : 'تعذّر توليد الصوت. أعد المحاولة بعد قليل.';
    }).catch(() => undefined);
  }
}

/** Takes the current bulletin off the site immediately. */
export async function hideCurrentBulletin(userId: string): Promise<void> {
  await mutate(state => {
    if (!state.current) return;
    const hiddenAt = new Date().toISOString();
    state.history = state.history.map(entry => entry.id === state.current!.id ? { ...entry, hiddenAt } : entry);
    console.log(`[AudioBulletin] ${state.current.id} hidden by ${userId}`);
    state.current = null;
  });
}

export async function setBulletinSchedule(enabled: boolean): Promise<BulletinState> {
  return mutate(state => { state.scheduleEnabled = enabled; return state; });
}

/** Called by the job: creates the slot's draft once, never overwriting an editor's work. */
export async function runScheduledBulletin(now = new Date()): Promise<'created' | 'skipped'> {
  const slot = dueSlot(now);
  if (!slot) return 'skipped';
  const state = await loadBulletinState();
  if (!state.scheduleEnabled || state.lastScheduledSlot === slot) return 'skipped';
  if (state.draft && state.draft.status !== 'failed' && Date.parse(state.draft.updatedAt) > now.getTime() - 3 * 3600_000) {
    // A fresh draft is already waiting for an editor.
    await mutate(s => { s.lastScheduledSlot = slot; });
    return 'skipped';
  }
  await mutate(s => { s.lastScheduledSlot = slot; });
  await createBulletinDraft(null, now);
  return 'created';
}

export function bulletinAdminView(state: BulletinState) {
  return {
    scheduleEnabled: state.scheduleEnabled,
    slots: BULLETIN_SLOTS,
    intro: BULLETIN_INTRO,
    outro: BULLETIN_OUTRO,
    draft: state.draft,
    current: state.current,
    live: publicBulletin(state) !== null,
    history: state.history,
    storageConfigured: isBulletinStorageConfigured(),
  };
}

export async function articleTitles(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select({ id: articles.id, title: articles.title }).from(articles).where(inArray(articles.id, ids));
  return new Map(rows.map(r => [r.id, stripMarkup(r.title)]));
}

