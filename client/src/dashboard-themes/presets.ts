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
    descriptionAr: "ألوان سبق مع فصل طبقي أوضح بين خلفية اللوحة والبطاقات.",
    fontLabel: "IBM Plex Sans Arabic",
    latinFont: "Inter",
    radiusLabel: "0.5rem",
    colors: [
      { key: "primary", labelAr: "أساسي", hex: "#1BADF8" },
      { key: "secondary", labelAr: "ثانوي", hex: "#A9ADB1" },
      { key: "accent", labelAr: "تمييز", hex: "#E8F4FC" },
      { key: "muted", labelAr: "خافت", hex: "#E5E8EB" },
      { key: "destructive", labelAr: "حذف", hex: "#F43F5E" },
      { key: "border", labelAr: "حدود", hex: "#CAD2D8" },
      { key: "card", labelAr: "بطاقة", hex: "#FFFFFF" },
      { key: "background", labelAr: "خلفية", hex: "#F3F5F7" },
    ],
  },
  {
    id: "twitter",
    nameAr: "تويتر / X",
    nameEn: "Twitter",
    descriptionAr: "ثيم shadcn من 21st.dev — أزرق تويتر مع سطح لوحة مفصول عن البطاقات البيضاء.",
    source: "https://21st.dev/@serafim/themes/twitter",
    fontLabel: "Open Sans · مع خط سبق للعربي",
    latinFont: "Inter",
    radiusLabel: "1.3rem",
    colors: [
      { key: "primary", labelAr: "أساسي", hex: "#1D9BF0" },
      { key: "secondary", labelAr: "ثانوي", hex: "#0F1419" },
      { key: "accent", labelAr: "تمييز", hex: "#E3EDF7" },
      { key: "muted", labelAr: "خافت", hex: "#E5E8EB" },
      { key: "destructive", labelAr: "حذف", hex: "#F4212E" },
      { key: "border", labelAr: "حدود", hex: "#D0D7DD" },
      { key: "card", labelAr: "بطاقة", hex: "#FFFFFF" },
      { key: "background", labelAr: "خلفية", hex: "#F3F5F7" },
    ],
  },
  {
    id: "claude",
    nameAr: "Claude",
    nameEn: "Claude",
    descriptionAr: "ثيم 21st.dev — تيراكوطة دافئة، قماش كريمي، وبطاقات مرتفعة أوضح.",
    source: "https://21st.dev/@serafim/themes/claude",
    fontLabel: "Inter · مع خط سبق للعربي",
    latinFont: "Inter",
    radiusLabel: "0.5rem",
    colors: [
      { key: "primary", labelAr: "أساسي", hex: "#C96442" },
      { key: "secondary", labelAr: "ثانوي", hex: "#E9E6DC" },
      { key: "accent", labelAr: "تمييز", hex: "#E9E6DC" },
      { key: "muted", labelAr: "خافت", hex: "#E9E6DD" },
      { key: "destructive", labelAr: "حذف", hex: "#141413" },
      { key: "border", labelAr: "حدود", hex: "#CECAC0" },
      { key: "card", labelAr: "بطاقة", hex: "#FDFDFB" },
      { key: "background", labelAr: "خلفية", hex: "#F2EFE8" },
    ],
  },
  {
    id: "claude-amber-ibm",
    nameAr: "Claude Amber IBM",
    nameEn: "Claude Amber remix IBM",
    descriptionAr: "ثيم 21st.dev — ريمكس كهرماني من Claude مع طبقات سطح أوضح وخط IBM Plex.",
    source: "https://21st.dev/@antonio.victor6/themes/claude-amber-remix-ibm-1783614901426",
    fontLabel: "IBM Plex Sans · مع خط سبق للعربي",
    latinFont: "IBM Plex Sans",
    radiusLabel: "1rem",
    colors: [
      { key: "primary", labelAr: "أساسي", hex: "#C96442" },
      { key: "secondary", labelAr: "ثانوي", hex: "#E9E6DC" },
      { key: "accent", labelAr: "تمييز", hex: "#E9E6DC" },
      { key: "muted", labelAr: "خافت", hex: "#E9E6DD" },
      { key: "destructive", labelAr: "حذف", hex: "#141413" },
      { key: "border", labelAr: "حدود", hex: "#CECAC0" },
      { key: "card", labelAr: "بطاقة", hex: "#FDFDFB" },
      { key: "background", labelAr: "خلفية", hex: "#F2EFE8" },
    ],
  },
  {
    id: "claude-azure",
    nameAr: "Claude Azure",
    nameEn: "Claude Azure",
    descriptionAr: "ثيم 21st.dev — أزرق هادئ وبطاقات بيضاء فوق قماش رمادي أوضح فصلاً.",
    source: "https://21st.dev/@serafim/themes/claude-azure",
    fontLabel: "Inter · مع خط سبق للعربي",
    latinFont: "Inter",
    radiusLabel: "0.5rem",
    colors: [
      { key: "primary", labelAr: "أساسي", hex: "#4288C9" },
      { key: "secondary", labelAr: "ثانوي", hex: "#DCE3E9" },
      { key: "accent", labelAr: "تمييز", hex: "#E0E6EB" },
      { key: "muted", labelAr: "خافت", hex: "#DEE3E7" },
      { key: "destructive", labelAr: "حذف", hex: "#EF4444" },
      { key: "border", labelAr: "حدود", hex: "#C6CED2" },
      { key: "card", labelAr: "بطاقة", hex: "#FFFFFF" },
      { key: "background", labelAr: "خلفية", hex: "#EAEDF0" },
    ],
  },
  {
    id: "whatsapp",
    nameAr: "واتساب",
    nameEn: "WhatsApp",
    descriptionAr: "ثيم 21st.dev — أخضر واتساب مع حدود أوضح وفصل بصري بين القماش والبطاقات.",
    source: "https://21st.dev/@serafim/themes/whatsapp",
    fontLabel: "Segoe UI · مع خط سبق للعربي",
    latinFont: "Inter",
    radiusLabel: "1rem",
    colors: [
      { key: "primary", labelAr: "أساسي", hex: "#075E54" },
      { key: "secondary", labelAr: "ثانوي", hex: "#E7F8F0" },
      { key: "accent", labelAr: "تمييز", hex: "#25D366" },
      { key: "muted", labelAr: "خافت", hex: "#E2E6E9" },
      { key: "destructive", labelAr: "حذف", hex: "#EA4335" },
      { key: "border", labelAr: "حدود", hex: "#D1D8DB" },
      { key: "card", labelAr: "بطاقة", hex: "#FFFFFF" },
      { key: "background", labelAr: "خلفية", hex: "#EDF0F2" },
    ],
  },
  {
    id: "elegant-luxury",
    nameAr: "أناقة فاخرة",
    nameEn: "Elegant Luxury",
    descriptionAr: "ثيم 21st.dev — أحمر نبيذي مع قماش بيج وبطاقات مرتفعة عن الخلفية.",
    source: "https://21st.dev/@serafim/themes/elegant-luxury",
    fontLabel: "Poppins · مع خط سبق للعربي",
    latinFont: "Inter",
    radiusLabel: "0.375rem",
    colors: [
      { key: "primary", labelAr: "أساسي", hex: "#9B2C2C" },
      { key: "secondary", labelAr: "ثانوي", hex: "#FDF2D6" },
      { key: "accent", labelAr: "تمييز", hex: "#FCF3CF" },
      { key: "muted", labelAr: "خافت", hex: "#EAE5E1" },
      { key: "destructive", labelAr: "حذف", hex: "#991B1B" },
      { key: "border", labelAr: "حدود", hex: "#DACDBE" },
      { key: "card", labelAr: "بطاقة", hex: "#FDFCFB" },
      { key: "background", labelAr: "خلفية", hex: "#F1EDE9" },
    ],
  },
  {
    id: "sage-meadow",
    nameAr: "مرج المريمية",
    nameEn: "Sage Meadow",
    descriptionAr: "ثيم 21st.dev — أخضر مريمية مع تباين أوضح بين القماش الدافئ والبطاقات.",
    source: "https://21st.dev/@serafim/themes/sage-meadow",
    fontLabel: "Quicksand · مع خط سبق للعربي",
    latinFont: "Inter",
    radiusLabel: "0.8rem",
    colors: [
      { key: "primary", labelAr: "أساسي", hex: "#50956D" },
      { key: "secondary", labelAr: "ثانوي", hex: "#5E9CBA" },
      { key: "accent", labelAr: "تمييز", hex: "#F6DDD5" },
      { key: "muted", labelAr: "خافت", hex: "#E8E4DE" },
      { key: "destructive", labelAr: "حذف", hex: "#CB4D4D" },
      { key: "border", labelAr: "حدود", hex: "#D3C9BB" },
      { key: "card", labelAr: "بطاقة", hex: "#FDFDFB" },
      { key: "background", labelAr: "خلفية", hex: "#F3EFE8" },
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
