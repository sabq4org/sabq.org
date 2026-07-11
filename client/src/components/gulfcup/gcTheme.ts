/**
 * هوية خليجي 27 على الويب — مطابقة تطبيق iOS (GcTheme):
 * ملعب ليلي تركوازي بارد + سكاي للفعل الأساسي + خلفية فاتحة سيان · بلا ذهب.
 */

export const GC = {
  /** خلفية صفحات خليجي */
  page: "bg-[#EEF1F2] dark:bg-[#090E0F]",

  /** هيرو ليلي بارد */
  heroBg: "bg-gradient-to-bl from-[#041C22] via-[#052830] to-[#0A3D45]",
  heroGlowSky: "bg-sky-400/15",
  heroGlowTeal: "bg-teal-400/10",
  heroMuted: "text-sky-100/70",
  heroFaint: "text-sky-100/55",

  /** شريط تنقّل لاصق */
  nav: "border-b border-white/10 bg-[#041C22]/95 backdrop-blur-md supports-[backdrop-filter]:bg-[#041C22]/90",
  navLink: "text-sky-100/80 hover:bg-white/10 hover:text-white",

  /** أزرار فعل */
  cta: "bg-sky-300 text-sky-950 hover:bg-sky-200",
  ctaSolid: "bg-sky-500 text-white hover:bg-sky-400",
  chipActive: "bg-sky-500 text-white",
  chipIdle: "bg-muted text-muted-foreground hover:bg-muted/70",

  /** عناوين الأقسام */
  sectionIcon: "text-sky-600 dark:text-sky-400",
  sectionBadge: "bg-sky-500/10 text-sky-700 dark:text-sky-300",

  /** رؤوس بطاقات (مجموعات / ملاعب) */
  bar: "bg-gradient-to-l from-sky-700 to-sky-950",
  barSoft: "bg-gradient-to-l from-teal-700 to-sky-950",

  /** تمييز التأهل / الروابط */
  qualify: "bg-teal-600 text-white",
  qualifyText: "text-teal-700 dark:text-teal-300",
  link: "text-sky-700 dark:text-sky-300",
  ringHover: "hover:ring-sky-400/40",

  /** السعودية تبقى أخضر وطنيًا */
  saudiText: "text-emerald-700 dark:text-emerald-300",
  saudiBg: "bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-300/50 dark:border-emerald-500/30",
} as const;
