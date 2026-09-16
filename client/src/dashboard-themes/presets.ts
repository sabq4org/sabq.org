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

/** Shared semantic destructive swatch (centralized dashboard token). */
const SEMANTIC_DESTRUCTIVE = "#E72330";

export const DASHBOARD_THEME_PRESETS: DashboardThemePreset[] = [
  {
    id: "sabq",
    nameAr: "سبق الافتراضي",
    nameEn: "Sabq Default",
    descriptionAr: "أزرق سبق مع قماش بارد وبطاقات بيضاء وثانوي ناعم قابل للقراءة.",
    fontLabel: "IBM Plex Sans Arabic",
    latinFont: "Inter",
    radiusLabel: "0.5rem",
    colors: [
      { key: "primary", labelAr: "أساسي", hex: "#1BADF8" },
      { key: "secondary", labelAr: "ثانوي", hex: "#E8EBED" },
      { key: "accent", labelAr: "تمييز", hex: "#E9F4FB" },
      { key: "muted", labelAr: "خافت", hex: "#E5E8EB" },
      { key: "destructive", labelAr: "حذف", hex: SEMANTIC_DESTRUCTIVE },
      { key: "border", labelAr: "حدود", hex: "#D3DADE" },
      { key: "card", labelAr: "بطاقة", hex: "#FFFFFF" },
      { key: "background", labelAr: "خلفية", hex: "#F3F5F7" },
    ],
  },
  {
    id: "twitter",
    nameAr: "تويتر / X",
    nameEn: "Twitter",
    descriptionAr: "أزرق تويتر مع ثانوي داكن للأزرار وقماش مفصول عن البطاقات البيضاء.",
    source: "https://21st.dev/@serafim/themes/twitter",
    fontLabel: "Open Sans · مع خط سبق للعربي",
    latinFont: "Inter",
    radiusLabel: "1.3rem",
    colors: [
      { key: "primary", labelAr: "أساسي", hex: "#1D9BF0" },
      { key: "secondary", labelAr: "ثانوي", hex: "#171F26" },
      { key: "accent", labelAr: "تمييز", hex: "#E7EFF8" },
      { key: "muted", labelAr: "خافت", hex: "#E5E8EB" },
      { key: "destructive", labelAr: "حذف", hex: SEMANTIC_DESTRUCTIVE },
      { key: "border", labelAr: "حدود", hex: "#D3DADE" },
      { key: "card", labelAr: "بطاقة", hex: "#FFFFFF" },
      { key: "background", labelAr: "خلفية", hex: "#F3F5F7" },
    ],
  },
  {
    id: "claude",
    nameAr: "Claude",
    nameEn: "Claude",
    descriptionAr: "تيراكوطة دافئة على قماش كريمي، مع تمييز ناعم منفصل عن الثانوي.",
    source: "https://21st.dev/@serafim/themes/claude",
    fontLabel: "Inter · مع خط سبق للعربي",
    latinFont: "Inter",
    radiusLabel: "0.5rem",
    colors: [
      { key: "primary", labelAr: "أساسي", hex: "#BF5836" },
      { key: "secondary", labelAr: "ثانوي", hex: "#EDEAE3" },
      { key: "accent", labelAr: "تمييز", hex: "#F6EEE9" },
      { key: "muted", labelAr: "خافت", hex: "#EBE8E0" },
      { key: "destructive", labelAr: "حذف", hex: SEMANTIC_DESTRUCTIVE },
      { key: "border", labelAr: "حدود", hex: "#DDDBD4" },
      { key: "card", labelAr: "بطاقة", hex: "#FDFDFB" },
      { key: "background", labelAr: "خلفية", hex: "#F2EFE9" },
    ],
  },
  {
    id: "claude-amber-ibm",
    nameAr: "Claude Amber IBM",
    nameEn: "Claude Amber remix IBM",
    descriptionAr: "ريمكس كهرماني دافئ بنفس طبقات Claude مع زوايا أوسع وخط IBM Plex.",
    source: "https://21st.dev/@antonio.victor6/themes/claude-amber-remix-ibm-1783614901426",
    fontLabel: "IBM Plex Sans · مع خط سبق للعربي",
    latinFont: "IBM Plex Sans",
    radiusLabel: "1rem",
    colors: [
      { key: "primary", labelAr: "أساسي", hex: "#BF5836" },
      { key: "secondary", labelAr: "ثانوي", hex: "#EDEAE3" },
      { key: "accent", labelAr: "تمييز", hex: "#F5EDE5" },
      { key: "muted", labelAr: "خافت", hex: "#EBE8E0" },
      { key: "destructive", labelAr: "حذف", hex: SEMANTIC_DESTRUCTIVE },
      { key: "border", labelAr: "حدود", hex: "#DDDBD4" },
      { key: "card", labelAr: "بطاقة", hex: "#FDFDFB" },
      { key: "background", labelAr: "خلفية", hex: "#F2EFE9" },
    ],
  },
  {
    id: "claude-azure",
    nameAr: "Claude Azure",
    nameEn: "Claude Azure",
    descriptionAr: "أزرق هادئ وبطاقات بيضاء فوق قماش رمادي بارد بحدود ناعمة.",
    source: "https://21st.dev/@serafim/themes/claude-azure",
    fontLabel: "Inter · مع خط سبق للعربي",
    latinFont: "Inter",
    radiusLabel: "0.5rem",
    colors: [
      { key: "primary", labelAr: "أساسي", hex: "#377DBE" },
      { key: "secondary", labelAr: "ثانوي", hex: "#E7EBEE" },
      { key: "accent", labelAr: "تمييز", hex: "#EBF0F4" },
      { key: "muted", labelAr: "خافت", hex: "#E5E8EB" },
      { key: "destructive", labelAr: "حذف", hex: SEMANTIC_DESTRUCTIVE },
      { key: "border", labelAr: "حدود", hex: "#D3DBDE" },
      { key: "card", labelAr: "بطاقة", hex: "#FFFFFF" },
      { key: "background", labelAr: "خلفية", hex: "#EEF0F2" },
    ],
  },
  {
    id: "whatsapp",
    nameAr: "واتساب",
    nameEn: "WhatsApp",
    descriptionAr: "أخضر واتساب مع تمييز نعناعي ناعم للتحويم بدل النيون الصارخ.",
    source: "https://21st.dev/@serafim/themes/whatsapp",
    fontLabel: "Segoe UI · مع خط سبق للعربي",
    latinFont: "Inter",
    radiusLabel: "1rem",
    colors: [
      { key: "primary", labelAr: "أساسي", hex: "#115F56" },
      { key: "secondary", labelAr: "ثانوي", hex: "#EAF6F0" },
      { key: "accent", labelAr: "تمييز", hex: "#EAF5F0" },
      { key: "muted", labelAr: "خافت", hex: "#E5E8EB" },
      { key: "destructive", labelAr: "حذف", hex: SEMANTIC_DESTRUCTIVE },
      { key: "border", labelAr: "حدود", hex: "#D3DBDE" },
      { key: "card", labelAr: "بطاقة", hex: "#FFFFFF" },
      { key: "background", labelAr: "خلفية", hex: "#EDF0F2" },
    ],
  },
  {
    id: "elegant-luxury",
    nameAr: "أناقة فاخرة",
    nameEn: "Elegant Luxury",
    descriptionAr: "نبيذي فاخر مع لمسات ذهبية؛ لون الحذف دلالي مستقل عن الأساسي.",
    source: "https://21st.dev/@serafim/themes/elegant-luxury",
    fontLabel: "Poppins · مع خط سبق للعربي",
    latinFont: "Inter",
    radiusLabel: "0.375rem",
    colors: [
      { key: "primary", labelAr: "أساسي", hex: "#932F2F" },
      { key: "secondary", labelAr: "ثانوي", hex: "#F6F1E4" },
      { key: "accent", labelAr: "تمييز", hex: "#F8F1DD" },
      { key: "muted", labelAr: "خافت", hex: "#ECE7E4" },
      { key: "destructive", labelAr: "حذف", hex: SEMANTIC_DESTRUCTIVE },
      { key: "border", labelAr: "حدود", hex: "#E0D9D2" },
      { key: "card", labelAr: "بطاقة", hex: "#FDFCFB" },
      { key: "background", labelAr: "خلفية", hex: "#F1EDE9" },
    ],
  },
  {
    id: "sage-meadow",
    nameAr: "مرج المريمية",
    nameEn: "Sage Meadow",
    descriptionAr: "مريمية هادئة مع ثانوي بنفس العائلة ولمسة دافئة خفيفة — بلا تعارض سماوي.",
    source: "https://21st.dev/@serafim/themes/sage-meadow",
    fontLabel: "Quicksand · مع خط سبق للعربي",
    latinFont: "Inter",
    radiusLabel: "0.8rem",
    colors: [
      { key: "primary", labelAr: "أساسي", hex: "#498361" },
      { key: "secondary", labelAr: "ثانوي", hex: "#E7EEEA" },
      { key: "accent", labelAr: "تمييز", hex: "#F5EAE6" },
      { key: "muted", labelAr: "خافت", hex: "#EAE7E1" },
      { key: "destructive", labelAr: "حذف", hex: SEMANTIC_DESTRUCTIVE },
      { key: "border", labelAr: "حدود", hex: "#DFDAD3" },
      { key: "card", labelAr: "بطاقة", hex: "#FDFDFB" },
      { key: "background", labelAr: "خلفية", hex: "#F2EFE8" },
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
