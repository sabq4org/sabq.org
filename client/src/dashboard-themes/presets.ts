import {
  DEFAULT_DASHBOARD_THEME_ID,
  isDashboardThemeId,
  type DashboardThemeId,
} from "@shared/dashboard-theme";

export type { DashboardThemeId };
export { DEFAULT_DASHBOARD_THEME_ID, isDashboardThemeId };

export interface DashboardThemeColorToken {
  key: string;
  labelAr: string;
  /** CSS color for swatch preview */
  hex: string;
}

export interface DashboardThemePreset {
  id: DashboardThemeId;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  source?: string;
  fontLabel: string;
  /** Latin/display font for the stack (Arabic stays IBM Plex first). */
  latinFont: string;
  radiusLabel: string;
  colors: DashboardThemeColorToken[];
}

/** Local cache of the org theme for faster first paint / offline fallback. */
export const DASHBOARD_THEME_STORAGE_KEY = "sabq.dashboard.theme.v1";

export const DASHBOARD_THEME_PRESETS: DashboardThemePreset[] = [
  {
    id: "sabq",
    nameAr: "سبق الافتراضي",
    nameEn: "Sabq Default",
    descriptionAr: "ألوان لوحة التحكم الحالية لسبق دون تعديل.",
    fontLabel: "IBM Plex Sans Arabic",
    latinFont: "Inter",
    radiusLabel: "0.5rem",
    colors: [
      { key: "primary", labelAr: "أساسي", hex: "#1BADF8" },
      { key: "secondary", labelAr: "ثانوي", hex: "#A8ADB3" },
      { key: "accent", labelAr: "تمييز", hex: "#E8F6FE" },
      { key: "muted", labelAr: "خافت", hex: "#E5E5E6" },
      { key: "destructive", labelAr: "حذف", hex: "#F43F5E" },
      { key: "border", labelAr: "حدود", hex: "#C9D5DC" },
      { key: "card", labelAr: "بطاقة", hex: "#F4F7F7" },
      { key: "background", labelAr: "خلفية", hex: "#FFFFFF" },
    ],
  },
  {
    id: "twitter",
    nameAr: "تويتر / X",
    nameEn: "Twitter",
    descriptionAr: "ثيم shadcn من 21st.dev — أزرق تويتر، ثانوي داكن، زوايا 1.3rem.",
    source: "https://21st.dev/@serafim/themes/twitter",
    fontLabel: "Open Sans · مع خط سبق للعربي",
    latinFont: "Inter",
    radiusLabel: "1.3rem",
    colors: [
      { key: "primary", labelAr: "أساسي", hex: "#1D9BF0" },
      { key: "secondary", labelAr: "ثانوي", hex: "#0F1419" },
      { key: "accent", labelAr: "تمييز", hex: "#E8F5FD" },
      { key: "muted", labelAr: "خافت", hex: "#E7E7E8" },
      { key: "destructive", labelAr: "حذف", hex: "#F4212E" },
      { key: "border", labelAr: "حدود", hex: "#EFF3F4" },
      { key: "card", labelAr: "بطاقة", hex: "#F7F9F9" },
      { key: "background", labelAr: "خلفية", hex: "#FFFFFF" },
    ],
  },
  {
    id: "claude",
    nameAr: "Claude",
    nameEn: "Claude",
    descriptionAr: "ثيم 21st.dev — تيراكوطة دافئة وخلفيات كريمية هادئة بأسلوب Claude.",
    source: "https://21st.dev/@serafim/themes/claude",
    fontLabel: "Inter · مع خط سبق للعربي",
    latinFont: "Inter",
    radiusLabel: "0.5rem",
    colors: [
      { key: "primary", labelAr: "أساسي", hex: "#C96442" },
      { key: "secondary", labelAr: "ثانوي", hex: "#E9E6DC" },
      { key: "accent", labelAr: "تمييز", hex: "#E9E6DC" },
      { key: "muted", labelAr: "خافت", hex: "#EDE9DE" },
      { key: "destructive", labelAr: "حذف", hex: "#141413" },
      { key: "border", labelAr: "حدود", hex: "#DAD9D4" },
      { key: "card", labelAr: "بطاقة", hex: "#FAF9F5" },
      { key: "background", labelAr: "خلفية", hex: "#FAF9F5" },
    ],
  },
  {
    id: "claude-amber-ibm",
    nameAr: "Claude Amber IBM",
    nameEn: "Claude Amber remix IBM",
    descriptionAr: "ثيم 21st.dev — ريمكس كهرماني من Claude بزوايا 1rem وخط IBM Plex.",
    source: "https://21st.dev/@antonio.victor6/themes/claude-amber-remix-ibm-1783614901426",
    fontLabel: "IBM Plex Sans · مع خط سبق للعربي",
    latinFont: "IBM Plex Sans",
    radiusLabel: "1rem",
    colors: [
      { key: "primary", labelAr: "أساسي", hex: "#C96442" },
      { key: "secondary", labelAr: "ثانوي", hex: "#E9E6DC" },
      { key: "accent", labelAr: "تمييز", hex: "#E9E6DC" },
      { key: "muted", labelAr: "خافت", hex: "#EDE9DE" },
      { key: "destructive", labelAr: "حذف", hex: "#141413" },
      { key: "border", labelAr: "حدود", hex: "#DAD9D4" },
      { key: "card", labelAr: "بطاقة", hex: "#F5F4EF" },
      { key: "background", labelAr: "خلفية", hex: "#FAF9F5" },
    ],
  },
  {
    id: "claude-azure",
    nameAr: "Claude Azure",
    nameEn: "Claude Azure",
    descriptionAr: "ثيم 21st.dev — أزرق هادئ وخلفيات رمادية فاتحة، مناسب لتجربة لوحة نظيفة.",
    source: "https://21st.dev/@serafim/themes/claude-azure",
    fontLabel: "Inter · مع خط سبق للعربي",
    latinFont: "Inter",
    radiusLabel: "0.5rem",
    colors: [
      { key: "primary", labelAr: "أساسي", hex: "#4288C9" },
      { key: "secondary", labelAr: "ثانوي", hex: "#DCE3E9" },
      { key: "accent", labelAr: "تمييز", hex: "#DCE3E9" },
      { key: "muted", labelAr: "خافت", hex: "#DEE6ED" },
      { key: "destructive", labelAr: "حذف", hex: "#EF4444" },
      { key: "border", labelAr: "حدود", hex: "#D4DADB" },
      { key: "card", labelAr: "بطاقة", hex: "#F5F8FA" },
      { key: "background", labelAr: "خلفية", hex: "#F1F1F1" },
    ],
  },
  {
    id: "whatsapp",
    nameAr: "واتساب",
    nameEn: "WhatsApp",
    descriptionAr: "ثيم 21st.dev — أخضر واتساب الكلاسيكي مع خلفية رمادية فاتحة.",
    source: "https://21st.dev/@serafim/themes/whatsapp",
    fontLabel: "Segoe UI · مع خط سبق للعربي",
    latinFont: "Inter",
    radiusLabel: "1rem",
    colors: [
      { key: "primary", labelAr: "أساسي", hex: "#075E54" },
      { key: "secondary", labelAr: "ثانوي", hex: "#E7F8F0" },
      { key: "accent", labelAr: "تمييز", hex: "#25D366" },
      { key: "muted", labelAr: "خافت", hex: "#F0F2F5" },
      { key: "destructive", labelAr: "حذف", hex: "#EA4335" },
      { key: "border", labelAr: "حدود", hex: "#E9EDEF" },
      { key: "card", labelAr: "بطاقة", hex: "#FFFFFF" },
      { key: "background", labelAr: "خلفية", hex: "#F0F2F5" },
    ],
  },
  {
    id: "elegant-luxury",
    nameAr: "أناقة فاخرة",
    nameEn: "Elegant Luxury",
    descriptionAr: "ثيم 21st.dev — أحمر نبيذي دافئ مع خلفيات بيج وذهبي خفيف.",
    source: "https://21st.dev/@serafim/themes/elegant-luxury",
    fontLabel: "Poppins · مع خط سبق للعربي",
    latinFont: "Inter",
    radiusLabel: "0.375rem",
    colors: [
      { key: "primary", labelAr: "أساسي", hex: "#9B2C2C" },
      { key: "secondary", labelAr: "ثانوي", hex: "#FDF2D6" },
      { key: "accent", labelAr: "تمييز", hex: "#FEF3C7" },
      { key: "muted", labelAr: "خافت", hex: "#F0EBE8" },
      { key: "destructive", labelAr: "حذف", hex: "#991B1B" },
      { key: "border", labelAr: "حدود", hex: "#F5E8D2" },
      { key: "card", labelAr: "بطاقة", hex: "#FAF7F5" },
      { key: "background", labelAr: "خلفية", hex: "#FAF7F5" },
    ],
  },
  {
    id: "sage-meadow",
    nameAr: "مرج المريمية",
    nameEn: "Sage Meadow",
    descriptionAr: "ثيم 21st.dev — أخضر مريمية هادئ وخلفيات دافئة ناعمة.",
    source: "https://21st.dev/@serafim/themes/sage-meadow",
    fontLabel: "Quicksand · مع خط سبق للعربي",
    latinFont: "Inter",
    radiusLabel: "0.8rem",
    colors: [
      { key: "primary", labelAr: "أساسي", hex: "#50956D" },
      { key: "secondary", labelAr: "ثانوي", hex: "#5E9CBA" },
      { key: "accent", labelAr: "تمييز", hex: "#F6DDD5" },
      { key: "muted", labelAr: "خافت", hex: "#EBE7E0" },
      { key: "destructive", labelAr: "حذف", hex: "#CB4D4D" },
      { key: "border", labelAr: "حدود", hex: "#E4DBCD" },
      { key: "card", labelAr: "بطاقة", hex: "#FCFBF8" },
      { key: "background", labelAr: "خلفية", hex: "#F9F6F0" },
    ],
  },
];

/** Always keep Arabic readable; theme latin fonts trail as fallbacks. */
export function getDashboardThemeFontStack(id: DashboardThemeId): string {
  const preset = DASHBOARD_THEME_PRESETS.find((item) => item.id === id);
  const latin = preset?.latinFont ?? "Inter";
  return `"IBM Plex Sans Arabic", "Tajawal", ${latin}, system-ui, sans-serif`;
}

export function readStoredDashboardTheme(): DashboardThemeId {
  if (typeof window === "undefined") return DEFAULT_DASHBOARD_THEME_ID;
  try {
    const raw = localStorage.getItem(DASHBOARD_THEME_STORAGE_KEY);
    if (isDashboardThemeId(raw)) return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_DASHBOARD_THEME_ID;
}

export function writeStoredDashboardTheme(id: DashboardThemeId) {
  try {
    localStorage.setItem(DASHBOARD_THEME_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}
