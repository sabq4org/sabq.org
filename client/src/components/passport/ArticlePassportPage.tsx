import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  ShieldCheck,
  Sparkles,
  Image as ImageIcon,
  Search as SearchIcon,
  Clock,
  User as UserIcon,
  ExternalLink,
  Globe,
  Building2,
  ArrowLeft,
  Mail,
  MessageCircle,
  PencilLine,
  Lock,
  Star,
} from "lucide-react";

type Language = "ar" | "en" | "ur";

interface PassportPerson {
  id: string;
  firstName: string | null;
  lastName: string | null;
  firstNameEn: string | null;
  lastNameEn: string | null;
  profileImageUrl: string | null;
  role: string | null;
}

type PassportEventSource = "article_events" | "audit_log" | "synthetic";

interface PassportTimelineEvent {
  id: string;
  eventType: string;
  summary: string | null;
  createdAt: string;
  actor: PassportPerson | null;
  source: PassportEventSource;
  details: Record<string, unknown> | null;
}

interface AiImageGeneration {
  id: string;
  prompt: string | null;
  model: string;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  createdAt: string;
}

interface SeoHistoryLatest {
  id: string;
  version: number;
  provider: string;
  model: string;
  status: string | null;
  manualOverride: boolean | null;
  generatedBy: string | null;
  generatedByName: string | null;
  createdAt: string;
}

type InboundChannel = "manual" | "email" | "whatsapp" | "publisher" | "external";

interface PassportData {
  language: Language;
  viewer: { isStaff: boolean };
  article: {
    id: string;
    title: string;
    subtitle: string | null;
    slug: string;
    excerpt: string | null;
    imageUrl: string | null;
    articleType: string;
    status: string;
    publishedAt: string | null;
    createdAt: string;
    updatedAt: string;
    category: { id: string; name: string; slug: string } | null;
    credibilityScore: number | null;
    verifiedAt: string | null;
    isPublisherNews: boolean;
    canonicalUrl: string | null;
  };
  source: {
    channel: InboundChannel;
    rawSource: string | null;
    sourceUrl: string | null;
    inbound: {
      from: string | null;
      hasOriginalMessage: boolean;
      type: string | null;
    } | null;
    additionalLinks: string[];
  };
  people: {
    author: PassportPerson | null;
    submitter: PassportPerson | null;
    reporter: PassportPerson | null;
    reviewer: PassportPerson | null;
    verifier: PassportPerson | null;
    publisherApprover: PassportPerson | null;
  };
  publisher: {
    id: string;
    agencyName: string;
    agencyNameEn: string | null;
    logoUrl: string | null;
  } | null;
  aiFootprint: {
    body: {
      tier: "human" | "assisted" | "ai_drafted";
      aiGenerated: boolean;
      hasSummary: boolean;
      hasBullets: boolean;
      aiEditCount: number;
    };
    cover: {
      isAiGenerated: boolean;
      model: string | null;
      prompt: string | null;
    };
    seo: {
      status: string | null;
      version: number | null;
      provider: string | null;
      model: string | null;
      generatedBy: string | null;
      manualOverride: boolean | null;
      generatedAt: string | null;
    };
    percentages: {
      body: number;
      cover: number;
      seo: number;
      total: number;
    };
    explanation: { ar: string; en: string; ur: string };
  };
  trustBadge: {
    tier: "human_edited" | "ai_assisted" | "ai_drafted_human_reviewed";
    label: { ar: string; en: string; ur: string };
    credibilityScore: number | null;
  };
  aiImageGenerations: AiImageGeneration[];
  seoHistoryLatest: SeoHistoryLatest | null;
  timeline: PassportTimelineEvent[];
}

const TEXT = {
  ar: {
    backHome: "العودة إلى المقال",
    title: "جواز سفر المحتوى",
    subtitle: "بصمة سبق الرقمية — مصدر المقال، صناعه، وأثر الذكاء الاصطناعي",
    publishedAt: "تاريخ النشر",
    createdAt: "تاريخ الإنشاء",
    updatedAt: "آخر تحديث",
    category: "التصنيف",
    type: "نوع المقال",
    sectionTimeline: "الخط الزمني وسجل التحرير",
    sectionPeople: "صناع المحتوى",
    sectionSources: "المصادر",
    sectionAi: "أثر الذكاء الاصطناعي",
    sectionSeo: "بصمة الـ SEO",
    sectionImages: "الصور المُولَّدة بالذكاء الاصطناعي",
    sectionPublisher: "الناشر",
    sectionTrust: "شارة الثقة",
    body: "المحتوى",
    cover: "الصورة الرئيسية",
    seo: "تحسين محركات البحث",
    aiBody: { human: "كتابة بشرية", assisted: "بمساعدة الذكاء الاصطناعي", ai_drafted: "مسودة بالذكاء الاصطناعي" },
    aiCoverYes: "صورة مُولَّدة بالذكاء الاصطناعي",
    aiCoverNo: "صورة من مصدر بشري",
    aiSeoGenerated: "مُولَّد بواسطة",
    aiSeoManual: "تم تعديله يدويًا",
    aiSeoVersion: "الإصدار",
    aiTotal: "نسبة مساهمة الذكاء الاصطناعي الإجمالية",
    aiExplanation: "شرح",
    role: { author: "كاتب", submitter: "مُرسِل", reporter: "مراسل", reviewer: "مراجع", verifier: "مدقق", publisherApprover: "اعتماد الناشر" },
    eventType: { created: "تم الإنشاء", create: "تم الإنشاء", submitted: "تم الإرسال", approved: "تم الاعتماد", approve: "تم الاعتماد", rejected: "تم الرفض", reject: "تم الرفض", published: "تم النشر", publish: "تم النشر", updated: "تم التحديث", update: "تم التحديث", verified: "تم التحقق", verify: "تم التحقق", unpublish: "تم إلغاء النشر" } as Record<string, string>,
    eventSource: { article_events: "سجل الأحداث", audit_log: "سجل التدقيق", synthetic: "مُستنتج" } as Record<PassportEventSource, string>,
    noTimeline: "لا توجد أحداث مسجلة",
    noPeople: "لا يوجد صناع مسجلون",
    noImages: "لم تُستخدم أي صور مُولَّدة بالذكاء الاصطناعي في هذا المقال",
    noSeoHistory: "لا توجد سجلات SEO",
    noSource: "لا توجد مصادر خارجية",
    sourceLink: "الرابط الأصلي",
    notFoundTitle: "الجواز غير متاح",
    notFoundDesc: "لا يتوفر جواز محتوى لهذا المقال. يجب أن يكون منشورًا أولاً.",
    badgeNote: "تشير شارة الثقة إلى مدى مساهمة الذكاء الاصطناعي مقارنةً بالمراجعة البشرية في هذا المقال.",
    credibility: "درجة المصداقية",
    inboundChannel: "قناة الاستلام",
    channels: { manual: "يدوي", email: "بريد إلكتروني", whatsapp: "واتساب", publisher: "ناشر", external: "خارجي" } as Record<InboundChannel, string>,
    inboundFrom: "من",
    hasOriginalMessage: "الرسالة الأصلية محفوظة",
    staffOnly: "للموظفين فقط",
    changeDetails: "تفاصيل التغيير",
    promptStaffOnly: "النص الموجِّه (Prompt) متاح للموظفين فقط",
    additionalLinks: "روابط إضافية",
    aiEdits: "تعديلات الذكاء الاصطناعي",
    aiEditsCount: (n: number) => `${n} تعديلات بالذكاء الاصطناعي مسجلة`,
    language: "اللغة",
    languageNames: { ar: "العربية", en: "الإنجليزية", ur: "الأردية" } as Record<Language, string>,
    seoTitle: (articleTitle: string) => `كيف نشأ هذا الخبر؟ — ${articleTitle}`,
  },
  en: {
    backHome: "Back to article",
    title: "Content Passport",
    subtitle: "Sabq's digital fingerprint — source, contributors, and AI footprint",
    publishedAt: "Published at",
    createdAt: "Created at",
    updatedAt: "Last updated",
    category: "Category",
    type: "Article type",
    sectionTimeline: "Timeline & edit history",
    sectionPeople: "Contributors",
    sectionSources: "Sources",
    sectionAi: "AI footprint",
    sectionSeo: "SEO footprint",
    sectionImages: "AI-generated images",
    sectionPublisher: "Publisher",
    sectionTrust: "Trust badge",
    body: "Body",
    cover: "Cover image",
    seo: "Search optimization",
    aiBody: { human: "Human-written", assisted: "AI-assisted", ai_drafted: "AI-drafted" },
    aiCoverYes: "AI-generated image",
    aiCoverNo: "Human-sourced image",
    aiSeoGenerated: "Generated by",
    aiSeoManual: "Manually edited",
    aiSeoVersion: "Version",
    aiTotal: "Overall AI contribution",
    aiExplanation: "Explanation",
    role: { author: "Author", submitter: "Submitter", reporter: "Reporter", reviewer: "Reviewer", verifier: "Verifier", publisherApprover: "Publisher approval" },
    eventType: { created: "Created", create: "Created", submitted: "Submitted", approved: "Approved", approve: "Approved", rejected: "Rejected", reject: "Rejected", published: "Published", publish: "Published", updated: "Updated", update: "Updated", verified: "Verified", verify: "Verified", unpublish: "Unpublished" } as Record<string, string>,
    eventSource: { article_events: "Event log", audit_log: "Audit log", synthetic: "Inferred" } as Record<PassportEventSource, string>,
    noTimeline: "No recorded events",
    noPeople: "No recorded contributors",
    noImages: "No AI-generated images were used in this article",
    noSeoHistory: "No SEO history",
    noSource: "No external sources",
    sourceLink: "Original source",
    notFoundTitle: "Passport unavailable",
    notFoundDesc: "No content passport is available for this article. It must be published first.",
    badgeNote: "The trust badge indicates the level of AI contribution versus human review for this article.",
    credibility: "Credibility score",
    inboundChannel: "Inbound channel",
    channels: { manual: "Manual", email: "Email", whatsapp: "WhatsApp", publisher: "Publisher", external: "External" } as Record<InboundChannel, string>,
    inboundFrom: "From",
    hasOriginalMessage: "Original message archived",
    staffOnly: "Staff only",
    changeDetails: "Change details",
    promptStaffOnly: "Prompt is visible to staff only",
    additionalLinks: "Additional links",
    aiEdits: "AI edits",
    aiEditsCount: (n: number) => `${n} AI edit${n === 1 ? "" : "s"} recorded`,
    language: "Language",
    languageNames: { ar: "Arabic", en: "English", ur: "Urdu" } as Record<Language, string>,
    seoTitle: (articleTitle: string) => `How did this story come to be? — ${articleTitle}`,
  },
  ur: {
    backHome: "مضمون پر واپس جائیں",
    title: "مواد کا پاسپورٹ",
    subtitle: "سبق کا ڈیجیٹل فنگر پرنٹ — ماخذ، تخلیق کار، اور AI کی کارکردگی",
    publishedAt: "تاریخ اشاعت",
    createdAt: "تاریخ تخلیق",
    updatedAt: "آخری اپ ڈیٹ",
    category: "زمرہ",
    type: "مضمون کی قسم",
    sectionTimeline: "ٹائم لائن اور ترمیمی تاریخ",
    sectionPeople: "تخلیق کار",
    sectionSources: "ماخذ",
    sectionAi: "AI کی کارکردگی",
    sectionSeo: "SEO فنگر پرنٹ",
    sectionImages: "AI سے تیار کردہ تصاویر",
    sectionPublisher: "پبلشر",
    sectionTrust: "اعتماد کا بیج",
    body: "مواد",
    cover: "سرورق تصویر",
    seo: "تلاش کی اصلاح",
    aiBody: { human: "انسانی تحریر", assisted: "AI کی مدد سے", ai_drafted: "AI کا مسودہ" },
    aiCoverYes: "AI سے تیار کردہ تصویر",
    aiCoverNo: "انسانی ماخذ کی تصویر",
    aiSeoGenerated: "تیار کردہ از",
    aiSeoManual: "دستی طور پر ترمیم شدہ",
    aiSeoVersion: "ورژن",
    aiTotal: "AI کی مجموعی شراکت",
    aiExplanation: "وضاحت",
    role: { author: "مصنف", submitter: "بھیجنے والا", reporter: "نمائندہ", reviewer: "جائزہ کار", verifier: "تصدیق کار", publisherApprover: "پبلشر کی منظوری" },
    eventType: { created: "تخلیق کیا گیا", create: "تخلیق کیا گیا", submitted: "بھیجا گیا", approved: "منظور کیا گیا", approve: "منظور کیا گیا", rejected: "مسترد کیا گیا", reject: "مسترد کیا گیا", published: "شائع کیا گیا", publish: "شائع کیا گیا", updated: "اپ ڈیٹ کیا گیا", update: "اپ ڈیٹ کیا گیا", verified: "تصدیق شدہ", verify: "تصدیق شدہ", unpublish: "اشاعت ختم" } as Record<string, string>,
    eventSource: { article_events: "ایونٹ لاگ", audit_log: "آڈٹ لاگ", synthetic: "اخذ شدہ" } as Record<PassportEventSource, string>,
    noTimeline: "کوئی ریکارڈ شدہ واقعہ نہیں",
    noPeople: "کوئی ریکارڈ شدہ تخلیق کار نہیں",
    noImages: "اس مضمون میں کوئی AI تصویر استعمال نہیں ہوئی",
    noSeoHistory: "کوئی SEO تاریخ نہیں",
    noSource: "کوئی بیرونی ماخذ نہیں",
    sourceLink: "اصل ماخذ",
    notFoundTitle: "پاسپورٹ دستیاب نہیں",
    notFoundDesc: "اس مضمون کے لیے پاسپورٹ دستیاب نہیں۔ پہلے اسے شائع ہونا چاہیے۔",
    badgeNote: "اعتماد کا بیج اس مضمون میں AI کے حصے بمقابلہ انسانی جائزے کی نشاندہی کرتا ہے۔",
    credibility: "اعتبار کا اسکور",
    inboundChannel: "وصولی کا ذریعہ",
    channels: { manual: "دستی", email: "ای میل", whatsapp: "واٹس ایپ", publisher: "پبلشر", external: "بیرونی" } as Record<InboundChannel, string>,
    inboundFrom: "از",
    hasOriginalMessage: "اصل پیغام محفوظ",
    staffOnly: "صرف عملے کے لیے",
    changeDetails: "تبدیلی کی تفصیل",
    promptStaffOnly: "پرومپٹ صرف عملے کو نظر آتا ہے",
    additionalLinks: "اضافی روابط",
    aiEdits: "AI ترامیم",
    aiEditsCount: (n: number) => `${n} AI ترامیم درج شدہ`,
    language: "زبان",
    languageNames: { ar: "عربی", en: "انگریزی", ur: "اردو" } as Record<Language, string>,
    seoTitle: (articleTitle: string) => `یہ خبر کیسے بنی؟ — ${articleTitle}`,
  },
} as const;

function getApiUrl(slug: string, language: Language): string {
  if (language === "en") return `/api/en/articles/${slug}/passport`;
  if (language === "ur") return `/api/ur/articles/${slug}/passport`;
  return `/api/articles/${slug}/passport`;
}

function getArticleUrl(slug: string, language: Language): string {
  if (language === "en") return `/en/article/${slug}`;
  if (language === "ur") return `/ur/article/${slug}`;
  return `/article/${slug}`;
}

function formatDate(value: string | null | undefined, language: Language): string {
  if (!value) return "—";
  try {
    const d = new Date(value);
    const locale = language === "ar" ? "ar-SA" : language === "ur" ? "ur-PK" : "en-US";
    return d.toLocaleString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function getPersonName(person: PassportPerson, language: Language): string {
  if (language === "en") {
    return [person.firstNameEn || person.firstName, person.lastNameEn || person.lastName]
      .filter(Boolean)
      .join(" ") || "—";
  }
  return [person.firstName, person.lastName].filter(Boolean).join(" ") || "—";
}

function PersonRow({ person, role, language }: { person: PassportPerson; role: string; language: Language }) {
  const initials = getPersonName(person, language).slice(0, 2).toUpperCase();
  return (
    <div
      className="flex items-center gap-3 rounded-md border p-3 hover-elevate"
      data-testid={`person-${role}`}
    >
      <Avatar className="h-10 w-10">
        {person.profileImageUrl && <AvatarImage src={person.profileImageUrl} alt={getPersonName(person, language)} />}
        <AvatarFallback>{initials || <UserIcon className="h-4 w-4" />}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate" data-testid={`text-person-name-${role}`}>
          {getPersonName(person, language)}
        </div>
        <div className="text-xs text-muted-foreground">{role}</div>
      </div>
    </div>
  );
}

function TrustBadgeIcon({ tier }: { tier: PassportData["trustBadge"]["tier"] }) {
  const colorClass =
    tier === "human_edited"
      ? "text-green-600 dark:text-green-400"
      : tier === "ai_assisted"
        ? "text-blue-600 dark:text-blue-400"
        : "text-amber-600 dark:text-amber-400";
  return <ShieldCheck className={`h-6 w-6 ${colorClass}`} />;
}

function ChannelIcon({ channel }: { channel: InboundChannel }) {
  if (channel === "email") return <Mail className="h-3 w-3" />;
  if (channel === "whatsapp") return <MessageCircle className="h-3 w-3" />;
  if (channel === "publisher") return <Building2 className="h-3 w-3" />;
  if (channel === "external") return <Globe className="h-3 w-3" />;
  return <PencilLine className="h-3 w-3" />;
}

/** Set or update a `<meta>` tag in document.head */
function setMetaTag(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
  el.setAttribute("data-passport-managed", "true");
}

function setLinkRel(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"][data-passport-managed="true"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    el.setAttribute("data-passport-managed", "true");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

function clearManagedMeta() {
  document.head
    .querySelectorAll('[data-passport-managed="true"]')
    .forEach((el) => el.parentElement?.removeChild(el));
}

interface ArticlePassportPageProps {
  language: Language;
}

export function ArticlePassportPage({ language }: ArticlePassportPageProps) {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const t = TEXT[language];
  const dir = language === "en" ? "ltr" : "rtl";

  const { data: passport, isLoading, isError } = useQuery<PassportData>({
    queryKey: [getApiUrl(slug, language)],
    enabled: !!slug,
  });

  // SEO: title + meta description + canonical + Open Graph
  useEffect(() => {
    if (!passport?.article) return;
    const a = passport.article;
    const titleText = t.seoTitle(a.title);
    document.title = titleText;
    const description = a.excerpt || a.subtitle || t.subtitle;
    setMetaTag("name", "description", description);
    setMetaTag("property", "og:title", titleText);
    setMetaTag("property", "og:description", description);
    setMetaTag("property", "og:type", "article");
    if (a.imageUrl) setMetaTag("property", "og:image", a.imageUrl);
    if (a.canonicalUrl) {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const fullUrl = `${origin}${a.canonicalUrl}/passport`;
      setLinkRel("canonical", fullUrl);
      setMetaTag("property", "og:url", fullUrl);
    }
    return () => {
      clearManagedMeta();
    };
  }, [passport, t]);

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-4xl py-8 px-4 space-y-6" dir={dir}>
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (isError || !passport) {
    return (
      <div className="container mx-auto max-w-2xl py-12 px-4 text-center space-y-4" dir={dir}>
        <ShieldCheck className="h-12 w-12 mx-auto text-muted-foreground" />
        <h1 className="text-2xl font-bold" data-testid="text-passport-not-found">{t.notFoundTitle}</h1>
        <p className="text-muted-foreground">{t.notFoundDesc}</p>
        {slug && (
          <Link href={getArticleUrl(slug, language)}>
            <Button variant="outline" data-testid="button-back-to-article">
              <ArrowLeft className="h-4 w-4" />
              <span>{t.backHome}</span>
            </Button>
          </Link>
        )}
      </div>
    );
  }

  const a = passport.article;
  const people = passport.people;
  const ai = passport.aiFootprint;
  const src = passport.source;
  const peopleEntries: Array<[keyof typeof people, PassportPerson | null, string]> = [
    ["submitter", people.submitter, t.role.submitter],
    ["reporter", people.reporter, t.role.reporter],
    ["reviewer", people.reviewer, t.role.reviewer],
    ["verifier", people.verifier, t.role.verifier],
    ["publisherApprover", people.publisherApprover, t.role.publisherApprover],
  ];
  const filledPeople = peopleEntries.filter(([, p]) => !!p) as Array<
    [keyof typeof people, PassportPerson, string]
  >;

  const showSources =
    !!src.rawSource ||
    !!src.sourceUrl ||
    !!passport.publisher ||
    !!src.inbound ||
    src.additionalLinks.length > 0 ||
    src.channel !== "manual";

  return (
    <div className="container mx-auto max-w-4xl py-8 px-4 space-y-6" dir={dir}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-2">
          <Link href={getArticleUrl(a.slug, language)}>
            <Button variant="ghost" size="sm" data-testid="button-back-article">
              <ArrowLeft className="h-4 w-4" />
              <span>{t.backHome}</span>
            </Button>
          </Link>
          <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="text-passport-page-title">
            <ShieldCheck className="h-7 w-7 text-primary" />
            {t.title}
          </h1>
          <p className="text-muted-foreground">{t.subtitle}</p>
        </div>
      </div>

      {/* Article summary */}
      <Card>
        <CardContent className="p-5 space-y-4">
          {a.imageUrl && (
            <div
              className="overflow-hidden rounded-md border bg-muted"
              data-testid="block-passport-cover"
            >
              <img
                src={a.imageUrl}
                alt={a.title}
                className="w-full h-auto max-h-80 object-cover"
                data-testid="img-passport-cover"
              />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {a.category && (
              <Badge variant="secondary" data-testid="badge-category">{a.category.name}</Badge>
            )}
            <Badge variant="outline" data-testid="badge-article-type">{a.articleType}</Badge>
            <Badge variant="outline" data-testid="badge-status">{a.status}</Badge>
            <Badge
              variant="outline"
              className="uppercase"
              data-testid={`badge-language-${passport.language}`}
            >
              {t.language}: {t.languageNames[passport.language]}
            </Badge>
          </div>
          <h2 className="text-2xl font-semibold leading-snug" data-testid="text-article-title">{a.title}</h2>
          {a.subtitle && <p className="text-base text-muted-foreground">{a.subtitle}</p>}
          {a.excerpt && <p className="text-sm text-muted-foreground leading-relaxed">{a.excerpt}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">{t.publishedAt}</div>
              <div data-testid="text-published-at">{formatDate(a.publishedAt, language)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t.createdAt}</div>
              <div data-testid="text-created-at">{formatDate(a.createdAt, language)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t.updatedAt}</div>
              <div data-testid="text-updated-at">{formatDate(a.updatedAt, language)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Trust badge */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrustBadgeIcon tier={passport.trustBadge.tier} />
            {t.sectionTrust}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="default"
              className="text-sm"
              data-testid={`badge-trust-${passport.trustBadge.tier}`}
            >
              {passport.trustBadge.label[language]}
            </Badge>
            {passport.trustBadge.credibilityScore !== null && (
              <Badge
                variant="outline"
                className="text-sm"
                data-testid="badge-credibility"
              >
                <Star className="h-3 w-3" />
                {t.credibility}: {passport.trustBadge.credibilityScore}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{t.badgeNote}</p>
        </CardContent>
      </Card>

      {/* AI Footprint */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5" />
            {t.sectionAi}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Total */}
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium">{t.aiTotal}</div>
              <div className="text-sm font-semibold tabular-nums" data-testid="text-ai-total-pct">
                {ai.percentages.total}%
              </div>
            </div>
            <Progress value={ai.percentages.total} className="h-2" data-testid="progress-ai-total" />
            <div className="text-xs text-muted-foreground leading-relaxed" data-testid="text-ai-explanation">
              {ai.explanation[language]}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Body */}
            <div className="rounded-md border p-3 space-y-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                {t.body}
              </div>
              <div className="text-sm font-medium" data-testid="text-ai-body-tier">
                {t.aiBody[ai.body.tier]}
              </div>
              <div className="flex items-center justify-between gap-2">
                <Progress value={ai.percentages.body} className="h-1.5 flex-1" />
                <span className="text-xs tabular-nums" data-testid="text-ai-body-pct">
                  {ai.percentages.body}%
                </span>
              </div>
              {ai.body.aiEditCount > 0 && (
                <div
                  className="text-[11px] text-muted-foreground inline-flex items-center gap-1"
                  data-testid="text-ai-edit-count"
                >
                  <PencilLine className="h-3 w-3" />
                  {t.aiEditsCount(ai.body.aiEditCount)}
                </div>
              )}
            </div>
            {/* Cover */}
            <div className="rounded-md border p-3 space-y-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <ImageIcon className="h-3 w-3" />
                {t.cover}
              </div>
              <div className="text-sm font-medium" data-testid="text-ai-cover">
                {ai.cover.isAiGenerated ? t.aiCoverYes : t.aiCoverNo}
              </div>
              {ai.cover.isAiGenerated && ai.cover.model && (
                <div className="text-xs text-muted-foreground">{ai.cover.model}</div>
              )}
              <div className="flex items-center justify-between gap-2">
                <Progress value={ai.percentages.cover} className="h-1.5 flex-1" />
                <span className="text-xs tabular-nums" data-testid="text-ai-cover-pct">
                  {ai.percentages.cover}%
                </span>
              </div>
              {ai.cover.isAiGenerated && (
                <div className="text-[11px] text-muted-foreground italic">
                  {ai.cover.prompt ? (
                    <span data-testid="text-ai-cover-prompt">{ai.cover.prompt}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1" data-testid="text-ai-cover-prompt-locked">
                      <Lock className="h-3 w-3" />
                      {t.promptStaffOnly}
                    </span>
                  )}
                </div>
              )}
            </div>
            {/* SEO */}
            <div className="rounded-md border p-3 space-y-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <SearchIcon className="h-3 w-3" />
                {t.seo}
              </div>
              <div className="text-sm font-medium" data-testid="text-ai-seo">
                {ai.seo.status || "—"}
              </div>
              {ai.seo.provider && (
                <div className="text-xs text-muted-foreground">
                  {ai.seo.provider}
                  {ai.seo.model ? ` · ${ai.seo.model}` : ""}
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <Progress value={ai.percentages.seo} className="h-1.5 flex-1" />
                <span className="text-xs tabular-nums" data-testid="text-ai-seo-pct">
                  {ai.percentages.seo}%
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* People */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserIcon className="h-5 w-5" />
            {t.sectionPeople}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filledPeople.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="text-no-people">{t.noPeople}</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filledPeople.map(([key, person, label]) => (
                <PersonRow key={key as string} person={person} role={label} language={language} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sources */}
      {showSources && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Globe className="h-5 w-5" />
              {t.sectionSources}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-muted-foreground">{t.inboundChannel}:</span>
              <Badge
                variant="secondary"
                className="text-xs"
                data-testid={`badge-channel-${src.channel}`}
              >
                <ChannelIcon channel={src.channel} />
                {t.channels[src.channel]}
              </Badge>
              {src.rawSource && src.rawSource !== src.channel && (
                <Badge variant="outline" className="text-xs" data-testid="badge-raw-source">
                  {src.rawSource}
                </Badge>
              )}
            </div>
            {src.inbound?.from && (
              <div className="text-sm" data-testid="text-inbound-from">
                <span className="text-muted-foreground">{t.inboundFrom}:</span>{" "}
                <span className="font-medium">{src.inbound.from}</span>
              </div>
            )}
            {src.inbound?.hasOriginalMessage && (
              <Badge variant="outline" className="text-xs" data-testid="badge-original-message">
                {t.hasOriginalMessage}
              </Badge>
            )}
            {src.sourceUrl && (
              <a
                href={src.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary inline-flex items-center gap-1 hover:underline"
                data-testid="link-source-url"
              >
                <ExternalLink className="h-3 w-3" />
                {t.sourceLink}
              </a>
            )}
            {src.additionalLinks.length > 0 && (
              <div className="space-y-1" data-testid="block-additional-links">
                <div className="text-xs text-muted-foreground">{t.additionalLinks}:</div>
                <ul className="space-y-1 ps-4 list-disc">
                  {src.additionalLinks.map((url) => (
                    <li key={url} className="text-sm break-all">
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary inline-flex items-center gap-1 hover:underline"
                        data-testid={`link-additional-${url}`}
                      >
                        <ExternalLink className="h-3 w-3 flex-shrink-0" />
                        <span className="break-all" dir="ltr">{url}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {passport.publisher && (
              <div className="flex items-center gap-3 rounded-md border p-3" data-testid="block-publisher">
                <Avatar className="h-10 w-10">
                  {passport.publisher.logoUrl && <AvatarImage src={passport.publisher.logoUrl} />}
                  <AvatarFallback>
                    <Building2 className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="text-sm font-medium" data-testid="text-publisher-name">
                    {language === "en" && passport.publisher.agencyNameEn
                      ? passport.publisher.agencyNameEn
                      : passport.publisher.agencyName}
                  </div>
                  <div className="text-xs text-muted-foreground">{t.sectionPublisher}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* SEO history */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <SearchIcon className="h-5 w-5" />
            {t.sectionSeo}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!passport.seoHistoryLatest ? (
            <p className="text-sm text-muted-foreground" data-testid="text-no-seo-history">
              {t.noSeoHistory}
            </p>
          ) : (
            <div className="space-y-2 text-sm" data-testid="block-seo-history">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">
                  {t.aiSeoVersion} {passport.seoHistoryLatest.version}
                </Badge>
                <Badge variant="secondary">{passport.seoHistoryLatest.provider}</Badge>
                <Badge variant="outline">{passport.seoHistoryLatest.model}</Badge>
                {passport.seoHistoryLatest.manualOverride && (
                  <Badge variant="default">{t.aiSeoManual}</Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {t.aiSeoGenerated}: {passport.seoHistoryLatest.generatedByName || passport.seoHistoryLatest.generatedBy || "—"}
                {" · "}
                {formatDate(passport.seoHistoryLatest.createdAt, language)}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI image generations */}
      {passport.aiImageGenerations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ImageIcon className="h-5 w-5" />
              {t.sectionImages}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {passport.aiImageGenerations.map((img) => (
                <div
                  key={img.id}
                  className="space-y-2"
                  data-testid={`block-ai-image-${img.id}`}
                >
                  {img.imageUrl ? (
                    <img
                      src={img.thumbnailUrl || img.imageUrl}
                      alt={img.prompt || img.model}
                      className="w-full aspect-square object-cover rounded-md border"
                    />
                  ) : (
                    <div className="w-full aspect-square rounded-md border bg-muted flex items-center justify-center">
                      <ImageIcon className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground line-clamp-2">
                    {img.prompt ? (
                      img.prompt
                    ) : (
                      <span className="inline-flex items-center gap-1 italic">
                        <Lock className="h-3 w-3" />
                        {t.promptStaffOnly}
                      </span>
                    )}
                  </div>
                  <Badge variant="outline" className="text-[10px]">{img.model}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timeline / Edit history */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="h-5 w-5" />
            {t.sectionTimeline}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {passport.timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="text-no-timeline">{t.noTimeline}</p>
          ) : (
            <ol className="space-y-3" data-testid="list-timeline">
              {passport.timeline.map((event) => {
                const eventLabel =
                  t.eventType[event.eventType] || event.eventType;
                return (
                  <li
                    key={event.id}
                    className="flex items-start gap-3 rounded-md border p-3"
                    data-testid={`item-timeline-${event.id}`}
                  >
                    <div className="mt-0.5">
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="text-xs">{eventLabel}</Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {t.eventSource[event.source]}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(event.createdAt, language)}
                        </span>
                      </div>
                      {event.summary && (
                        <p className="text-sm text-muted-foreground">{event.summary}</p>
                      )}
                      {event.details && passport.viewer.isStaff && (
                        <details className="pt-1" data-testid={`details-event-${event.id}`}>
                          <summary className="text-xs text-muted-foreground cursor-pointer hover:underline inline-flex items-center gap-1">
                            <Lock className="h-3 w-3" />
                            {t.changeDetails} ({t.staffOnly})
                          </summary>
                          <pre className="mt-1 text-[11px] bg-muted/50 rounded p-2 overflow-x-auto leading-relaxed">
                            {JSON.stringify(event.details, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>

      <Separator />
      <div className="text-xs text-muted-foreground text-center pb-6">
        Sabq · {t.title}
      </div>
    </div>
  );
}

export default ArticlePassportPage;
