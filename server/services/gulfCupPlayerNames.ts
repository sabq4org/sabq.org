/**
 * أسماء لاعبي خليجي 27 الموثّقة بمعرّف API-Football.
 *
 * التعريب النصّي يختصر أو يخطئ توسعة الحرف الأول. المعرّف هنا يتقدّم على
 * ناتج القاموس/الكاش في لوحة الهدّافين فقط، وللاعبين الذين تُحقّقت هويتهم.
 * الاختصارات العامة («ي. ناصر»، «ن. خيمينيز») لا تُعمَّم على كل البطولات.
 */
import {
  PLAYER_AR_BOUALEM_KHOUKHI,
  PLAYER_AR_FIRAS_AL_BURAIKAN,
  PLAYER_AR_HASSAN_KADESH,
  PLAYER_AR_SULTAN_MANDASH,
} from "./sportsPlayerNameFixes";

export const GC_PLAYER_ID_AR: Record<number, string> = {
  44324: PLAYER_AR_FIRAS_AL_BURAIKAN, // F. Al Buraikan — فراس لا فهد
  44335: PLAYER_AR_HASSAN_KADESH, // H. Kadesh — حسن لا هشام
  2639: PLAYER_AR_SULTAN_MANDASH, // S. Mandash — سلطان لا سالم
  2532: PLAYER_AR_BOUALEM_KHOUKHI, // B. Khoukhi
  60951: "يوسف ناصر", // Yousef Nasser (الكويت)
  6685: "نيكولاس خيمينيز", // Nicolás Ezequiel Giménez (الإمارات)
  140962: "أحمد الكعبي", // Ahmed Al Kaabi — المصدر المبتور «K. A. Al» كان يُعرَّب «ك. أ. آل»
};

export function localizeGcPlayerName(id: number | null | undefined, translated: string): string {
  if (id != null && GC_PLAYER_ID_AR[id]) return GC_PLAYER_ID_AR[id];
  return translated;
}
