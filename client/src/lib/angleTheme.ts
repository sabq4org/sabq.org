/**
 * مُقترب — اشتقاق الهوية البصرية الديناميكية للزاوية من `colorHex`.
 *
 * كل زاوية تملك لوناً مميزاً (`angles.colorHex`). هذه الأداة تشتق منه درجات
 * ثابتة (soft/border/glow/gradient) + متغيّر CSS `--angle` ليُستخدم في كلاسات
 * Tailwind العشوائية مثل `text-[color:var(--angle)]` و `border-[color:var(--angle)]`.
 *
 * تستهلكها صفحتا الزاوية (MuqtarabDetail) والموضوع (TopicDetail) لتوحيد
 * لون الهيدر والأزرار والـ accents مع هوية الكاتب.
 */
import type { CSSProperties } from "react";

const FALLBACK = "#6366f1"; // indigo-500 — لو غاب اللون أو كان غير صالح

/** يضمن صيغة #RRGGBB صالحة، وإلا يعيد اللون الافتراضي. */
export function normalizeHex(hex?: string | null): string {
  if (!hex) return FALLBACK;
  const v = hex.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    // تمدّد #abc → #aabbcc
    const [r, g, b] = v.slice(1).split("");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return FALLBACK;
}

/** يضيف شفافية (0..1) للون #RRGGBB ويعيد #RRGGBBAA. */
export function withAlpha(hex: string, alpha: number): string {
  const base = normalizeHex(hex);
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${base}${a}`;
}

/** يعتّم (amount<0) أو يفتّح (amount>0) اللون بنسبة (-1..1) بالمزج نحو الأسود/الأبيض. */
export function shade(hex: string, amount: number): string {
  const base = normalizeHex(hex).slice(1);
  const target = amount < 0 ? 0 : 255;
  const t = Math.min(1, Math.abs(amount));
  const ch = (i: number) => {
    const v = parseInt(base.slice(i, i + 2), 16);
    return Math.round(v + (target - v) * t)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${ch(0)}${ch(2)}${ch(4)}`;
}

export interface AngleTheme {
  /** اللون الأساسي #RRGGBB */
  color: string;
  /** خلفية ناعمة جداً (للبطاقات/الحاويات) */
  softer: string;
  /** خلفية ناعمة (للأيقونات/الشارات) */
  soft: string;
  /** حدود خفيفة بلون الزاوية */
  border: string;
  /** توهّج للظلال والـ glassmorphism */
  glow: string;
  /** تدرّج لوني للهيدر */
  gradient: string;
  /** متغيّرات CSS تُمرَّر على الحاوية الجذر (تتيح var(--angle) في الأبناء) */
  vars: CSSProperties;
}

/** يشتق هوية بصرية كاملة من لون الزاوية. */
export function angleTheme(colorHex?: string | null): AngleTheme {
  const color = normalizeHex(colorHex);
  return {
    color,
    softer: withAlpha(color, 0.06),
    soft: withAlpha(color, 0.12),
    border: withAlpha(color, 0.28),
    glow: withAlpha(color, 0.35),
    gradient: `linear-gradient(135deg, ${color} 0%, ${withAlpha(color, 0.82)} 100%)`,
    vars: {
      ["--angle" as any]: color,
      ["--angle-soft" as any]: withAlpha(color, 0.12),
      ["--angle-border" as any]: withAlpha(color, 0.28),
      // درجات التدرّج المتحرّك للغلاف (فاتح → اللون → داكن)
      ["--angle-grad-1" as any]: shade(color, 0.18),
      ["--angle-grad-2" as any]: color,
      ["--angle-grad-3" as any]: shade(color, -0.4),
    } as CSSProperties,
  };
}
