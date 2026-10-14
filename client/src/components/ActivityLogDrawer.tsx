import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Copy,
  User,
  Clock,
  Database,
  FileText,
  ExternalLink,
  Bot,
  Sparkles,
  Link2,
  Code2,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, formatDistanceToNowStrict } from "date-fns";
import { ar } from "date-fns/locale";
import {
  getActionPresentation,
  getEntityTypeLabel,
  resolveActivityActor,
  extractLogSummary,
  computeStructuredDiff,
} from "@/lib/activityUtils";

interface ActivityLogDrawerProps {
  log?: {
    id: string;
    userId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    oldValue: Record<string, any> | null;
    newValue: Record<string, any> | null;
    metadata: { ip?: string; userAgent?: string; reason?: string; bot?: string; channel?: string } | null;
    createdAt: Date | string;
    user?: {
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      profileImageUrl: string | null;
    } | null;
    entityInfo?: {
      title: string | null;
      subtitle?: string | null;
      url?: string | null;
      status?: string | null;
    } | null;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function toLatinDigits(value: string) {
  return value
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
}

export default function ActivityLogDrawer({ log, open, onOpenChange }: ActivityLogDrawerProps) {
  const { toast } = useToast();
  const [showRawJson, setShowRawJson] = useState(false);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "تم النسخ",
      description: `تم نسخ ${label} بنجاح`,
    });
  };

  const copyJSON = () => {
    if (!log) return;
    const json = JSON.stringify(log, null, 2);
    copyToClipboard(json, "بيانات JSON");
  };

  if (!log) return null;

  const actor = resolveActivityActor(log);
  const summary = extractLogSummary(log);
  const diffs = computeStructuredDiff(log.oldValue, log.newValue);
  const hasBothOldAndNew = Boolean(
    log.oldValue &&
      log.newValue &&
      Object.keys(log.oldValue).length > 0 &&
      Object.keys(log.newValue).length > 0
  );

  const createdAt = typeof log.createdAt === "string" ? new Date(log.createdAt) : log.createdAt;
  const actionPresentation = getActionPresentation(log.action, log.entityType);
  const ActionIcon = actionPresentation.icon;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="sm:max-w-[560px] overflow-y-auto p-5 sm:p-6"
        side="left"
        dir="rtl"
        data-testid="activity-log-drawer"
      >
        <SheetHeader className="text-right space-y-1.5 pb-4 border-b border-border/60">
          <SheetTitle className="flex items-center gap-2.5 text-right text-lg font-bold">
            <div className={`p-2 rounded-xl ${actionPresentation.bgColor} ${actionPresentation.textColor}`}>
              <ActionIcon className="h-5 w-5" />
            </div>
            <span>تفاصيل سجل النشاط</span>
          </SheetTitle>
          <SheetDescription className="text-right text-xs sm:text-sm">
            معلومات تفصيلية دقيقة عن العملية المنفذة والكيان المتأثر
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-5" dir="rtl">
          {/* 1) المنفّذ (المستخدم أو النظام الآلي) */}
          <div data-testid="drawer-user-section">
            <h3 className="text-xs font-semibold text-muted-foreground mb-2.5 flex items-center gap-1.5 text-right">
              <User className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
              <span>المنفّذ</span>
            </h3>
            <div className="flex items-center gap-3 p-3.5 rounded-xl border border-border/70 bg-muted/25">
              {actor.kind === "user" ? (
                <Avatar className="h-10 w-10 shrink-0 border border-border/60">
                  <AvatarImage src={actor.profileImageUrl || undefined} />
                  <AvatarFallback className="text-xs font-bold">{actor.initials}</AvatarFallback>
                </Avatar>
              ) : actor.kind === "ai_system" ? (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
                  <Sparkles className="h-5 w-5" />
                </span>
              ) : actor.kind === "shortlink_system" ? (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300">
                  <Link2 className="h-5 w-5" />
                </span>
              ) : actor.kind === "bot_system" ? (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                  <Bot className="h-5 w-5" />
                </span>
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300">
                  <Bot className="h-5 w-5" />
                </span>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-sm text-foreground">{actor.name}</p>
                  {actor.badge && (
                    <span
                      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${actor.badge.tone}`}
                    >
                      {actor.badge.label}
                    </span>
                  )}
                </div>
                <p
                  className="text-xs text-muted-foreground truncate mt-0.5"
                  dir={actor.kind === "user" ? "ltr" : "rtl"}
                >
                  {actor.subtitle}
                </p>
              </div>

              {log.userId && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => copyToClipboard(log.userId!, "معرف المستخدم")}
                  title="نسخ معرف المستخدم"
                  data-testid="button-copy-user-id"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* 2) بطاقة الكيان المتأثر (العنوان، الرابط، المختصر) */}
          {(summary.title || summary.detail || summary.url) && (
            <div className="rounded-xl border border-sky-200/70 bg-sky-50/40 p-3.5 dark:border-sky-900/40 dark:bg-sky-950/20">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-sky-700 dark:text-sky-300">
                      {getEntityTypeLabel(log.entityType)}
                    </span>
                    {summary.statusLabel && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                        {summary.statusLabel}
                      </Badge>
                    )}
                  </div>
                  {summary.title && (
                    <p className="text-sm font-bold leading-snug text-foreground break-words">
                      {summary.title}
                    </p>
                  )}
                  {summary.detail && summary.detail !== summary.title && (
                    <p className="text-xs text-muted-foreground leading-relaxed break-words">
                      {summary.detail}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {summary.shortCode && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1"
                      onClick={() =>
                        copyToClipboard(`https://sabq.org/s/${summary.shortCode}`, "الرابط المختصر")
                      }
                    >
                      <Copy className="h-3 w-3" />
                      نسخ المختصر
                    </Button>
                  )}
                  {summary.url && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1"
                      asChild
                    >
                      <a href={summary.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3 w-3" />
                        فتح
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          <Separator />

          {/* 3) معلومات العملية */}
          <div data-testid="drawer-action-section">
            <h3 className="text-xs font-semibold text-muted-foreground mb-2.5 flex items-center gap-1.5 text-right">
              <ActionIcon className={`h-3.5 w-3.5 ${actionPresentation.textColor}`} />
              <span>معلومات العملية</span>
            </h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40 border border-border/50">
                <span className="text-xs text-muted-foreground">نوع العملية</span>
                <div className="flex items-center gap-2">
                  <Badge variant={actionPresentation.badgeVariant} data-testid="badge-action">
                    {actionPresentation.label}
                  </Badge>
                  {log.action !== actionPresentation.label && (
                    <code className="text-[11px] text-muted-foreground bg-background px-1.5 py-0.5 rounded border border-border/50" dir="ltr">
                      {log.action}
                    </code>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40 border border-border/50">
                <span className="text-xs text-muted-foreground">نوع الكيان (النطاق)</span>
                <span className="text-xs font-semibold">{getEntityTypeLabel(log.entityType)}</span>
              </div>

              <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-muted/40 border border-border/50">
                <span className="text-xs text-muted-foreground shrink-0">معرّف السجل</span>
                <div className="flex items-center gap-1.5 min-w-0">
                  <code
                    className="text-xs bg-background px-2 py-1 rounded border border-border/60 truncate max-w-[240px]"
                    dir="ltr"
                    title={log.entityId}
                  >
                    {log.entityId}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => copyToClipboard(log.entityId, "معرف الكيان")}
                    title="نسخ معرف الكيان"
                    data-testid="button-copy-entity-id"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* 4) التوقيت */}
          <div data-testid="drawer-time-section">
            <h3 className="text-xs font-semibold text-muted-foreground mb-2.5 flex items-center gap-1.5 text-right">
              <Clock className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
              <span>التوقيت</span>
            </h3>
            <div className="flex items-center justify-between p-3 rounded-xl border border-border/70 bg-muted/20">
              <span className="text-sm font-medium tabular-nums">
                {toLatinDigits(format(createdAt, "d MMMM yyyy — HH:mm:ss", { locale: ar }))}
              </span>
              <Badge variant="secondary" className="text-xs font-normal tabular-nums">
                {toLatinDigits(formatDistanceToNowStrict(createdAt, { addSuffix: true, locale: ar }))}
              </Badge>
            </div>
          </div>

          {/* 5) معلومات تقنية إضافية (Metadata) */}
          {log.metadata && (log.metadata.ip || log.metadata.userAgent || log.metadata.reason || log.metadata.bot) && (
            <>
              <Separator />
              <div data-testid="drawer-metadata-section">
                <h3 className="text-xs font-semibold text-muted-foreground mb-2.5 flex items-center gap-1.5 text-right">
                  <Database className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                  <span>بيانات الجلسة والمصدر</span>
                </h3>
                <div className="space-y-2">
                  {log.metadata.bot && (
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40 border border-border/50">
                      <span className="text-xs text-muted-foreground">البوت المنفّذ:</span>
                      <span className="text-xs font-semibold">{log.metadata.bot}</span>
                    </div>
                  )}
                  {log.metadata.reason && (
                    <div className="p-2.5 rounded-lg bg-muted/40 border border-border/50 text-right">
                      <span className="text-xs text-muted-foreground">السبب:</span>
                      <p className="text-xs font-medium mt-1">{log.metadata.reason}</p>
                    </div>
                  )}
                  {log.metadata.ip && (
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40 border border-border/50">
                      <span className="text-xs text-muted-foreground">عنوان IP:</span>
                      <code className="text-xs bg-background px-2 py-0.5 rounded border border-border/50" dir="ltr">
                        {log.metadata.ip}
                      </code>
                    </div>
                  )}
                  {log.metadata.userAgent && (
                    <div className="p-2.5 rounded-lg bg-muted/40 border border-border/50 text-right">
                      <span className="text-xs text-muted-foreground">المتصفح / العميل:</span>
                      <p className="text-[11px] text-muted-foreground mt-1 break-all text-left" dir="ltr">
                        {log.metadata.userAgent}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* 6) التغييرات والبيانات (عرض منسّق + خيار JSON الخام) */}
          {(log.oldValue || log.newValue) && (
            <>
              <Separator />
              <div data-testid="drawer-values-section" className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 text-right">
                    <FileText className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                    <span>{hasBothOldAndNew ? "الحقول المعدّلة" : "بيانات العملية"}</span>
                    {diffs.length > 0 && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 tabular-nums">
                        {diffs.length}
                      </Badge>
                    )}
                  </h3>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowRawJson((prev) => !prev)}
                  >
                    <Code2 className="h-3.5 w-3.5" />
                    <span>{showRawJson ? "إخفاء JSON الخام" : "عرض JSON الخام"}</span>
                    {showRawJson ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </Button>
                </div>

                {/* عرض منظّم للحقول المتغيرة أو المضافة */}
                {diffs.length > 0 ? (
                  <div className="space-y-2">
                    {diffs.map((item) => (
                      <div
                        key={item.key}
                        className="rounded-xl border border-border/70 bg-muted/20 p-3 space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-foreground">{item.label}</span>
                          {item.isUrl && item.newFormatted && item.newFormatted !== "—" && (
                            <a
                              href={item.newFormatted}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-sky-600 hover:underline dark:text-sky-400"
                            >
                              <ExternalLink className="h-3 w-3" />
                              فتح الرابط
                            </a>
                          )}
                        </div>

                        {hasBothOldAndNew ? (
                          <div className="grid gap-1.5 text-xs">
                            <div className="rounded-lg border border-rose-200/60 bg-rose-50/50 px-2.5 py-1.5 text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/25 dark:text-rose-200">
                              <span className="text-[10px] font-semibold opacity-75 block mb-0.5">
                                القيمة السابقة:
                              </span>
                              <span
                                className="break-words leading-relaxed block"
                                dir={item.isUrl ? "ltr" : "auto"}
                              >
                                {item.oldFormatted}
                              </span>
                            </div>
                            <div className="rounded-lg border border-emerald-200/60 bg-emerald-50/50 px-2.5 py-1.5 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/25 dark:text-emerald-200">
                              <span className="text-[10px] font-semibold opacity-75 flex items-center gap-1 mb-0.5">
                                <ArrowLeft className="h-3 w-3" />
                                القيمة الجديدة:
                              </span>
                              <span
                                className="break-words leading-relaxed block font-medium"
                                dir={item.isUrl ? "ltr" : "auto"}
                              >
                                {item.newFormatted}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <p
                            className="text-xs text-muted-foreground break-words leading-relaxed bg-background/80 rounded-lg px-2.5 py-1.5 border border-border/50"
                            dir={item.isUrl || item.key === "shortCode" ? "ltr" : "auto"}
                          >
                            {item.newFormatted ?? item.oldFormatted ?? "—"}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground p-3 rounded-lg bg-muted/30 border border-border/50">
                    لا توجد فروقات نصية مسجلة في الحقول الأساسية (يمكنك استعراض JSON الخام أدناه).
                  </p>
                )}

                {/* عرض JSON الخام باتجاه LTR صحيح */}
                {showRawJson && (
                  <div className="space-y-3 pt-2">
                    {log.oldValue && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1.5 text-right">
                          القيمة القديمة (JSON):
                        </p>
                        <pre
                          className="text-xs bg-muted p-3 rounded-lg overflow-x-auto text-left border border-border/60 max-h-64"
                          dir="ltr"
                        >
                          {JSON.stringify(log.oldValue, null, 2)}
                        </pre>
                      </div>
                    )}
                    {log.newValue && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1.5 text-right">
                          القيمة الجديدة (JSON):
                        </p>
                        <pre
                          className="text-xs bg-muted p-3 rounded-lg overflow-x-auto text-left border border-border/60 max-h-64"
                          dir="ltr"
                        >
                          {JSON.stringify(log.newValue, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* 7) أزرار الإجراءات السفلية */}
          <Separator />
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={copyJSON}
              data-testid="button-copy-json"
            >
              <Copy className="h-4 w-4 ml-2" />
              نسخ السجل كاملًا (JSON)
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
