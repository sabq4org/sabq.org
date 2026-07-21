// ----------------------------------------------------------------------------
// سبق بلس — صفحة المعاينة الداخلية /plus-preview (admin فقط)
//
// محاكاة تجربة «سبق بلس × ولاء ون» على المحفظة الحقيقية: الرصيد يُعرض
// بالريال أولاً، الكتالوج قسائم تجريبية، والاستبدال يخصم نقاطاً فعلية
// ويصدر قسيمة برمز QR حقيقي. التصميم منقول من النموذج المعتمد.
// ----------------------------------------------------------------------------

import { useEffect, useRef, useState, type ComponentType } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  CalendarDays,
  Car,
  Clapperboard,
  Coffee,
  Gift,
  HeartPulse,
  MessageCircle,
  Shirt,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Trophy,
  UtensilsCrossed,
  type LucideProps,
} from "lucide-react";
import { apiRequest, apiUrl, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { SUPERUSER_ROLE_NAMES } from "@shared/rbac-constants";
import { LOYALTY_TIERS } from "@shared/loyalty";
import NotFound from "@/pages/not-found";

type LucideIcon = ComponentType<LucideProps>;

/** أيقونات الفئات — بديل حرف الشريك؛ أقرب لبطاقة المكافأة في التطبيق. */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "مقاهٍ": Coffee,
  صحة: HeartPulse,
  مطاعم: UtensilsCrossed,
  توصيل: Car,
  ترفيه: Clapperboard,
  تسوق: ShoppingBag,
  اتصالات: Smartphone,
  أزياء: Shirt,
};

const EARN_WAYS: { icon: LucideIcon; label: string; value: string; tint: string }[] = [
  { icon: BookOpen, label: "قراءة مقال", value: "+2", tint: "#1793E8" },
  { icon: Sparkles, label: "قراءة عميقة", value: "+3", tint: "#7B6CE0" },
  { icon: MessageCircle, label: "تعليق", value: "+1", tint: "#17A26B" },
  { icon: CalendarDays, label: "دخول يومي", value: "+5 × السلسلة", tint: "#E8A317" },
  { icon: Trophy, label: "فوز توقّع رياضي", value: "حسب البركة", tint: "#C24A4A" },
];

type PlusSummary = {
  totalPoints: number;
  lifetimePoints: number;
  sarValue: number;
  pointsPerSar: number;
  monthPoints: number;
  tier: { level: number; nameAr: string; color: string };
  nextTier: { nameAr: string; minLifetimePoints: number } | null;
  pointsToNext: number;
  predictionMultiplier: number;
};

type PlusReward = {
  id: string;
  partnerName: string;
  offer: string;
  pointsCost: number;
  sarValue: number;
  category: string;
  brandColor: string;
  valueLabel: string;
  remainingStock: number | null;
};

type PlusCatalog = { balance: number; pointsPerSar: number; rewards: PlusReward[] };

type PlusRedemption = {
  id: string;
  partnerName: string;
  offer: string;
  pointsSpent: number;
  status: string;
  redeemedAt: string;
  code: string | null;
  voucherExpiresAt: string | null;
  brandColor: string;
  valueLabel: string;
};

type Voucher = {
  code: string;
  expiresAt: string;
  partnerName: string;
  offer: string;
  valueLabel: string;
  brandColor: string;
  pointsSpent: number;
  redemptionId: string;
};

const walletPassUrl = (redemptionId: string) => apiUrl(`/api/plus-preview/voucher/${redemptionId}/wallet-pass`);

const fmt = (n: number) => n.toLocaleString("en-US");
const sar = (pts: number) => (pts / 500).toFixed(2);

export default function SabqPlusPreview() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const isAdmin =
    !!user &&
    ((user.permissions?.includes("*") ?? false) ||
      (SUPERUSER_ROLE_NAMES as readonly string[]).includes(user.role ?? ""));

  const { data: summaryRaw } = useQuery({
    queryKey: ["/api/plus-preview/summary"],
    enabled: isAdmin,
  });
  const { data: catalogRaw } = useQuery({
    queryKey: ["/api/plus-preview/catalog"],
    enabled: isAdmin,
  });
  const { data: redemptionsRaw } = useQuery({
    queryKey: ["/api/plus-preview/redemptions"],
    enabled: isAdmin,
  });

  const summary = (summaryRaw ?? null) as PlusSummary | null;
  const catalog = (catalogRaw ?? null) as PlusCatalog | null;
  const redemptions = Array.isArray(redemptionsRaw) ? (redemptionsRaw as PlusRedemption[]) : [];

  const [confirmFor, setConfirmFor] = useState<PlusReward | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [voucher, setVoucher] = useState<Voucher | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const confettiRef = useRef<HTMLCanvasElement>(null);

  const redeem = useMutation({
    mutationFn: async (rewardId: string) =>
      apiRequest(`/api/plus-preview/redeem/${rewardId}`, {
        method: "POST",
        body: JSON.stringify({ termsAccepted: true }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: (data: { voucher: Voucher; remainingBalance: number }) => {
      setConfirmFor(null);
      setVoucher(data.voucher);
      queryClient.invalidateQueries({ queryKey: ["/api/plus-preview/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plus-preview/catalog"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plus-preview/redemptions"] });
      burstConfetti(confettiRef.current);
      toast({ title: `خُصمت ${fmt(data.voucher.pointsSpent)} نقطة من رصيدك` });
    },
    onError: (err: any) => {
      setConfirmFor(null);
      toast({ title: "تعذر الاستبدال", description: err?.message ?? "حاول مرة أخرى", variant: "destructive" });
    },
  });

  const removeRedemption = useMutation({
    mutationFn: async (redemptionId: string) =>
      apiRequest(`/api/plus-preview/redemptions/${redemptionId}`, { method: "DELETE" }),
    onSuccess: (data: { refundedPoints: number; remainingBalance: number }, redemptionId) => {
      if (voucher?.redemptionId === redemptionId) setVoucher(null);
      queryClient.invalidateQueries({ queryKey: ["/api/plus-preview/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plus-preview/catalog"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plus-preview/redemptions"] });
      toast({
        title: "أُزيلت القسيمة",
        description: `أُرجعت ${fmt(data.refundedPoints)} نقطة إلى رصيدك. إن كانت مضافة في Apple Wallet فاحذفها يدوياً من هناك (⋯ ← حذف البطاقة).`,
      });
    },
    onError: (err: any) => {
      toast({ title: "تعذر إزالة القسيمة", description: err?.message ?? "حاول مرة أخرى", variant: "destructive" });
    },
  });

  const confirmRemove = (redemptionId: string, partnerName: string) => {
    if (removeRedemption.isPending) return;
    const ok = window.confirm(
      `إزالة قسيمة «${partnerName}»؟\nستُرجع النقاط إلى رصيدك ويُحذف السجل من المعاينة.\n(بطاقة Apple Wallet على جهازك لا تُحذف تلقائياً.)`,
    );
    if (ok) removeRedemption.mutate(redemptionId);
  };

  // رمز QR حقيقي من رقم القسيمة
  useEffect(() => {
    if (!voucher) {
      setQrDataUrl(null);
      return;
    }
    let alive = true;
    import("qrcode").then((QR) =>
      QR.toDataURL(voucher.code, { margin: 1, width: 148 }).then((url: string) => {
        if (alive) setQrDataUrl(url);
      }),
    );
    return () => {
      alive = false;
    };
  }, [voucher]);

  if (authLoading) return null;
  if (!isAdmin) return <NotFound />;

  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.name || "مسؤول النظام";

  return (
    <div className="spp" dir="rtl">
      <style>{PAGE_CSS}</style>

      <div className="spp-preview-note">
        ⚠ معاينة داخلية — هذه الصفحة تجريبية وتظهر لمسؤول النظام فقط، ولا تمثل إطلاقاً رسمياً
      </div>

      <div className="spp-wrap">
        <header className="spp-site">
          <div className="spp-brand">
            <div className="spp-mark">
              سبق<span className="spp-plus"> بلس+</span>
            </div>
            <div className="spp-sub">برنامج عضوية صحيفة سبق</div>
          </div>
          <div className="spp-route-chip">sabq.org/plus-preview</div>
        </header>

        {/* بطاقة العضوية (v2 — كحلي سبق) */}
        <section className="spp-member-card" aria-label="بطاقة العضوية">
          <div className="spp-mc-grid">
            <div>
              <h1 className="spp-mc-name">{displayName}</h1>
              <div className="spp-mc-role">مسؤول النظام · حساب التجربة</div>
              <div className="spp-mc-balance">
                <div className="spp-sar">
                  {summary ? summary.sarValue.toFixed(2) : "…"} <small>ر.س</small>
                </div>
                <div className="spp-pts">{summary ? fmt(summary.totalPoints) : "…"} نقطة</div>
              </div>
              <div className="spp-mc-rate">كل 500 نقطة = 1 ريال سعودي · الاستبدال عبر شركاء ولاء ون</div>
              {summary &&
                (summary.nextTier ? (
                  <div className="spp-tier-max">
                    يفصلك <b>{fmt(summary.pointsToNext)}</b> نقطة عن فئة «{summary.nextTier.nameAr}»
                  </div>
                ) : (
                  <div className="spp-tier-max">وصلت لأعلى فئة — يُحتسب مضاعف السفير على كل مكافآت التوقعات</div>
                ))}
            </div>
            <aside className="spp-mc-side">
              {summary && (
                <>
                  <span className="spp-tier-pill">
                    <span className="spp-dot" style={{ background: summary.tier.color, boxShadow: `0 0 8px ${summary.tier.color}` }} />
                    {summary.tier.nameAr} · الفئة {["", "الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة"][summary.tier.level]}
                  </span>
                  <div className="spp-tier-dots" title="رحلة الفئات الخمس">
                    {LOYALTY_TIERS.map((t) => (
                      <i
                        key={t.level}
                        className={t.level <= summary.tier.level ? "" : "spp-off"}
                        style={
                          t.level <= summary.tier.level
                            ? {
                                background: t.color,
                                ...(t.level === summary.tier.level
                                  ? { boxShadow: `0 0 10px ${t.color}`, width: 13, height: 13 }
                                  : {}),
                              }
                            : undefined
                        }
                      />
                    ))}
                    <span className="spp-tier-dots-lbl">
                      {summary.tier.level === 5 ? "اكتملت الرحلة 5/5" : `الرحلة ${summary.tier.level}/5`}
                    </span>
                  </div>
                </>
              )}
              <div className="spp-mc-meta">
                <div>
                  نقاط مدى الحياة<b>{summary ? fmt(summary.lifetimePoints) : "…"}</b>
                </div>
                <div>
                  نقاط هذا الشهر<b>{summary ? `+${fmt(summary.monthPoints)}` : "…"}</b>
                </div>
                <div>
                  مضاعف التوقعات<b>×{summary?.predictionMultiplier ?? "…"}</b>
                </div>
              </div>
            </aside>
          </div>
        </section>

        {/* كيف تكسب */}
        <h2 className="spp-sec">كيف تكسب النقاط</h2>
        <p className="spp-sec-sub">تُمنح النقاط تلقائيًا أثناء استخدامك سبق — لا حاجة لأي خطوة إضافية.</p>
        <div className="spp-earn-strip">
          {EARN_WAYS.map(({ icon: Icon, label, value, tint }) => (
            <div className="spp-earn" key={label}>
              <span className="spp-ico" style={{ background: `${tint}1a`, color: tint }}>
                <Icon size={18} strokeWidth={2.25} aria-hidden />
              </span>
              <div>
                <div className="spp-lbl">{label}</div>
                <div className="spp-val">{value}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="spp-earn-note">القيم الحالية للإنتاج — جدول الاكتساب الجديد (المكافئ للريال) قيد الاعتماد.</div>

        {/* الكتالوج — بطاقات بعرض عمودين وأيقونة فئة (مطابقة منطق بطاقة التطبيق) */}
        <h2 className="spp-sec">
          استبدل نقاطك{" "}
          <span className="spp-wala-tag">
            <span className="spp-w">W</span> بالتعاون مع ولاء ون
          </span>
        </h2>
        <p className="spp-sec-sub">
          قسائم وخصومات من شركاء ولاء ون. بعد تأكيد الاستبدال تصدر قسيمتك فورًا ببطاقة ورمز QR.{" "}
          <b>أسماء الشركاء أدناه تجريبية للمحاكاة.</b>
        </p>
        <div className="spp-grid">
          {(catalog?.rewards ?? []).map((v) => {
            const can = (catalog?.balance ?? 0) >= v.pointsCost;
            const Icon = CATEGORY_ICONS[v.category] ?? Gift;
            return (
              <div className="spp-voucher" key={v.id}>
                <div className="spp-v-head">
                  <div
                    className="spp-v-thumb"
                    style={{
                      background: `linear-gradient(135deg, ${v.brandColor}33 0%, ${v.brandColor}0d 100%)`,
                    }}
                  >
                    <Icon size={28} strokeWidth={1.75} style={{ color: v.brandColor }} aria-hidden />
                  </div>
                  <div className="spp-v-meta">
                    <div className="spp-v-brand">{v.partnerName}</div>
                    <div className="spp-v-offer">{v.offer}</div>
                    <div className="spp-v-cat">{v.category} · شريك ولاء ون</div>
                  </div>
                </div>
                <div className="spp-v-foot">
                  <div className="spp-v-cost-chip">
                    <Sparkles size={12} strokeWidth={2.5} aria-hidden />
                    <span>
                      {fmt(v.pointsCost)} نقطة
                      <small>≈ {v.sarValue.toFixed(2)} ر.س</small>
                    </span>
                  </div>
                  <button
                    className="spp-btn spp-btn-redeem"
                    disabled={!can || redeem.isPending}
                    onClick={() => {
                      setAgreed(false);
                      setConfirmFor(v);
                    }}
                  >
                    {can ? (
                      <>
                        <Gift size={14} strokeWidth={2.5} aria-hidden /> استبدل
                      </>
                    ) : (
                      "رصيدك لا يكفي"
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* السجل */}
        <h2 className="spp-sec">سجل استبدالاتي</h2>
        <div className="spp-hist">
          {redemptions.length === 0 ? (
            <div className="spp-hist-empty">لا توجد استبدالات بعد — جرّب استبدال أول قسيمة ✨</div>
          ) : (
            redemptions.map((r) => (
              <div className="spp-hist-row" key={r.id}>
                <div>
                  <div className="spp-h-brand">{r.partnerName}</div>
                  <div className="spp-h-date">
                    {new Date(r.redeemedAt).toLocaleDateString("ar-SA-u-nu-latn", { month: "long", day: "numeric" })}
                    {" · "}
                    {r.code ?? ""}
                  </div>
                </div>
                <span className="spp-h-status spp-h-ok">{r.status === "delivered" ? "صادرة" : r.status}</span>
                {r.code && (
                  <a className="spp-h-wallet" href={walletPassUrl(r.id)} title="أضفها إلى Apple Wallet">
                    🎟 Wallet
                  </a>
                )}
                <button
                  type="button"
                  className="spp-h-remove"
                  disabled={removeRedemption.isPending}
                  onClick={() => confirmRemove(r.id, r.partnerName)}
                  title="إزالة القسيمة وإرجاع النقاط"
                >
                  إزالة
                </button>
                <div className="spp-h-pts">−{fmt(r.pointsSpent)} نقطة</div>
              </div>
            ))
          )}
        </div>

        {/* الشروط */}
        <h2 className="spp-sec">الإرشادات وشروط الاستخدام</h2>
        <p className="spp-sec-sub">ملخص توضيحي — الصياغة القانونية النهائية تُعتمد قبل الإطلاق الرسمي.</p>
        <div className="spp-terms">
          <details>
            <summary>اكتساب النقاط وأسقفها</summary>
            <p>
              تُمنح النقاط من قراءة المحتوى والتفاعل والدخول اليومي والتوقعات الرياضية وفق الجدول المعلن، وبأسقف يومية
              مضادة لإساءة الاستخدام. تحتفظ سبق بحق تعديل جدول الاكتساب مع إشعار مسبق، ولا يؤثر التعديل على النقاط
              المكتسبة سابقًا.
            </p>
          </details>
          <details>
            <summary>الاستبدال عبر ولاء ون</summary>
            <p>
              عند تأكيد الاستبدال تُخصم النقاط فورًا من رصيدك وتصدر القسيمة.{" "}
              <b>بعد التأكيد تسري شروط وأحكام ولاء ون ولا يمكن التراجع أو استرداد النقاط.</b> استخدام القسيمة لدى الشريك
              يخضع لشروط الشريك المعلنة وقت الاستخدام.
            </p>
          </details>
          <details>
            <summary>صلاحية النقاط والقسائم</summary>
            <ul>
              <li>نقاط سبق بلس في محفظتك لا تنتهي ما دام حسابك نشطًا.</li>
              <li>القسائم الصادرة عبر ولاء ون تنتهي بعد 12 شهرًا من الإصدار ما لم يُذكر خلاف ذلك على القسيمة.</li>
              <li>العروض الترويجية قد تحمل مددًا أقصر تُوضّح قبل الاستبدال.</li>
            </ul>
          </details>
          <details>
            <summary>حدود المسؤولية</summary>
            <p>
              مسؤولية سبق تقتصر على صحة خصم النقاط وإصدار القسيمة. تأخر الشريك أو تغيير عروضه أو انتهاء مخزونه يخضع
              لشروط ولاء ون والشريك، وفي حال تعذر إصدار القسيمة تُعاد النقاط كاملة إلى رصيدك ولا تُقدَّم تعويضات نقدية.
            </p>
          </details>
          <details>
            <summary>الدعم والنزاعات</summary>
            <p>
              لمشاكل النقاط والرصيد: تواصل مع دعم سبق من صفحة حسابك خلال 15 يومًا من العملية. لمشاكل استخدام القسيمة لدى
              الشريك: تُحال للدعم المختص في ولاء ون مع تزويدك برقم المرجع.
            </p>
          </details>
        </div>

        <footer className="spp-note">
          نموذج محاكاة داخلي لتجربة «سبق بلس × ولاء ون» — أسماء الشركاء تجريبية والخصم من رصيدك فعلي
        </footer>
      </div>

      {/* نافذة التأكيد */}
      {confirmFor && (
        <div className="spp-overlay spp-show" role="dialog" aria-modal="true">
          <div className="spp-modal">
            <h3>تأكيد الاستبدال</h3>
            <p className="spp-m-sub">
              {confirmFor.partnerName} — {confirmFor.offer}
            </p>
            <div className="spp-m-line">
              <span>قيمة القسيمة</span>
              <b>{confirmFor.valueLabel}</b>
            </div>
            <div className="spp-m-line">
              <span>التكلفة</span>
              <b>{fmt(confirmFor.pointsCost)} نقطة</b>
            </div>
            <div className="spp-m-line">
              <span>رصيدك بعد الاستبدال</span>
              <b>
                {fmt((catalog?.balance ?? 0) - confirmFor.pointsCost)} نقطة (≈{" "}
                {sar((catalog?.balance ?? 0) - confirmFor.pointsCost)} ر.س)
              </b>
            </div>
            <div className="spp-m-warn">⚠ بعد التأكيد تسري شروط وأحكام ولاء ون ولا يمكن التراجع أو استرداد النقاط.</div>
            <label className="spp-m-agree">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} /> أوافق على{" "}
              <u>شروط استخدام سبق بلس</u> و<u>شروط وأحكام ولاء ون</u>
            </label>
            <div className="spp-m-actions">
              <button className="spp-btn spp-btn-ghost" onClick={() => setConfirmFor(null)}>
                إلغاء
              </button>
              <button
                className="spp-btn spp-btn-confirm"
                disabled={!agreed || redeem.isPending}
                onClick={() => redeem.mutate(confirmFor.id)}
              >
                {redeem.isPending ? "جارٍ الاستبدال…" : "تأكيد الاستبدال"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* التهنئة + القسيمة */}
      {voucher && (
        <div className="spp-overlay spp-show" role="dialog" aria-modal="true">
          <div className="spp-modal spp-celebrate">
            <div className="spp-big">🎉</div>
            <h3>مبروك! تم الاستبدال</h3>
            <p>قسيمتك من {voucher.partnerName} جاهزة — أبرِزها عند الشريك أو أضفها لمحفظتك</p>
            <div className="spp-pass">
              <div className="spp-p-strip" aria-hidden="true" />
              <div className="spp-p-hero">
                <span className="spp-p-tag">قسيمة سبق بلس</span>
                <div className="spp-p-value">{voucher.valueLabel}</div>
                <div className="spp-p-brand">{voucher.partnerName}</div>
                <div className="spp-p-offer">{voucher.offer}</div>
              </div>
              <div className="spp-p-code">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt={`رمز QR للقسيمة ${voucher.code}`} width={148} height={148} />
                ) : (
                  <div style={{ height: 148 }} />
                )}
                <div className="spp-p-num">{voucher.code}</div>
              </div>
              <div className="spp-p-meta">
                <div className="spp-p-meta-item">
                  <span className="spp-p-meta-label">صالحة حتى</span>
                  <b>
                    {new Date(voucher.expiresAt).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </b>
                </div>
                <div className="spp-p-meta-item spp-p-meta-via">
                  <span className="spp-p-meta-label">عبر</span>
                  <b>ولاء ون</b>
                </div>
              </div>
            </div>
            <a className="spp-apple-wallet" href={walletPassUrl(voucher.redemptionId)}>
              <span className="spp-aw-icon">
                <span className="spp-c1" />
                <span className="spp-c2" />
                <span className="spp-c3" />
                <span className="spp-c4" />
              </span>
              أضفها إلى Apple Wallet
            </a>
            <p className="spp-d-left">
              خُصمت <b>{fmt(voucher.pointsSpent)}</b> نقطة · رصيدك الجديد <b>{summary ? fmt(summary.totalPoints) : ""}</b>{" "}
              نقطة
            </p>
            <div className="spp-m-actions">
              <button
                type="button"
                className="spp-btn spp-btn-ghost spp-btn-danger"
                disabled={removeRedemption.isPending}
                onClick={() => confirmRemove(voucher.redemptionId, voucher.partnerName)}
              >
                إزالة القسيمة
              </button>
              <button className="spp-btn spp-btn-ghost" style={{ flex: 1 }} onClick={() => setVoucher(null)}>
                تم
              </button>
            </div>
          </div>
        </div>
      )}

      <canvas ref={confettiRef} className="spp-confetti" />
    </div>
  );
}

// ----------------------------------------------------------------------------
// قصاصات الاحتفال
// ----------------------------------------------------------------------------
function burstConfetti(cv: HTMLCanvasElement | null) {
  if (!cv || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const ctx = cv.getContext("2d");
  if (!ctx) return;
  cv.width = window.innerWidth;
  cv.height = window.innerHeight;
  const colors = ["#FFC933", "#7B6CE0", "#1793E8", "#17A26B", "#EF4B4B"];
  const parts = Array.from({ length: 120 }, (_, i) => ({
    x: cv.width / 2 + (Math.random() - 0.5) * 200,
    y: cv.height / 2 - 100,
    vx: (Math.random() - 0.5) * 11,
    vy: -Math.random() * 9 - 3,
    s: 4 + Math.random() * 5,
    c: colors[i % colors.length],
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
  }));
  let frames = 0;
  const tick = () => {
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (const p of parts) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.25;
      p.r += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6);
      ctx.restore();
    }
    if (++frames < 140) requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, cv.width, cv.height);
  };
  tick();
}

// ----------------------------------------------------------------------------
// أنماط الصفحة — منقولة من النموذج المعتمد، مع دعم وضع الموقع الداكن (.dark)
// ----------------------------------------------------------------------------
const PAGE_CSS = `
.spp {
  --sabq: #1793E8; --wala: #7B6CE0; --wala-deep: #5F4FD1; --wala-y: #FFC933;
  --ok: #17A26B; --danger: #D64545;
  --paper: #F4F8FC; --card: #FFFFFF; --ink: #13202E; --ink-2: #4A5A6B; --ink-3: #7E8DA0;
  --line: #DCE6F0; --chip-bg: #EAF4FD; --wala-bg: #F1EFFC;
  --card-hero: linear-gradient(135deg, #12283C 0%, #0D1B2A 55%, #14344E 100%);
  --shadow: 0 10px 30px rgba(19, 44, 70, .10);
  background: var(--paper); color: var(--ink); min-height: 100vh; line-height: 1.65;
  font-family: inherit;
}
.dark .spp {
  --paper: #0C141D; --card: #14202D; --ink: #E8EFF6; --ink-2: #A9B8C8; --ink-3: #708096;
  --line: #243446; --chip-bg: #16293C; --wala-bg: #241F3F;
  --card-hero: linear-gradient(135deg, #16293D 0%, #0A1622 55%, #173853 100%);
  --shadow: 0 10px 30px rgba(0, 0, 0, .35);
}
.spp * { box-sizing: border-box; }
.spp-wrap { max-width: 1060px; margin: 0 auto; padding: 0 20px 80px; }
.spp-preview-note {
  background: repeating-linear-gradient(45deg, #FFF3D6, #FFF3D6 12px, #FFEBB8 12px, #FFEBB8 24px);
  color: #6B4E00; font-size: 13px; font-weight: 700; text-align: center; padding: 8px 16px;
}
.dark .spp-preview-note {
  background: repeating-linear-gradient(45deg, #3A2F10, #3A2F10 12px, #453915 12px, #453915 24px);
  color: #FFD976;
}
.spp-site { display: flex; align-items: center; justify-content: space-between; padding: 22px 0 14px; }
.spp-brand { display: flex; align-items: baseline; gap: 10px; }
.spp-mark { font-size: 30px; font-weight: 900; letter-spacing: -.5px; white-space: nowrap; }
.spp-plus { color: var(--sabq); }
.spp-sub { font-size: 13px; color: var(--ink-3); font-weight: 600; }
.spp-route-chip {
  font-size: 12px; font-weight: 700; color: var(--ink-2); border: 1px dashed var(--line);
  border-radius: 999px; padding: 5px 14px; font-variant-numeric: tabular-nums; direction: ltr;
}
.spp-member-card {
  background:
    radial-gradient(560px 340px at 12% 118%, rgba(23,147,232,.32), transparent 65%),
    radial-gradient(500px 320px at 90% -14%, rgba(124,58,237,.30), transparent 62%),
    linear-gradient(120deg, #10233A 0%, #0B1624 48%, #17294A 100%);
  color: #EAF3FB; border-radius: 24px; padding: 32px 36px;
  position: relative; overflow: hidden;
  border: 1px solid rgba(140, 180, 220, .14);
  box-shadow: 0 18px 44px rgba(8, 20, 36, .35), inset 0 1px 0 rgba(255, 255, 255, .07);
}
.spp-member-card::before {
  content: ""; position: absolute; inset: 0 0 auto 0; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.35), transparent);
}
.spp-member-card::after {
  content: "+"; position: absolute; left: -14px; bottom: -110px; font-size: 320px; font-weight: 900;
  color: rgba(23, 147, 232, .09); line-height: 1; pointer-events: none;
}
.spp-mc-grid { display: grid; grid-template-columns: 1fr auto; gap: 22px 48px; align-items: stretch; position: relative; z-index: 1; }
.spp-mc-name { font-size: 22px; font-weight: 800; margin: 0; }
.spp-mc-role { font-size: 13px; color: #9DB6CC; margin-top: 2px; }
.spp-tier-pill {
  display: inline-flex; align-items: center; gap: 8px; background: rgba(124, 58, 237, .22);
  border: 1px solid rgba(167, 122, 250, .55); color: #D9C7FF; font-weight: 800; font-size: 13.5px;
  border-radius: 999px; padding: 7px 16px;
}
.spp-dot { width: 9px; height: 9px; border-radius: 50%; }
.spp-tier-dots { display: flex; gap: 7px; align-items: center; margin: 12px 2px 0; }
.spp-tier-dots i { width: 11px; height: 11px; border-radius: 50%; opacity: .95; }
.spp-tier-dots i.spp-off { background: rgba(255,255,255,.14); }
.spp-tier-dots-lbl { font-size: 11.5px; color: #9DB6CC; margin-right: 6px; }
.spp-mc-balance { margin: 24px 0 6px; display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; }
.spp-sar {
  font-size: 56px; font-weight: 900; letter-spacing: -1.5px; font-variant-numeric: tabular-nums; line-height: 1;
  background: linear-gradient(180deg, #FFFFFF 30%, #A9D6FF); -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent; color: transparent;
}
.spp-sar small {
  font-size: 22px; font-weight: 700;
  background: none; -webkit-text-fill-color: #8FB8D8; color: #8FB8D8;
}
.spp-pts { font-size: 15px; color: #A8C2D8; font-variant-numeric: tabular-nums; }
.spp-mc-rate { font-size: 12.5px; color: #7FA1BC; }
.spp-mc-side {
  display: flex; flex-direction: column; align-items: flex-start; justify-content: flex-start;
  background: rgba(255, 255, 255, .045); border: 1px solid rgba(255, 255, 255, .09);
  border-radius: 16px; padding: 18px 22px; min-width: 220px;
}
.spp-mc-meta { display: flex; flex-direction: column; margin-top: 16px; width: 100%; }
.spp-mc-meta > div {
  font-size: 12.5px; color: #9DB6CC; display: flex; justify-content: space-between; align-items: baseline;
  padding: 9px 0; border-top: 1px solid rgba(255,255,255,.08); gap: 18px;
}
.spp-mc-meta > div:first-child { border-top: 0; padding-top: 2px; }
.spp-mc-meta b { color: #EAF3FB; font-size: 15.5px; font-variant-numeric: tabular-nums; }
.spp-tier-max {
  margin-top: 18px; font-size: 12.5px; color: #C9B8F5; background: rgba(124,58,237,.16);
  border: 1px solid rgba(124,58,237,.25);
  border-radius: 10px; padding: 8px 14px; display: inline-block; position: relative; z-index: 1;
}
.spp-earn-strip {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 18px;
}
.spp-earn {
  background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 12px 16px;
  display: flex; align-items: center; gap: 12px;
}
.spp-ico {
  width: 38px; height: 38px; border-radius: 999px; display: grid; place-items: center; flex-shrink: 0;
}
.spp-lbl { font-size: 13px; color: var(--ink-2); font-weight: 600; }
.spp-val { font-size: 13px; font-weight: 800; color: var(--sabq); font-variant-numeric: tabular-nums; }
.spp-earn-note { font-size: 12px; color: var(--ink-3); margin-top: 8px; }
.spp-sec { font-size: 22px; font-weight: 900; margin: 46px 0 6px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.spp-sec-sub { color: var(--ink-2); font-size: 14px; margin: 0 0 20px; max-width: 65ch; }
.spp-wala-tag {
  display: inline-flex; align-items: center; gap: 7px; background: var(--wala-bg); color: var(--wala);
  font-size: 12.5px; font-weight: 800; border-radius: 999px; padding: 5px 14px;
  border: 1px solid color-mix(in srgb, var(--wala) 30%, transparent);
}
.spp-w { color: var(--wala-y); font-weight: 900; font-size: 15px; }
.spp-grid {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px;
}
@media (max-width: 640px) {
  .spp-grid, .spp-earn-strip { grid-template-columns: 1fr; }
}
.spp-voucher {
  background: var(--card); border: 1px solid var(--line); border-radius: 18px; padding: 14px;
  display: flex; flex-direction: column; gap: 12px; box-shadow: var(--shadow); transition: transform .15s ease;
}
.spp-voucher:hover { transform: translateY(-2px); }
.spp-v-head { display: flex; align-items: flex-start; gap: 12px; }
.spp-v-thumb {
  width: 80px; height: 80px; border-radius: 14px; display: grid; place-items: center; flex-shrink: 0;
}
.spp-v-meta { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 4px; }
.spp-v-brand {
  font-weight: 900; font-size: 10px; letter-spacing: .04em; text-transform: uppercase; color: var(--ink-3);
}
.spp-v-offer { font-weight: 800; font-size: 15px; color: var(--ink); line-height: 1.35; }
.spp-v-cat { font-size: 12px; color: var(--ink-3); }
.spp-v-foot { display: flex; align-items: center; justify-content: space-between; margin-top: auto; gap: 8px; flex-wrap: wrap; }
.spp-v-cost-chip {
  display: inline-flex; align-items: center; gap: 6px; background: color-mix(in srgb, var(--sabq) 12%, transparent);
  color: var(--sabq); border-radius: 999px; padding: 5px 12px; font-weight: 800; font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.spp-v-cost-chip small { display: block; font-weight: 600; color: var(--ink-3); font-size: 11px; }
.spp-btn {
  border: 0; cursor: pointer; font-family: inherit; font-weight: 800; border-radius: 999px;
  padding: 8px 16px; font-size: 13px; transition: filter .15s ease;
  display: inline-flex; align-items: center; gap: 6px;
}
.spp-btn:focus-visible { outline: 3px solid var(--sabq); outline-offset: 2px; }
.spp-btn-redeem { background: var(--wala); color: #fff; }
.spp-btn-redeem:hover:not(:disabled) { filter: brightness(1.08); }
.spp-btn-redeem:disabled { background: var(--line); color: var(--ink-3); cursor: not-allowed; }
.spp-hist { background: var(--card); border: 1px solid var(--line); border-radius: 18px; overflow: hidden; }
.spp-hist-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 15px 22px; border-bottom: 1px solid var(--line); font-size: 14px;
}
.spp-hist-row:last-child { border-bottom: 0; }
.spp-h-brand { font-weight: 700; }
.spp-h-date { color: var(--ink-3); font-size: 12.5px; font-variant-numeric: tabular-nums; }
.spp-h-pts { color: var(--danger); font-weight: 800; font-variant-numeric: tabular-nums; }
.spp-h-wallet {
  font-size: 12px; font-weight: 800; color: var(--wala); text-decoration: none;
  border: 1px solid color-mix(in srgb, var(--wala) 35%, transparent); border-radius: 999px; padding: 4px 12px;
}
.spp-h-wallet:hover { background: var(--wala-bg); }
.spp-h-remove {
  font-size: 12px; font-weight: 800; color: var(--danger); background: transparent; cursor: pointer;
  border: 1px solid color-mix(in srgb, var(--danger) 35%, transparent); border-radius: 999px; padding: 4px 12px;
  font-family: inherit;
}
.spp-h-remove:hover:not(:disabled) { background: color-mix(in srgb, var(--danger) 10%, transparent); }
.spp-h-remove:disabled { opacity: .5; cursor: not-allowed; }
.spp-h-status { font-size: 12px; font-weight: 800; border-radius: 999px; padding: 3px 12px; }
.spp-h-ok { background: color-mix(in srgb, var(--ok) 14%, transparent); color: var(--ok); }
.spp-btn-danger { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 40%, transparent); }
.spp-btn-danger:hover:not(:disabled) { background: color-mix(in srgb, var(--danger) 8%, transparent); }
.spp-hist-empty { padding: 26px; text-align: center; color: var(--ink-3); font-size: 14px; }
.spp-terms { display: flex; flex-direction: column; gap: 10px; }
.spp-terms details { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 0 22px; }
.spp-terms summary {
  cursor: pointer; font-weight: 800; font-size: 15px; padding: 16px 0; list-style: none;
  display: flex; justify-content: space-between; align-items: center;
}
.spp-terms summary::after { content: "﹀"; color: var(--ink-3); font-size: 12px; transition: transform .2s; }
.spp-terms details[open] summary::after { transform: rotate(180deg); }
.spp-terms p, .spp-terms ul { color: var(--ink-2); font-size: 13.5px; margin: 0 0 16px; max-width: 70ch; }
.spp-terms ul { padding-right: 20px; }
.spp-overlay {
  position: fixed; inset: 0; background: rgba(8, 16, 26, .62); display: none;
  align-items: center; justify-content: center; padding: 20px; z-index: 50;
}
.spp-overlay.spp-show { display: flex; }
.spp-modal {
  background: var(--card); border-radius: 22px; max-width: 430px; width: 100%;
  padding: 30px; box-shadow: 0 24px 60px rgba(0,0,0,.35);
  max-height: 92vh; overflow-y: auto;
}
.spp-modal h3 { margin: 0 0 6px; font-size: 19px; font-weight: 900; }
.spp-m-sub { color: var(--ink-2); font-size: 13.5px; margin: 0 0 18px; }
.spp-m-line { display: flex; justify-content: space-between; font-size: 14px; padding: 9px 0; border-bottom: 1px dashed var(--line); font-variant-numeric: tabular-nums; }
.spp-m-line b { font-weight: 800; }
.spp-m-warn {
  background: color-mix(in srgb, var(--wala) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--wala) 30%, transparent);
  color: var(--ink-2); border-radius: 12px; font-size: 12.5px; padding: 11px 14px; margin: 16px 0;
}
.spp-m-agree { display: flex; gap: 9px; align-items: flex-start; font-size: 13px; color: var(--ink-2); margin-bottom: 18px; cursor: pointer; }
.spp-m-agree input { margin-top: 3px; accent-color: var(--wala); width: 16px; height: 16px; }
.spp-m-actions { display: flex; gap: 10px; }
.spp-btn-ghost { background: transparent; color: var(--ink-2); border: 1px solid var(--line); }
.spp-btn-confirm { background: var(--wala); color: #fff; flex: 1; }
.spp-btn-confirm:disabled { background: var(--line); color: var(--ink-3); cursor: not-allowed; }
.spp-celebrate { text-align: center; }
.spp-big { font-size: 54px; line-height: 1; }
.spp-celebrate h3 { font-size: 24px; margin: 10px 0 4px; }
.spp-celebrate > p { color: var(--ink-2); font-size: 14px; margin: 0 0 20px; }
.spp-pass {
  background: linear-gradient(160deg, #12283C 0%, #0D1B2A 52%, #14344E 100%);
  border-radius: 22px; color: #EAF3FB; padding: 0 0 16px; text-align: center; margin-bottom: 18px;
  position: relative; overflow: hidden;
  box-shadow: var(--shadow);
  border-top: 3px solid #1793E8;
}
.spp-p-strip {
  position: absolute; inset: 0; pointer-events: none;
  background:
    radial-gradient(circle at 82% 18%, rgba(23,147,232,.32), transparent 42%),
    radial-gradient(circle at 12% 88%, rgba(23,147,232,.14), transparent 40%);
}
.spp-p-hero {
  position: relative; z-index: 1;
  padding: 22px 22px 18px;
}
.spp-p-tag {
  display: inline-block; font-size: 12px; font-weight: 700; letter-spacing: .02em;
  color: #8FB8D8; margin-bottom: 12px;
}
.spp-p-value {
  font-size: clamp(40px, 11vw, 52px); font-weight: 900; line-height: 1.05;
  font-variant-numeric: tabular-nums; color: #fff; letter-spacing: -0.02em;
  margin: 0 0 10px;
}
.spp-p-brand {
  font-weight: 900; font-size: 20px; line-height: 1.3; color: #EAF3FB;
}
.spp-p-offer {
  font-size: 13.5px; color: #9DB6CC; margin: 8px auto 0; line-height: 1.45;
  max-width: 28ch;
}
.spp-p-code {
  background: #fff; border-radius: 14px; padding: 14px 16px 12px; color: #13202E;
  text-align: center; position: relative; z-index: 1;
  margin: 0 18px;
}
.spp-p-code img { display: inline-block; border-radius: 6px; }
.spp-p-num {
  font-size: 13.5px; letter-spacing: 1.5px; font-weight: 800; margin-top: 8px;
  font-variant-numeric: tabular-nums; direction: ltr; color: #0D1B2A;
}
.spp-p-meta {
  display: flex; justify-content: space-between; gap: 12px;
  padding: 14px 22px 0; position: relative; z-index: 1;
  text-align: right;
}
.spp-p-meta-item { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.spp-p-meta-via { text-align: left; }
.spp-p-meta-label { font-size: 11px; font-weight: 600; color: #8FB8D8; }
.spp-p-meta b { font-size: 13px; font-weight: 800; color: #EAF3FB; }
.spp-apple-wallet {
  display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%;
  background: #000; color: #fff; border-radius: 12px; padding: 12px; font-size: 14.5px; font-weight: 700;
  border: 0; cursor: pointer; font-family: inherit;
}
.spp-apple-wallet:hover { filter: brightness(1.25); }
.spp-aw-icon { width: 26px; height: 20px; border-radius: 4px; overflow: hidden; display: inline-block; position: relative; background: #3C3C43; }
.spp-aw-icon span { position: absolute; left: 0; right: 0; height: 6px; border-radius: 3px 3px 0 0; }
.spp-c1 { top: 0; background: #EF4B4B; }
.spp-c2 { top: 5px; background: #FFC933; }
.spp-c3 { top: 10px; background: #35C77B; }
.spp-c4 { top: 15px; background: #1793E8; height: 5px; }
.spp-d-left { font-size: 12px; color: var(--ink-3); margin: 14px 0 0; }
.spp-confetti { position: fixed; inset: 0; pointer-events: none; z-index: 60; }
.spp-note { margin-top: 60px; color: var(--ink-3); font-size: 12.5px; text-align: center; }
@media (prefers-reduced-motion: reduce) { .spp * { transition: none !important; } }
@media (max-width: 720px) {
  .spp-mc-grid { grid-template-columns: 1fr; gap: 18px; }
  .spp-mc-side { min-width: 0; width: 100%; }
}
@media (max-width: 560px) {
  .spp-site { flex-direction: column; align-items: flex-start; gap: 10px; padding: 18px 0 12px; }
  .spp-brand { flex-direction: column; align-items: flex-start; gap: 2px; }
  .spp-mark { font-size: 26px; }
  .spp-route-chip { font-size: 11px; padding: 4px 12px; }
  .spp-member-card { padding: 22px 18px; border-radius: 18px; }
  .spp-mc-name { font-size: 18px; }
  .spp-tier-pill { font-size: 12.5px; padding: 6px 12px; }
  .spp-sar { font-size: 38px; }
  .spp-sar small { font-size: 17px; }
  .spp-mc-balance { margin-top: 20px; gap: 10px; }
  .spp-mc-meta { gap: 14px 22px; margin-top: 18px; }
  .spp-mc-meta b { font-size: 14px; }
  .spp-sec { font-size: 19px; }
  .spp-hist-row { flex-wrap: wrap; padding: 13px 16px; }
}
`;
