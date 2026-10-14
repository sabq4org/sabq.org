import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth, hasPermission } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  ExternalLink,
  EyeOff,
  FileAudio,
  Flame,
  History,
  ListMusic,
  Loader2,
  Mic,
  Newspaper,
  Pause,
  Play,
  Plus,
  Radio,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Star,
  Trash2,
  Volume2,
  VolumeX,
  Wand2,
} from "lucide-react";

interface BulletinItem {
  id: string;
  articleIds: string[];
  href: string | null;
  label: string;
  text: string;
}

interface BulletinChapter {
  start: number;
  label: string;
  href: string | null;
}

interface Bulletin {
  id: string;
  title: string;
  status: "draft" | "generating" | "failed" | "published";
  revision: number;
  items: BulletinItem[];
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  error: string | null;
  audio: {
    url: string;
    contentType?: string;
    durationSec: number;
    bytes?: number;
    provider: string;
    chapters: BulletinChapter[];
  } | null;
}

interface BulletinHistoryEntry {
  id: string;
  title: string;
  publishedAt: string | null;
  approvedBy?: string | null;
  durationSec: number;
  provider: string;
  hiddenAt?: string;
  audioUrl?: string;
  itemCount?: number;
}

interface CandidateStory {
  id: string;
  title: string;
  href: string;
  category?: string | null;
  newsType?: string;
  views?: number;
  isFeatured?: boolean;
  publishedAt?: string;
}

interface AdminBulletinResponse {
  scheduleEnabled: boolean;
  slots: number[];
  intro: string;
  outro: string;
  draft: Bulletin | null;
  current: Bulletin | null;
  live: boolean;
  history: BulletinHistoryEntry[];
  storageConfigured: boolean;
  sourceTitles: Record<string, string>;
  candidates?: CandidateStory[];
}

type CandidateQuickFilter = "all" | "breaking" | "featured" | "available";

const SABQ_VOCALIZED = "سَبْق";
const LIVE_WINDOW_MS = 6 * 60 * 60 * 1000;
const WORDS_PER_SECOND = 2.35;

const EDITION_PRESETS = [
  { label: "تلقائي حسب الوقت", value: "" },
  { label: "نشرة الصباح", value: "نشرة الصباح" },
  { label: "نشرة الظهيرة", value: "نشرة الظهيرة" },
  { label: "نشرة المساء", value: "نشرة المساء" },
  { label: "موجز سَبْق الصوتي", value: "موجز سَبْق الصوتي" },
];

const SCHEDULE_SLOTS = [
  { hour: 7, label: "نشرة الصباح", timeLabel: "07:00 صباحاً", period: "الفترة الصباحية" },
  { hour: 13, label: "نشرة الظهيرة", timeLabel: "01:00 ظهراً", period: "فترة الظهيرة" },
  { hour: 21, label: "نشرة المساء", timeLabel: "09:00 مساءً", period: "الفترة المسائية" },
];

function vocalizeSabq(value: string): string {
  return value
    .replace(/(نشرة|صحيفة|موقع|تطبيق)\s+سبق(?=[\s،.,:؛!؟]|$)/g, `$1 ${SABQ_VOCALIZED}`)
    .replace(/(^|[\s«"(])سبق(?=\s+دوت)/g, `$1${SABQ_VOCALIZED}`);
}

function vocalizeAllSabqOccurrences(value: string): string {
  return value.replace(/سبق/g, SABQ_VOCALIZED);
}

function countWords(text: string): number {
  const cleaned = text.trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).length;
}

function estimateSecondsFromWords(words: number): number {
  if (words <= 0) return 0;
  return Math.max(2, Math.round(words / WORDS_PER_SECOND));
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("ar-SA", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Riyadh",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatShortTime(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("ar-SA", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "Asia/Riyadh",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatDuration(seconds?: number | null): string {
  const total = Math.max(0, Math.round(seconds || 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function getRemainingBroadcastWindow(publishedAt?: string | null): {
  active: boolean;
  label: string;
  percentRemaining: number;
} {
  if (!publishedAt) {
    return { active: false, label: "غير منشورة", percentRemaining: 0 };
  }
  const pubMs = new Date(publishedAt).getTime();
  if (!Number.isFinite(pubMs)) {
    return { active: false, label: "غير معروف", percentRemaining: 0 };
  }
  const expiresAt = pubMs + LIVE_WINDOW_MS;
  const diff = expiresAt - Date.now();
  if (diff <= 0) {
    return { active: false, label: "انتهت نافذة الـ 6 ساعات", percentRemaining: 0 };
  }
  const hours = Math.floor(diff / (60 * 60 * 1000));
  const mins = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
  const pct = Math.min(100, Math.max(5, Math.round((diff / LIVE_WINDOW_MS) * 100)));
  return {
    active: true,
    label: hours > 0 ? `متبقي ${hours} س و ${mins} د على الهواء` : `متبقي ${mins} دقيقة على الهواء`,
    percentRemaining: pct,
  };
}

function getNextRiyadhSlot(): { label: string; timeLabel: string; hour: number } {
  try {
    const riyadhHour = Number(
      new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        hour12: false,
        timeZone: "Asia/Riyadh",
      }).format(new Date())
    );
    for (const slot of SCHEDULE_SLOTS) {
      if (riyadhHour < slot.hour) return slot;
    }
    return SCHEDULE_SLOTS[0];
  } catch {
    return SCHEDULE_SLOTS[0];
  }
}

function providerBadgeLabel(provider?: string): string {
  if (provider === "gemini") return "Gemini Orus TTS";
  if (provider === "humain") return "HUMAIN TTS";
  if (provider === "elevenlabs") return "ElevenLabs";
  if (provider === "google") return "Google TTS";
  return provider || "TTS";
}

export default function AudioBulletinPage() {
  const { user } = useAuth();
  const canManageSchedule = hasPermission(user, "system.manage_settings");

  const [draft, setDraft] = useState<Bulletin | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Studio Draft Generation Options
  const [selectedEditionTitle, setSelectedEditionTitle] = useState<string>("");
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [candidateSearch, setCandidateSearch] = useState<string>("");
  const [candidateFilter, setCandidateFilter] = useState<CandidateQuickFilter>("all");
  const [historySearch, setHistorySearch] = useState<string>("");

  // Live Studio Audio Player State
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<1 | 1.25 | 1.5>(1);
  const [isMuted, setIsMuted] = useState(false);
  const [liveViewTab, setLiveViewTab] = useState<"chapters" | "script">("chapters");
  const [copiedUrl, setCopiedUrl] = useState(false);

  const { data, isLoading, isFetching, refetch } = useQuery<AdminBulletinResponse>({
    queryKey: ["/api/audio-bulletin/admin"],
    refetchInterval: (query) =>
      query.state.data?.draft?.status === "generating" ? 2500 : false,
  });

  useEffect(() => {
    if (!data?.draft) {
      setDraft(null);
      return;
    }
    setDraft((prev) =>
      prev && prev.id === data.draft?.id && prev.revision === data.draft?.revision
        ? prev
        : structuredClone(data.draft)
    );
  }, [data?.draft]);

  const current = data?.current ?? null;
  const isLive = Boolean(data?.live && current?.audio);
  const sourceTitles = data?.sourceTitles ?? {};
  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
  const history = Array.isArray(data?.history) ? data.history : [];
  const fixedIntro = data?.intro ?? "مرحباً بكم في نشرة سَبْق، نأخذكم في جولة سريعة لأهم الأخبار.";
  const fixedOutro = data?.outro ?? "كانت هذه أبرز الأخبار، والتفاصيل كاملة على سَبْق دوت أورغ. شكراً لاستماعكم.";

  // Reset player state when current audio URL changes
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setAudioDuration(current?.audio?.durationSec ?? 0);
  }, [current?.audio?.url, current?.audio?.durationSec]);

  // Check if local draft has unsaved changes compared to server draft
  const hasUnsavedChanges = useMemo(() => {
    if (!draft || !data?.draft) return false;
    const localItems = Array.isArray(draft.items) ? draft.items : [];
    const remoteItems = Array.isArray(data.draft.items) ? data.draft.items : [];
    return (
      JSON.stringify({
        title: draft.title,
        items: localItems.map((i) => ({
          id: i.id,
          label: i.label,
          text: i.text,
          articleIds: i.articleIds,
        })),
      }) !==
      JSON.stringify({
        title: data.draft.title,
        items: remoteItems.map((i) => ({
          id: i.id,
          label: i.label,
          text: i.text,
          articleIds: i.articleIds,
        })),
      })
    );
  }, [draft, data?.draft]);

  // Word count & estimated duration for the open draft
  const draftStats = useMemo(() => {
    if (!draft) return { totalWords: 0, estimatedSeconds: 0, itemCount: 0 };
    const draftItems = Array.isArray(draft.items) ? draft.items : [];
    const introWords = countWords(fixedIntro);
    const outroWords = countWords(fixedOutro);
    const itemsWords = draftItems.reduce((acc, item) => acc + countWords(item.text || ""), 0);
    const totalWords = introWords + outroWords + itemsWords;
    const estimatedSeconds =
      estimateSecondsFromWords(totalWords) + Math.max(0, draftItems.length + 1) * 0.45;
    return {
      totalWords,
      estimatedSeconds: Math.round(estimatedSeconds),
      itemCount: draftItems.length,
    };
  }, [draft, fixedIntro, fixedOutro]);

  // Active chapter index in the live player
  const activeChapterIndex = useMemo(() => {
    const chapters = Array.isArray(current?.audio?.chapters) ? current.audio.chapters : [];
    if (!chapters.length) return 0;
    let activeIdx = 0;
    for (let i = 0; i < chapters.length; i++) {
      if (currentTime + 0.15 >= chapters[i].start) {
        activeIdx = i;
      } else {
        break;
      }
    }
    return activeIdx;
  }, [current?.audio?.chapters, currentTime]);

  // Set of articleIds already in the active draft
  const draftArticleIds = useMemo(() => {
    if (!draft || !Array.isArray(draft.items)) return new Set<string>();
    return new Set(draft.items.flatMap((i) => (Array.isArray(i.articleIds) ? i.articleIds : [])));
  }, [draft]);

  // Candidate filter counts
  const candidateFilterCounts = useMemo(() => {
    return {
      all: candidates.length,
      breaking: candidates.filter((c) => c.newsType === "breaking").length,
      featured: candidates.filter((c) => Boolean(c.isFeatured)).length,
      available: candidates.filter((c) => !draftArticleIds.has(c.id)).length,
    };
  }, [candidates, draftArticleIds]);

  // Filtered candidate stories
  const filteredCandidates = useMemo(() => {
    let list = candidates;
    if (candidateFilter === "breaking") {
      list = list.filter((c) => c.newsType === "breaking");
    } else if (candidateFilter === "featured") {
      list = list.filter((c) => Boolean(c.isFeatured));
    } else if (candidateFilter === "available") {
      list = list.filter((c) => !draftArticleIds.has(c.id));
    }
    const q = candidateSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.category && c.category.toLowerCase().includes(q))
    );
  }, [candidates, candidateFilter, candidateSearch, draftArticleIds]);

  // Filtered history entries
  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return history;
    return history.filter((h) => (h.title || "").toLowerCase().includes(q));
  }, [history, historySearch]);

  function applyResponse(next: AdminBulletinResponse, message: string) {
    queryClient.setQueryData(["/api/audio-bulletin/admin"], next);
    setDraft(next.draft ? structuredClone(next.draft) : null);
    setStatusMessage(message);
    setErrorMessage(null);
  }

  function handleError(error: unknown) {
    setStatusMessage(null);
    setErrorMessage(error instanceof Error ? error.message : "حدث خطأ غير متوقع");
  }

  function serializeDraftPayload(value: Bulletin) {
    const safeItems = Array.isArray(value.items) ? value.items : [];
    return {
      revision: value.revision,
      title: value.title.trim(),
      items: safeItems.map(({ id, label, text, articleIds, href }) => ({
        id,
        label: label.trim().slice(0, 60),
        text: text.trim(),
        ...(articleIds?.length ? { articleIds } : {}),
        ...(href !== undefined ? { href } : {}),
      })),
    };
  }

  const createDraftMutation = useMutation({
    mutationFn: (options?: { articleIds?: string[]; title?: string }) =>
      apiRequest("/api/audio-bulletin/admin/draft", {
        method: "POST",
        body:
          options && (options.articleIds?.length || options.title)
            ? JSON.stringify(options)
            : undefined,
      }) as Promise<AdminBulletinResponse>,
    onSuccess: (next) => {
      setSelectedCandidateIds([]);
      applyResponse(
        next,
        "تم توليد مسودة النشرة الصوتية بالذكاء الاصطناعي — راجع الفقرات وعدّلها قبل الاعتماد."
      );
    },
    onError: handleError,
  });

  const cloneCurrentMutation = useMutation({
    mutationFn: () =>
      apiRequest("/api/audio-bulletin/admin/draft/from-current", {
        method: "POST",
      }) as Promise<AdminBulletinResponse>,
    onSuccess: (next) =>
      applyResponse(
        next,
        "تم نسخ النشرة المنشورة حالياً إلى مسودة قابلة للتعديل وإعادة التسجيل."
      ),
    onError: handleError,
  });

  const saveDraftMutation = useMutation({
    mutationFn: (value: Bulletin) =>
      apiRequest("/api/audio-bulletin/admin/draft", {
        method: "PUT",
        body: JSON.stringify(serializeDraftPayload(value)),
      }) as Promise<AdminBulletinResponse>,
    onSuccess: (next) => applyResponse(next, "تم حفظ تعديلات المسودة بنجاح."),
    onError: handleError,
  });

  const approveMutation = useMutation({
    mutationFn: async (value: Bulletin) => {
      const saved = (await apiRequest("/api/audio-bulletin/admin/draft", {
        method: "PUT",
        body: JSON.stringify(serializeDraftPayload(value)),
      })) as AdminBulletinResponse;
      const revision = saved.draft?.revision ?? value.revision;
      return apiRequest("/api/audio-bulletin/admin/draft/approve", {
        method: "POST",
        body: JSON.stringify({ revision }),
      }) as Promise<AdminBulletinResponse>;
    },
    onSuccess: (next) => {
      queryClient.invalidateQueries({ queryKey: ["/api/audio-bulletin/current"] });
      applyResponse(
        next,
        "بدأ تسجيل الصوت بالذكاء الاصطناعي؛ ستُنشر النشرة تلقائياً فور اكتمال التسجيل."
      );
    },
    onError: handleError,
  });

  const discardMutation = useMutation({
    mutationFn: () =>
      apiRequest("/api/audio-bulletin/admin/draft", {
        method: "DELETE",
      }) as Promise<AdminBulletinResponse>,
    onSuccess: (next) => applyResponse(next, "تم حذف المسودة الحالية."),
    onError: handleError,
  });

  const hideMutation = useMutation({
    mutationFn: () =>
      apiRequest("/api/audio-bulletin/admin/hide", {
        method: "POST",
      }) as Promise<AdminBulletinResponse>,
    onSuccess: (next) => {
      queryClient.invalidateQueries({ queryKey: ["/api/audio-bulletin/current"] });
      applyResponse(next, "تم إيقاف بث النشرة وإخفاؤها من واجهة الموقع.");
    },
    onError: handleError,
  });

  const scheduleMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      apiRequest("/api/audio-bulletin/admin/schedule", {
        method: "PUT",
        body: JSON.stringify({ enabled }),
      }) as Promise<AdminBulletinResponse>,
    onSuccess: (next) =>
      applyResponse(
        next,
        next.scheduleEnabled
          ? "تم تفعيل الجدولة الآلية (7 صباحاً، 1 ظهراً، 9 مساءً بتوقيت الرياض)."
          : "تم إيقاف الجدولة الآلية — النشر الآن يدوي فقط."
      ),
    onError: handleError,
  });

  const isGenerating = draft?.status === "generating";
  const busy =
    isGenerating ||
    createDraftMutation.isPending ||
    cloneCurrentMutation.isPending ||
    saveDraftMutation.isPending ||
    approveMutation.isPending ||
    discardMutation.isPending ||
    hideMutation.isPending;

  // Draft item manipulation helpers
  function updateItem(index: number, patch: Partial<BulletinItem>) {
    if (!draft) return;
    const currentItems = Array.isArray(draft.items) ? draft.items : [];
    const items = currentItems.map((item, idx) =>
      idx === index ? { ...item, ...patch } : item
    );
    setDraft({ ...draft, items });
  }

  function moveItem(index: number, direction: -1 | 1) {
    if (!draft) return;
    const currentItems = Array.isArray(draft.items) ? draft.items : [];
    const target = index + direction;
    if (target < 0 || target >= currentItems.length) return;
    const items = [...currentItems];
    [items[index], items[target]] = [items[target], items[index]];
    setDraft({ ...draft, items });
  }

  function removeItem(index: number) {
    if (!draft) return;
    const currentItems = Array.isArray(draft.items) ? draft.items : [];
    if (currentItems.length <= 1) return;
    setDraft({ ...draft, items: currentItems.filter((_, idx) => idx !== index) });
  }

  function addManualParagraph() {
    if (!draft) return;
    const currentItems = Array.isArray(draft.items) ? draft.items : [];
    if (currentItems.length >= 10) {
      setErrorMessage("الحد الأقصى لفقرات النشرة هو 10 فقرات.");
      return;
    }
    const newItem: BulletinItem = {
      id: `item-manual-${Date.now().toString(36)}`,
      label: `خبر رقم ${currentItems.length + 1}`,
      text: `وفي مستجدات الأخبار عبر صحيفة ${SABQ_VOCALIZED}، `,
      articleIds: [],
      href: null,
    };
    setDraft({ ...draft, items: [...currentItems, newItem] });
    setStatusMessage("تمت إضافة فقرة يدوية جديدة إلى المسودة.");
  }

  function addCandidateToDraft(story: CandidateStory) {
    if (!draft) return;
    const currentItems = Array.isArray(draft.items) ? draft.items : [];
    if (currentItems.length >= 10) {
      setErrorMessage("الحد الأقصى لفقرات النشرة هو 10 فقرات.");
      return;
    }
    const cleanLabel = vocalizeSabq(story.title).slice(0, 58);
    const newItem: BulletinItem = {
      id: `item-${story.id.slice(0, 8)}-${Date.now().toString(36).slice(-3)}`,
      label: cleanLabel.length >= 2 ? cleanLabel : "خبر جديد",
      text: `وفي تفاصيل هذا الخبر، ${vocalizeSabq(story.title)}، حيث نتابع معكم أبرز المستجدات والتفاصيل عبر صحيفة ${SABQ_VOCALIZED}.`,
      articleIds: [story.id],
      href: story.href,
    };
    setDraft({ ...draft, items: [...currentItems, newItem] });
    setStatusMessage(
      `تم إدراج الخبر «${story.title.slice(0, 45)}...» كفقرة جديدة في المسودة.`
    );
  }

  function vocalizeEntireDraft() {
    if (!draft) return;
    const currentItems = Array.isArray(draft.items) ? draft.items : [];
    setDraft({
      ...draft,
      title: vocalizeAllSabqOccurrences(draft.title),
      items: currentItems.map((item) => ({
        ...item,
        label: vocalizeAllSabqOccurrences(item.label),
        text: vocalizeSabq(item.text),
      })),
    });
    setStatusMessage(`تم تشكيل لفظ «${SABQ_VOCALIZED}» في فقرات المسودة.`);
  }

  function toggleCandidateSelection(id: string) {
    setSelectedCandidateIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  // Audio player controls
  function togglePlay() {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }

  function seekTo(seconds: number) {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, seconds);
    setCurrentTime(el.currentTime);
    if (el.paused) {
      el.play().catch(() => {});
    }
  }

  function cyclePlaybackRate() {
    const nextRate: 1 | 1.25 | 1.5 =
      playbackRate === 1 ? 1.25 : playbackRate === 1.25 ? 1.5 : 1;
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  }

  function toggleMute() {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (audioRef.current) {
      audioRef.current.muted = nextMuted;
    }
  }

  function copyAudioUrl() {
    if (!current?.audio?.url) return;
    navigator.clipboard?.writeText(current.audio.url).then(() => {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    });
  }

  const broadcastWindow = getRemainingBroadcastWindow(current?.publishedAt);
  const nextSlot = getNextRiyadhSlot();
  const avgHistoryDuration =
    history.length > 0
      ? Math.round(
          history.reduce((acc, h) => acc + (h.durationSec || 0), 0) / history.length
        )
      : 0;
  const chapters = Array.isArray(current?.audio?.chapters) ? current.audio.chapters : [];
  const currentItems = Array.isArray(current?.items) ? current.items : [];
  const draftItems = Array.isArray(draft?.items) ? draft.items : [];
  const totalCurrentDuration = current?.audio?.durationSec ?? 0;

  return (
    <DashboardLayout>
      <DashboardPageShell
        maxWidthClassName="max-w-[1600px]"
        contentClassName="px-4 pb-12 sm:px-6 space-y-6"
      >
        {/* Unified Dashboard Page Header */}
        <DashboardPageHeader
          icon={Radio}
          titleTestId="heading-audio-bulletin"
          title={
            <div className="flex flex-wrap items-center gap-2">
              <span>استوديو النشرة الصوتية الإخبارية</span>
              {isLive ? (
                <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 gap-1.5 px-2.5 py-0.5 text-xs font-semibold">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  يبث الآن · {broadcastWindow.label}
                </Badge>
              ) : current ? (
                <Badge variant="secondary" className="gap-1.5 px-2.5 py-0.5 text-xs">
                  <Clock className="h-3.5 w-3.5" />
                  منشورة سابقاً · انتهت نافذة الـ 6 ساعات
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="gap-1.5 px-2.5 py-0.5 text-xs text-muted-foreground"
                >
                  خارج الهواء حالياً
                </Badge>
              )}
              {data?.storageConfigured ? (
                <Badge
                  variant="outline"
                  className="text-xs border-primary/30 text-primary bg-primary/5"
                >
                  التخزين السحابي متصل
                </Badge>
              ) : null}
            </div>
          }
          description={`إعداد وتحرير النصوص الإذاعية بالذكاء الاصطناعي، اختيار الأخبار المرشحة، التحكم في الفصول الصوتية، واعتماد التسجيل الصوتي الفوري في الشريط العلوي لـ ${SABQ_VOCALIZED}.`}
          actions={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching || busy}
                className="gap-1.5 rounded-xl"
                data-testid="button-refresh-bulletin"
              >
                <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
                تحديث
              </Button>

              {current && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => cloneCurrentMutation.mutate()}
                  disabled={busy}
                  className="gap-1.5 rounded-xl border-primary/30 hover:bg-primary/5"
                  data-testid="button-clone-current-bulletin"
                >
                  {cloneCurrentMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Copy className="h-4 w-4 text-primary" />
                  )}
                  نسخ النشرة الحالية كمسودة
                </Button>
              )}

              <Button
                size="sm"
                onClick={() =>
                  createDraftMutation.mutate({
                    articleIds:
                      selectedCandidateIds.length > 0 ? selectedCandidateIds : undefined,
                    title: selectedEditionTitle || undefined,
                  })
                }
                disabled={busy}
                className="gap-2 rounded-xl shadow-xs"
                data-testid="button-create-bulletin-draft"
              >
                {createDraftMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {selectedCandidateIds.length > 0
                  ? `توليد مسودة من (${selectedCandidateIds.length}) أخبار محددة`
                  : draft
                  ? "إعادة توليد مسودة ذكية"
                  : "توليد مسودة ذكية الآن"}
              </Button>
            </>
          }
        />

        {/* Alerts & Storage Check */}
        {data && !data.storageConfigured && (
          <Card className="rounded-2xl border-amber-500/40 bg-amber-500/10">
            <CardContent className="p-4 flex items-center gap-3 text-sm">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
              <div>
                <p className="font-semibold text-amber-900 dark:text-amber-200">
                  التخزين السحابي (Cloudflare R2) غير مهيأ في هذه البيئة
                </p>
                <p className="text-amber-800/80 dark:text-amber-300/80 text-xs mt-0.5">
                  يمكنك إنشاء المسودة وتحرير النص الإذاعي بالكامل، لكن تسجيل الصوت ونشر ملف MP3 يتطلب متغيرات R2.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {(statusMessage || errorMessage || draft?.error) && (
          <Card
            className={cn(
              "rounded-2xl",
              errorMessage || draft?.error
                ? "border-destructive/40 bg-destructive/10"
                : "border-emerald-500/40 bg-emerald-500/10"
            )}
          >
            <CardContent className="p-3.5 px-4 flex items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-2.5 min-w-0">
                {errorMessage || draft?.error ? (
                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                )}
                <span className="font-medium break-words">
                  {errorMessage || draft?.error || statusMessage}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs shrink-0"
                onClick={() => {
                  setStatusMessage(null);
                  setErrorMessage(null);
                }}
              >
                إغلاق
              </Button>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {[1, 2, 3, 4].map((n) => (
                <Skeleton key={n} className="h-28 w-full rounded-2xl" />
              ))}
            </div>
            <Skeleton className="h-64 w-full rounded-2xl" />
            <Skeleton className="h-96 w-full rounded-2xl" />
          </div>
        ) : (
          <>
            {/* 4-Card KPI Summary Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {/* KPI 1: Live Broadcast Status */}
              <Card className="rounded-2xl border-border/70 shadow-xs">
                <CardContent className="p-4 flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">
                      حالة البث الحي على الموقع
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-base sm:text-lg font-bold truncate" data-testid="kpi-live-status">
                        {isLive
                          ? current?.title
                          : current
                          ? "منتهية الصلاحية"
                          : "متوقف حالياً"}
                      </span>
                    </div>
                    <p className="text-[11px] sm:text-xs text-muted-foreground tabular-nums truncate">
                      {current
                        ? `نُشرت ${formatShortTime(current.publishedAt)} · ${broadcastWindow.label}`
                        : "لا توجد نشرة معروضة للزوار الآن"}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                    <Radio className="h-5 w-5" />
                  </div>
                </CardContent>
              </Card>

              {/* KPI 2: Audio Duration & Chapters */}
              <Card className="rounded-2xl border-border/70 shadow-xs">
                <CardContent className="p-4 flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">
                      مدة البث والفصول الصوتية
                    </p>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-lg sm:text-xl font-bold tabular-nums" data-testid="kpi-audio-duration">
                        {current?.audio ? formatDuration(totalCurrentDuration) : "0:00"}
                      </span>
                      <span className="text-xs text-muted-foreground">دقيقة</span>
                    </div>
                    <p className="text-[11px] sm:text-xs text-muted-foreground tabular-nums truncate">
                      {current
                        ? `${currentItems.length} فقرات خبرية · ${chapters.length} فصول صوتية`
                        : "بانتظار اعتماد النشرة القادمة"}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-primary/10 text-primary shrink-0">
                    <ListMusic className="h-5 w-5" />
                  </div>
                </CardContent>
              </Card>

              {/* KPI 3: Editorial Draft & Candidate Pool */}
              <Card className="rounded-2xl border-border/70 shadow-xs">
                <CardContent className="p-4 flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">
                      المسودة وبنك الأخبار
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-base sm:text-lg font-bold tabular-nums truncate" data-testid="kpi-draft-status">
                        {isGenerating
                          ? "جارٍ تسجيل الصوت..."
                          : draft
                          ? `مسودة نشطة (#${draft.revision})`
                          : "لا توجد مسودة"}
                      </span>
                    </div>
                    <p className="text-[11px] sm:text-xs text-muted-foreground tabular-nums truncate">
                      {draft
                        ? `${draftStats.itemCount} فقرات · ~${formatDuration(draftStats.estimatedSeconds)} د متوقعة`
                        : `${candidates.length} خبر مرشح من الساعات الأخيرة`}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 shrink-0">
                    <Mic className="h-5 w-5" />
                  </div>
                </CardContent>
              </Card>

              {/* KPI 4: Schedule & History */}
              <Card className="rounded-2xl border-border/70 shadow-xs">
                <CardContent className="p-4 flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">
                      الجدولة الآلية والأرشيف
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-base sm:text-lg font-bold tabular-nums truncate" data-testid="kpi-schedule-status">
                        {data?.scheduleEnabled ? "مفعّلة (3 يومياً)" : "يدوي فقط"}
                      </span>
                    </div>
                    <p className="text-[11px] sm:text-xs text-muted-foreground tabular-nums truncate">
                      القادمة: {nextSlot.timeLabel} · {history.length} بالسجل (متوسط{" "}
                      {formatDuration(avgHistoryDuration)})
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                    <Clock className="h-5 w-5" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Live On-Air Broadcast Studio Player & Chapter Timeline */}
            {current?.audio && (
              <Card className="rounded-2xl border-border/70 shadow-xs overflow-hidden">
                <CardHeader className="pb-3 border-b bg-muted/20">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                          <Volume2 className="h-5 w-5 text-primary" />
                          البث الحي والملف الصوتي المعتمد: {current.title}
                        </CardTitle>
                        <Badge variant={isLive ? "default" : "secondary"}>
                          {isLive ? "معروضة للزوار الآن" : "مخفية / انتهت المدة"}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          محرك الصوت: {providerBadgeLabel(current.audio.provider)}
                        </Badge>
                      </div>
                      <CardDescription>
                        نُشرت في {formatDateTime(current.publishedAt)} · المدة الإجمالية{" "}
                        {formatDuration(totalCurrentDuration)} دقيقة · اضغط على أي فصل للانتقال الفوري في التسجيل
                      </CardDescription>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={copyAudioUrl}
                        className="gap-1.5 text-xs"
                      >
                        {copiedUrl ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        {copiedUrl ? "تم نسخ الرابط" : "نسخ رابط MP3"}
                      </Button>

                      <Button variant="outline" size="sm" asChild className="gap-1.5 text-xs">
                        <a
                          href={current.audio.url}
                          target="_blank"
                          rel="noreferrer"
                          download
                        >
                          <Download className="h-3.5 w-3.5" />
                          تحميل MP3
                        </a>
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => hideMutation.mutate()}
                        disabled={busy}
                        className="gap-1.5 text-xs text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
                        data-testid="button-hide-bulletin"
                      >
                        <EyeOff className="h-3.5 w-3.5" />
                        إخفاء من الموقع
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-4 sm:p-5 space-y-5">
                  {/* Hidden synced HTML5 Audio Element */}
                  <audio
                    ref={audioRef}
                    src={current.audio.url}
                    preload="metadata"
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onEnded={() => setIsPlaying(false)}
                    onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                    onLoadedMetadata={(e) => {
                      const d = e.currentTarget.duration;
                      if (Number.isFinite(d) && d > 0) setAudioDuration(d);
                    }}
                  />

                  {/* Custom Studio Transport Bar */}
                  <div className="rounded-2xl border bg-gradient-to-l from-primary/[0.04] via-background to-muted/30 p-3.5 sm:p-4 flex flex-col md:flex-row md:items-center gap-4">
                    <div className="flex items-center gap-3">
                      <Button
                        type="button"
                        size="icon"
                        onClick={togglePlay}
                        className="h-11 w-11 rounded-xl shadow-xs shrink-0"
                        aria-label={isPlaying ? "إيقاف مؤقت" : "تشغيل النشرة"}
                      >
                        {isPlaying ? (
                          <Pause className="h-5 w-5" />
                        ) : (
                          <Play className="h-5 w-5 fill-current" />
                        )}
                      </Button>

                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">
                          {chapters[activeChapterIndex]?.label || current.title}
                        </p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {formatDuration(currentTime)} /{" "}
                          {formatDuration(audioDuration || totalCurrentDuration)}
                        </p>
                      </div>
                    </div>

                    {/* Interactive Scrubber */}
                    <div className="flex-1 flex items-center gap-3">
                      <input
                        type="range"
                        min={0}
                        max={Math.max(1, Math.round(audioDuration || totalCurrentDuration))}
                        step={0.5}
                        value={Math.min(currentTime, audioDuration || totalCurrentDuration)}
                        onChange={(e) => seekTo(Number(e.target.value))}
                        className="w-full accent-primary cursor-pointer h-2 rounded-lg bg-muted"
                        aria-label="شريط تقدم النشرة الصوتية"
                      />
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={cyclePlaybackRate}
                        className="h-8 px-2.5 text-xs font-mono tabular-nums"
                        title="سرعة التشغيل"
                      >
                        {playbackRate}x
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={toggleMute}
                        className="h-8 w-8"
                        aria-label={isMuted ? "إلغاء كتم الصوت" : "كتم الصوت"}
                      >
                        {isMuted ? (
                          <VolumeX className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Volume2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* View Switcher: Interactive Chapters vs Full Published Script */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant={liveViewTab === "chapters" ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setLiveViewTab("chapters")}
                        className="h-8 text-xs gap-1.5"
                      >
                        <ListMusic className="h-3.5 w-3.5" />
                        الفصول الصوتية ({chapters.length})
                      </Button>
                      <Button
                        type="button"
                        variant={liveViewTab === "script" ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setLiveViewTab("script")}
                        className="h-8 text-xs gap-1.5"
                      >
                        <Newspaper className="h-3.5 w-3.5" />
                        النص الإذاعي الكامل والمصادر ({currentItems.length} أخبار)
                      </Button>
                    </div>

                    {!draft && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => cloneCurrentMutation.mutate()}
                        disabled={busy}
                        className="h-8 text-xs gap-1.5 text-primary"
                      >
                        <Wand2 className="h-3.5 w-3.5" />
                        فتح في محرر المسودة للتعديل
                      </Button>
                    )}
                  </div>

                  {liveViewTab === "chapters" ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                      {chapters.map((chapter, idx) => {
                        const isCurrentChapter = activeChapterIndex === idx;
                        const nextChapter = chapters[idx + 1];
                        const chapterDuration = nextChapter
                          ? Math.max(1, Math.round(nextChapter.start - chapter.start))
                          : Math.max(
                              1,
                              Math.round(
                                (totalCurrentDuration || audioDuration) - chapter.start
                              )
                            );

                        return (
                          <div
                            key={`${chapter.start}-${idx}`}
                            onClick={() => seekTo(chapter.start)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                seekTo(chapter.start);
                              }
                            }}
                            className={`group cursor-pointer rounded-xl border p-3 transition-all flex flex-col justify-between gap-2 ${
                              isCurrentChapter
                                ? "border-primary bg-primary/[0.06] shadow-xs ring-1 ring-primary/20"
                                : "border-border/60 hover:border-primary/40 hover:bg-muted/30"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`inline-flex items-center justify-center h-5 w-5 rounded-full text-[11px] font-bold ${
                                    isCurrentChapter
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-muted text-muted-foreground"
                                  }`}
                                >
                                  {idx + 1}
                                </span>
                                <span className="text-[11px] font-mono tabular-nums text-muted-foreground">
                                  {formatDuration(chapter.start)}
                                </span>
                              </div>
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 h-4 tabular-nums"
                              >
                                {chapterDuration} ث
                              </Badge>
                            </div>

                            <p className="text-xs font-medium leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                              {chapter.label}
                            </p>

                            {chapter.href && (
                              <div className="flex items-center justify-end pt-1">
                                <a
                                  href={chapter.href}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                                >
                                  المصدر
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="space-y-3 bg-muted/20 rounded-xl p-4 border border-border/60">
                      <div className="p-3 rounded-lg bg-background border border-border/50">
                        <span className="text-xs font-semibold text-primary block mb-1">
                          المقدمة الإذاعية الثابتة:
                        </span>
                        <p className="text-sm leading-relaxed">{fixedIntro}</p>
                      </div>

                      <div className="space-y-2.5">
                        {currentItems.map((item, idx) => {
                          const itemArticleIds = Array.isArray(item.articleIds) ? item.articleIds : [];
                          return (
                            <div
                              key={item.id}
                              className="p-3.5 rounded-lg bg-background border border-border/50 space-y-2"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <Badge variant="secondary" className="text-xs">
                                    الفقرة {idx + 1}
                                  </Badge>
                                  <span className="text-sm font-semibold">{item.label}</span>
                                </div>
                                <span className="text-xs text-muted-foreground tabular-nums">
                                  {countWords(item.text)} كلمة · ~
                                  {estimateSecondsFromWords(countWords(item.text))} ثانية
                                </span>
                              </div>
                              <p className="text-sm leading-relaxed text-foreground/90">
                                {item.text}
                              </p>
                              {itemArticleIds.length > 0 && (
                                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
                                  <span>المصادر المرتبطة:</span>
                                  {itemArticleIds.map((id) => {
                                    const sourceTitle = sourceTitles[id];
                                    return (
                                      <a
                                        key={id}
                                        href={item.href || "#"}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                                      >
                                        {sourceTitle || `خبر #${id.slice(0, 8)}`}
                                        <ExternalLink className="h-3 w-3" />
                                      </a>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <div className="p-3 rounded-lg bg-background border border-border/50">
                        <span className="text-xs font-semibold text-primary block mb-1">
                          الخاتمة الإذاعية الثابتة:
                        </span>
                        <p className="text-sm leading-relaxed">{fixedOutro}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Main Studio Workspace: 8 Columns Draft Editor + 4 Columns Candidate Pool & Schedule */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left/Main Column (8 cols): Draft Studio Editor */}
              <div className="lg:col-span-8 space-y-6">
                {draft ? (
                  <Card className="rounded-2xl border-border/70 shadow-xs overflow-hidden">
                    <CardHeader className="border-b bg-muted/20 pb-4">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <CardTitle className="text-lg flex items-center gap-2">
                              <Mic className="h-5 w-5 text-primary" />
                              استوديو تحرير المسودة الإذاعية
                            </CardTitle>
                            <Badge variant="outline" className="tabular-nums">مراجعة #{draft.revision}</Badge>
                            {isGenerating ? (
                              <Badge className="bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30 gap-1.5">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                جارٍ تسجيل الصوت...
                              </Badge>
                            ) : hasUnsavedChanges ? (
                              <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30">
                                تعديلات غير محفوظة
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">
                                محفوظة
                              </Badge>
                            )}
                          </div>
                          <CardDescription className="tabular-nums">
                            إجمالي الكلمات: {draftStats.totalWords} كلمة · المدة التقديرية للتسجيل:{" "}
                            <span className="font-semibold text-foreground">
                              ~{formatDuration(draftStats.estimatedSeconds)} دقيقة
                            </span>{" "}
                            · آخر تحديث: {formatDateTime(draft.updatedAt)}
                          </CardDescription>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={vocalizeEntireDraft}
                            disabled={busy}
                            className="gap-1.5 text-xs rounded-xl"
                          >
                            <Wand2 className="h-3.5 w-3.5 text-primary" />
                            تشكيل «{SABQ_VOCALIZED}» في الكل
                          </Button>

                          {hasUnsavedChanges && data?.draft && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setDraft(structuredClone(data.draft))}
                              disabled={busy}
                              className="gap-1.5 text-xs rounded-xl"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              تراجع
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="p-4 sm:p-6 space-y-5">
                      {/* Edition Title & Preset Pills */}
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label className="text-sm font-semibold">عنوان النشرة الصوتية</label>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {EDITION_PRESETS.filter((p) => p.value).map((preset) => (
                              <button
                                key={preset.value}
                                type="button"
                                disabled={busy}
                                onClick={() => setDraft({ ...draft, title: preset.value })}
                                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                                  draft.title === preset.value
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-muted/40 hover:bg-muted border-border/60 text-muted-foreground"
                                }`}
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <Input
                          value={draft.title}
                          disabled={busy}
                          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                          placeholder="مثال: نشرة المساء"
                          className="font-semibold"
                        />
                      </div>

                      {/* Fixed Broadcast Intro Reference */}
                      <div className="rounded-xl border border-border/60 bg-muted/15 p-3.5 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="outline" className="bg-background text-xs">
                            الافتتاحية الإذاعية (تُقرأ تلقائياً في بداية التسجيل)
                          </Badge>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {countWords(fixedIntro)} كلمة
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {fixedIntro}
                        </p>
                      </div>

                      {/* Story Paragraphs List */}
                      <div className="space-y-3.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-sm font-bold flex items-center gap-2 tabular-nums">
                            <Newspaper className="h-4 w-4 text-primary" />
                            فقرات الأخبار ({draftItems.length} من 10)
                          </h3>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-muted-foreground hidden sm:inline">
                              أضف من بنك الأخبار أو يدوياً
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={busy || draftItems.length >= 10}
                              onClick={addManualParagraph}
                              className="h-7 px-2.5 text-xs gap-1 rounded-lg border-primary/30 text-primary hover:bg-primary/5"
                              data-testid="button-add-manual-paragraph"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              إضافة فقرة يدوية
                            </Button>
                          </div>
                        </div>

                        {draftItems.map((item, index) => {
                          const words = countWords(item.text || "");
                          const estSec = estimateSecondsFromWords(words);
                          const itemArticleIds = Array.isArray(item.articleIds) ? item.articleIds : [];
                          return (
                            <div
                              key={item.id}
                              className="rounded-xl border border-border/70 bg-card p-4 space-y-3 shadow-2xs hover:border-primary/30 transition-colors"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold tabular-nums">
                                    {index + 1}
                                  </span>
                                  <span className="text-sm font-semibold">
                                    الفقرة الخبرية {index + 1}
                                  </span>
                                  <Badge variant="secondary" className="text-[11px] font-normal tabular-nums">
                                    {words} كلمة · ~{estSec} ثانية
                                  </Badge>
                                </div>

                                <div className="flex items-center gap-1">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={busy}
                                    className="h-7 text-xs"
                                    onClick={() =>
                                      updateItem(index, {
                                        label: vocalizeAllSabqOccurrences(item.label),
                                        text: vocalizeSabq(item.text),
                                      })
                                    }
                                  >
                                    تشكيل {SABQ_VOCALIZED}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    disabled={busy || index === 0}
                                    onClick={() => moveItem(index, -1)}
                                    aria-label="تحريك لأعلى"
                                  >
                                    <ArrowUp className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    disabled={busy || index === draftItems.length - 1}
                                    onClick={() => moveItem(index, 1)}
                                    aria-label="تحريك لأسفل"
                                  >
                                    <ArrowDown className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-destructive hover:text-destructive"
                                    disabled={busy || draftItems.length <= 1}
                                    onClick={() => removeItem(index)}
                                    aria-label="حذف الفقرة"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>

                              <div className="space-y-1.5">
                                <label className="text-xs text-muted-foreground">
                                  عنوان الفصل الصوتي (يظهر للمستمع في شريط الفصول — حتى 60 حرفاً)
                                </label>
                                <Input
                                  value={item.label}
                                  disabled={busy}
                                  maxLength={60}
                                  onChange={(e) => updateItem(index, { label: e.target.value })}
                                  placeholder="عنوان موجز للخبر"
                                  className="h-9 text-sm"
                                />
                              </div>

                              <div className="space-y-1.5">
                                <label className="text-xs text-muted-foreground">
                                  النص الإذاعي للفقرة (يُقرأ صوتياً)
                                </label>
                                <Textarea
                                  rows={3}
                                  value={item.text}
                                  disabled={busy}
                                  onChange={(e) => updateItem(index, { text: e.target.value })}
                                  className="text-sm leading-relaxed"
                                />
                              </div>

                              {itemArticleIds.length > 0 && (
                                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground border-t border-border/40">
                                  <span>المصدر الخبري:</span>
                                  {itemArticleIds.map((id) => {
                                    const sourceTitle = sourceTitles[id];
                                    return (
                                      <a
                                        key={id}
                                        href={item.href || "#"}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                                      >
                                        {sourceTitle || `#${id.slice(0, 8)}`}
                                        <ExternalLink className="h-3 w-3" />
                                      </a>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Fixed Broadcast Outro Reference */}
                      <div className="rounded-xl border border-border/60 bg-muted/15 p-3.5 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="outline" className="bg-background text-xs">
                            الخاتمة الإذاعية (تُقرأ تلقائياً في نهاية التسجيل)
                          </Badge>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {countWords(fixedOutro)} كلمة
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {fixedOutro}
                        </p>
                      </div>

                      {/* Draft Studio Footer Actions */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <Button
                            onClick={() => approveMutation.mutate(draft)}
                            disabled={busy || !data?.storageConfigured}
                            className="gap-2 rounded-xl shadow-xs"
                            data-testid="button-approve-bulletin"
                          >
                            {approveMutation.isPending || isGenerating ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4" />
                            )}
                            {isGenerating
                              ? "جارٍ تسجيل الصوت والنشر..."
                              : "اعتماد وتسجيل ونشر فوري"}
                          </Button>

                          <Button
                            variant="outline"
                            onClick={() => saveDraftMutation.mutate(draft)}
                            disabled={busy}
                            className="gap-2 rounded-xl"
                            data-testid="button-save-bulletin-draft"
                          >
                            {saveDraftMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Save className="h-4 w-4" />
                            )}
                            حفظ التعديلات
                          </Button>
                        </div>

                        <Button
                          variant="ghost"
                          onClick={() => discardMutation.mutate()}
                          disabled={busy}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5 rounded-xl"
                          data-testid="button-discard-bulletin-draft"
                        >
                          <Trash2 className="h-4 w-4" />
                          حذف المسودة
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  /* Empty Draft State: Interactive Studio Launchpad */
                  <Card className="rounded-2xl border-border/70 shadow-xs overflow-hidden">
                    <CardHeader className="border-b bg-muted/15">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-primary" />
                        إعداد مسودة نشرة صوتية جديدة
                      </CardTitle>
                      <CardDescription>
                        اختر عنوان النشرة وحدّد أخباراً بعينها من بنك الأخبار المرشحة أو دع الذكاء الاصطناعي يختار أهم 5 إلى 8 أخبار من الساعات الأخيرة.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-5 sm:p-6 space-y-5">
                      <div className="space-y-2.5">
                        <label className="text-sm font-semibold block">
                          1. اختر فترة / عنوان النشرة القادمة
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {EDITION_PRESETS.map((preset) => (
                            <button
                              key={preset.label}
                              type="button"
                              onClick={() => setSelectedEditionTitle(preset.value)}
                              className={`text-xs sm:text-sm px-3.5 py-2 rounded-xl border font-medium transition-all ${
                                selectedEditionTitle === preset.value
                                  ? "bg-primary text-primary-foreground border-primary shadow-2xs"
                                  : "bg-muted/30 hover:bg-muted border-border/60 text-foreground"
                              }`}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-xl border border-border/60 bg-muted/20 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold">
                            2. منهجية اختيار الأخبار:{" "}
                            {selectedCandidateIds.length > 0 ? (
                              <span className="text-primary tabular-nums">
                                اختيار يدوي ({selectedCandidateIds.length} أخبار محددة من البنك)
                              </span>
                            ) : (
                              <span className="text-emerald-600 dark:text-emerald-400">
                                اختيار ذكي تلقائي (الأخبار العاجلة والمميزة والأعلى قراءة)
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            يمكنك تحديد أخبار معينة من قائمة «بنك الأخبار المرشحة» في العمود المجاور قبل التوليد.
                          </p>
                        </div>
                        {selectedCandidateIds.length > 0 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedCandidateIds([])}
                            className="text-xs shrink-0"
                          >
                            إلغاء التحديد ({selectedCandidateIds.length})
                          </Button>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 pt-2">
                        <Button
                          onClick={() =>
                            createDraftMutation.mutate({
                              articleIds:
                                selectedCandidateIds.length > 0
                                  ? selectedCandidateIds
                                  : undefined,
                              title: selectedEditionTitle || undefined,
                            })
                          }
                          disabled={busy}
                          className="gap-2 rounded-xl"
                        >
                          {createDraftMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Sparkles className="h-4 w-4" />
                          )}
                          {selectedCandidateIds.length > 0
                            ? `توليد المسودة من (${selectedCandidateIds.length}) أخبار محددة`
                            : "توليد مسودة ذكية الآن"}
                        </Button>

                        {current && (
                          <Button
                            variant="outline"
                            onClick={() => cloneCurrentMutation.mutate()}
                            disabled={busy}
                            className="gap-2 rounded-xl"
                          >
                            {cloneCurrentMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Copy className="h-4 w-4 text-primary" />
                            )}
                            نسخ النشرة الحالية للتعديل عليها
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Right/Side Column (4 cols): Candidate News Pool + Schedule + History */}
              <div className="lg:col-span-4 space-y-6">
                {/* 1. Candidate News Pool Card */}
                <Card className="rounded-2xl border-border/70 shadow-xs overflow-hidden">
                  <CardHeader className="pb-3 border-b bg-muted/15">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Newspaper className="h-4 w-4 text-primary" />
                        بنك الأخبار المرشحة للنشرة
                      </CardTitle>
                      <Badge variant="secondary" className="text-xs tabular-nums">
                        {candidates.length} خبر
                      </Badge>
                    </div>
                    <CardDescription className="text-xs">
                      {draft
                        ? "اضغط «+ أضف للمسودة» لإدراج أي خبر مباشرة كفقرة جديدة في المسودة المفتوحة."
                        : "حدد الأخبار التي ترغب في تضمينها قبل الضغط على «توليد مسودة ذكية»."}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="p-3.5 space-y-3">
                    <div className="relative">
                      <Search className="h-3.5 w-3.5 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2" />
                      <Input
                        value={candidateSearch}
                        onChange={(e) => setCandidateSearch(e.target.value)}
                        placeholder="ابحث في الأخبار المرشحة..."
                        className="h-8 pr-8 text-xs rounded-xl"
                        data-testid="input-candidate-search"
                      />
                    </div>

                    {/* Quick Filter Pills for Candidate News Pool */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(
                        [
                          { key: "all", label: "الكل", count: candidateFilterCounts.all },
                          { key: "breaking", label: "عاجل", count: candidateFilterCounts.breaking },
                          { key: "featured", label: "مميز", count: candidateFilterCounts.featured },
                          { key: "available", label: "متاح للإدراج", count: candidateFilterCounts.available },
                        ] as const
                      ).map((pill) => {
                        const active = candidateFilter === pill.key;
                        return (
                          <button
                            key={pill.key}
                            type="button"
                            onClick={() => setCandidateFilter(pill.key)}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                              active
                                ? "border-primary bg-primary text-primary-foreground shadow-2xs"
                                : "border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                            data-testid={`filter-candidate-${pill.key}`}
                          >
                            <span>{pill.label}</span>
                            <span
                              className={cn(
                                "rounded-full px-1.5 py-0 text-[10px] tabular-nums",
                                active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-background/80 text-muted-foreground"
                              )}
                            >
                              {pill.count}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {filteredCandidates.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-6">
                        لا توجد أخبار مرشحة مطابقة للبحث حالياً.
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-[380px] overflow-y-auto pl-1">
                        {filteredCandidates.map((story) => {
                          const isAlreadyInDraft = draftArticleIds.has(story.id);
                          const isSelectedForNewDraft = selectedCandidateIds.includes(
                            story.id
                          );

                          return (
                            <div
                              key={story.id}
                              className={`rounded-xl border p-2.5 text-xs space-y-2 transition-all ${
                                isAlreadyInDraft
                                  ? "border-emerald-500/30 bg-emerald-500/[0.04]"
                                  : isSelectedForNewDraft
                                  ? "border-primary bg-primary/[0.05]"
                                  : "border-border/60 hover:border-border"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className="font-medium leading-snug text-foreground line-clamp-2">
                                  {story.title}
                                </p>
                                <a
                                  href={story.href}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-muted-foreground hover:text-primary shrink-0 mt-0.5"
                                  title="فتح الخبر"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              </div>

                              <div className="flex flex-wrap items-center justify-between gap-1.5">
                                <div className="flex flex-wrap items-center gap-1">
                                  {story.newsType === "breaking" && (
                                    <Badge
                                      variant="destructive"
                                      className="text-[10px] px-1.5 py-0 h-4 gap-0.5"
                                    >
                                      <Flame className="h-2.5 w-2.5" />
                                      عاجل
                                    </Badge>
                                  )}
                                  {story.isFeatured && (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] px-1.5 py-0 h-4 gap-0.5 border-amber-500/40 text-amber-600"
                                    >
                                      <Star className="h-2.5 w-2.5" />
                                      مميز
                                    </Badge>
                                  )}
                                  {story.category && (
                                    <Badge
                                      variant="secondary"
                                      className="text-[10px] px-1.5 py-0 h-4"
                                    >
                                      {story.category}
                                    </Badge>
                                  )}
                                  <span className="text-[10px] text-muted-foreground tabular-nums">
                                    {formatShortTime(story.publishedAt)}
                                  </span>
                                </div>

                                {draft ? (
                                  isAlreadyInDraft ? (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] border-emerald-500/40 text-emerald-600 h-5"
                                    >
                                      مُدرج بالمسودة
                                    </Badge>
                                  ) : (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      disabled={busy}
                                      onClick={() => addCandidateToDraft(story)}
                                      className="h-6 px-2 text-[11px] gap-1 border-primary/30 text-primary hover:bg-primary/10"
                                    >
                                      <Plus className="h-3 w-3" />
                                      أضف للمسودة
                                    </Button>
                                  )
                                ) : (
                                  <Button
                                    type="button"
                                    variant={isSelectedForNewDraft ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => toggleCandidateSelection(story.id)}
                                    className="h-6 px-2 text-[11px] gap-1"
                                  >
                                    {isSelectedForNewDraft ? (
                                      <>
                                        <Check className="h-3 w-3" />
                                        محدد
                                      </>
                                    ) : (
                                      "تحديد للنشرة"
                                    )}
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* 2. Automated Broadcast Schedule Card */}
                <Card className="rounded-2xl border-border/70 shadow-xs overflow-hidden">
                  <CardHeader className="pb-3 border-b bg-muted/15">
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Clock className="h-4 w-4 text-primary" />
                          الجدولة الآلية للنشرة
                        </CardTitle>
                        <CardDescription className="text-xs">
                          توليد مسودة تلقائي بتوقيت الرياض
                        </CardDescription>
                      </div>
                      <Switch
                        checked={Boolean(data?.scheduleEnabled)}
                        disabled={!canManageSchedule || scheduleMutation.isPending}
                        onCheckedChange={(checked) => scheduleMutation.mutate(checked)}
                        data-testid="switch-bulletin-schedule"
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="p-3.5 space-y-2.5">
                    {SCHEDULE_SLOTS.map((slot) => {
                      const isNext = nextSlot.hour === slot.hour;
                      return (
                        <div
                          key={slot.hour}
                          className={`rounded-xl border p-2.5 flex items-center justify-between text-xs ${
                            isNext && data?.scheduleEnabled
                              ? "border-primary/40 bg-primary/[0.05]"
                              : "border-border/50 bg-muted/10"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`h-2 w-2 rounded-full ${
                                isNext && data?.scheduleEnabled
                                  ? "bg-primary animate-pulse"
                                  : "bg-muted-foreground/40"
                              }`}
                            />
                            <div>
                              <p className="font-semibold">{slot.label}</p>
                              <p className="text-[11px] text-muted-foreground">{slot.period}</p>
                            </div>
                          </div>
                          <div className="text-left">
                            <Badge
                              variant={
                                isNext && data?.scheduleEnabled ? "default" : "outline"
                              }
                              className="text-[11px] tabular-nums"
                            >
                              {slot.timeLabel}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                    {!canManageSchedule && (
                      <p className="text-[11px] text-muted-foreground pt-1">
                        تعديل حالة الجدولة يتطلب صلاحية إدارة إعدادات النظام.
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* 3. Broadcast History Card */}
                <Card className="rounded-2xl border-border/70 shadow-xs overflow-hidden">
                  <CardHeader className="pb-3 border-b bg-muted/15">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <History className="h-4 w-4 text-primary" />
                        سجل النشرات المسجلة
                      </CardTitle>
                      <Badge variant="outline" className="text-xs tabular-nums">
                        {history.length} نشرة
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3.5 space-y-3">
                    {history.length > 4 && (
                      <div className="relative">
                        <Search className="h-3.5 w-3.5 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2" />
                        <Input
                          value={historySearch}
                          onChange={(e) => setHistorySearch(e.target.value)}
                          placeholder="تصفية السجل..."
                          className="h-8 pr-8 text-xs rounded-xl"
                        />
                      </div>
                    )}

                    {filteredHistory.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        لا توجد نشرات مسجلة في السجل بعد.
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-[320px] overflow-y-auto pl-1">
                        {filteredHistory.map((entry) => (
                          <div
                            key={entry.id}
                            className="rounded-xl border border-border/60 p-2.5 text-xs space-y-1.5 hover:bg-muted/20 transition-colors"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-foreground flex items-center gap-1.5 min-w-0 truncate">
                                <FileAudio className="h-3.5 w-3.5 text-primary shrink-0" />
                                <span className="truncate">{entry.title}</span>
                              </span>
                              <div className="flex items-center gap-1 shrink-0">
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] px-1.5 py-0 h-4 tabular-nums"
                                >
                                  {formatDuration(entry.durationSec)} د
                                </Badge>
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1.5 py-0 h-4"
                                >
                                  {providerBadgeLabel(entry.provider)}
                                </Badge>
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
                              <span>{formatDateTime(entry.publishedAt)}</span>
                              {entry.hiddenAt ? (
                                <span className="text-amber-600">أُخفيت يدوياً</span>
                              ) : entry.itemCount ? (
                                <span>{entry.itemCount} فقرات</span>
                              ) : null}
                            </div>
                            {entry.audioUrl && (
                              <audio
                                controls
                                preload="none"
                                src={entry.audioUrl}
                                className="w-full h-7 mt-1"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        )}
      </DashboardPageShell>
    </DashboardLayout>
  );
}
