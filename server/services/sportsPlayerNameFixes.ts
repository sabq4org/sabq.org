/**
 * تصحيحات تحريرية لأسماء لاعبين يخلطها التعريب الآلي أو قاموس TheSports.
 *
 * حادثة 2026-08-13: هدف الحزم أمام أبها نُسب إلى «عبدالعزيز البيشي» (الاتحاد)
 * بينما المسجّل «عبدالعزيز الضويحي». المصدر اللاتيني Al-Dwehe / Al-Dhuwayhi
 * يُخلط بالبيشي لأنهما يشتركان في الاسم الأول. القاموس هنا يتقدّم على كاش
 * sports_name_translations وعلى name_aa من TheSports.
 */
export const AL_HAZEM_TEAM_ID = 2945; // API-Football — الحزم

export const PLAYER_AR_AL_DWEHE = "عبدالعزيز الضويحي";
export const PLAYER_AR_AL_BISHI = "عبدالعزيز البيشي";

/** صيغ المزوّد الشائعة — تُدمَج في WC_PLAYER_AR عبر resolveNames. */
export const CURATED_PLAYER_AR: Record<string, string> = {
  "Abdulaziz Al-Dwehe": PLAYER_AR_AL_DWEHE,
  "Abdulaziz Al Dwehe": PLAYER_AR_AL_DWEHE,
  "Abdulaziz Aldwehe": PLAYER_AR_AL_DWEHE,
  "Abdulaziz Al-Dhuwayhi": PLAYER_AR_AL_DWEHE,
  "Abdulaziz Al Dhuwayhi": PLAYER_AR_AL_DWEHE,
  "Abdulaziz Aldhuwayhi": PLAYER_AR_AL_DWEHE,
  "Abdulaziz Al-Dhuwaihi": PLAYER_AR_AL_DWEHE,
  "Abdulaziz Al Dhuwaihi": PLAYER_AR_AL_DWEHE,
  "Abdulaziz Al-Duwayhi": PLAYER_AR_AL_DWEHE,
  "Abdulaziz Al Duwayhi": PLAYER_AR_AL_DWEHE,
  "Abdulaziz Al-Duwaihi": PLAYER_AR_AL_DWEHE,
  "Abdul Aziz Al-Dwehe": PLAYER_AR_AL_DWEHE,
  "Abdul Aziz Al-Dhuwayhi": PLAYER_AR_AL_DWEHE,
  "A. Al-Dwehe": PLAYER_AR_AL_DWEHE,
  "A. Al Dwehe": PLAYER_AR_AL_DWEHE,
  "A. Al-Dhuwayhi": PLAYER_AR_AL_DWEHE,
  "A. Al Dhuwayhi": PLAYER_AR_AL_DWEHE,
  "A. Aldhuwayhi": PLAYER_AR_AL_DWEHE,
  [PLAYER_AR_AL_DWEHE]: PLAYER_AR_AL_DWEHE,
  "عبد العزيز الضويحي": PLAYER_AR_AL_DWEHE,

  // الإبقاء على البيشي صراحةً حتى لا يُصحَّح لاعب الاتحاد بالخطأ
  "Abdulaziz Al-Bishi": PLAYER_AR_AL_BISHI,
  "Abdulaziz Al Bishi": PLAYER_AR_AL_BISHI,
  "Abdulaziz Albishi": PLAYER_AR_AL_BISHI,
  "A. Al-Bishi": PLAYER_AR_AL_BISHI,
  "A. Al Bishi": PLAYER_AR_AL_BISHI,
  [PLAYER_AR_AL_BISHI]: PLAYER_AR_AL_BISHI,
};

const DWEHE_SOURCE =
  /dwehe|dhuwayhi|dhuwaihi|duwayhi|duwaihi|aldhuwayhi|aldwehe|الضويحي/i;
const LATIN_BISHI = /bishi|albishi/i;
const ABDULAZIZ_BISHI_AR = /عبد\s*العزيز\s*البيشي/;

function normKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[أإآ]/g, "ا")
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const CURATED_BY_NORM = new Map<string, string>();
for (const [source, arabic] of Object.entries(CURATED_PLAYER_AR)) {
  CURATED_BY_NORM.set(normKey(source), arabic);
}

function lookupCurated(value: string | null | undefined): string | undefined {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return undefined;
  return CURATED_PLAYER_AR[trimmed] ?? CURATED_BY_NORM.get(normKey(trimmed));
}

export interface PlayerNameFixOpts {
  /** معرّف النادي (API-Football). عند الحزم نرفض «البيشي» ما لم يكن المصدر لاتينيًا صريحًا. */
  teamId?: number | null;
}

/**
 * يرجّع الاسم العربي المعتمد. `resolved` هو ناتج الطبقة السابقة (AI / DB / TheSports).
 * إن لم يُمرَّر يُستخدم المصدر نفسه.
 */
export function correctSportsPlayerName(
  source: string | null | undefined,
  resolved?: string | null,
  opts?: PlayerNameFixOpts,
): string {
  const src = (source ?? "").trim();
  const out = (resolved ?? "").trim() || src;
  if (!src && !out) return "";

  // على الحزم: «عبدالعزيز البيشي» بلا لقب لاتيني bishi = خلط مع الضويحي
  if (
    opts?.teamId === AL_HAZEM_TEAM_ID &&
    !LATIN_BISHI.test(src) &&
    ABDULAZIZ_BISHI_AR.test(`${src} ${out}`.replace(/\s+/g, " "))
  ) {
    return PLAYER_AR_AL_DWEHE;
  }

  const fromSrc = lookupCurated(src);
  if (fromSrc) return fromSrc;
  const fromOut = lookupCurated(out);
  if (fromOut && !DWEHE_SOURCE.test(src)) return fromOut;

  if (DWEHE_SOURCE.test(src) || DWEHE_SOURCE.test(out)) return PLAYER_AR_AL_DWEHE;

  return out;
}

/** اختيار اسم حدث TheSports: تصحيح تحريري يتقدّم على name_aa. */
export function resolveTsEventPlayerName(
  rawName: string | null | undefined,
  tsArabic: string | null | undefined,
  translated: string,
  teamId?: number | null,
): string {
  const resolved = (tsArabic && tsArabic.trim()) || translated;
  return correctSportsPlayerName(rawName, resolved, { teamId });
}
