// بوابة ميزات خليجي 27 الاجتماعية (المجلس/الفانتسي/التحديات) — كانت تعيش في
// gcPredictionsService قبل تقاعده لصالح المنصة المركزية. الطبقات الاجتماعية
// نفسها باقية وتُبنى لاحقًا فوق سجل المنصة المركزية.

export function isGcPredictionsEnabled(): boolean {
  return process.env.GC_PREDICTIONS_ENABLED === "true";
}
