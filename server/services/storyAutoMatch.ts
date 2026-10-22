// الربط التلقائي للأخبار بالقصص متوقف افتراضيًا منذ 2026-10-22: كان يرسل كل القصص
// النشطة (أكثر من 1,200) إلى gpt-5.1 مع كل خبر منشور، فاستهلك نحو 90% من فاتورة
// OpenAI (قرابة 20 دولارًا يوميًا) بلا متابعين للقصص ولا عرض في web-next أو التطبيقات.
// القصص والروابط الموجودة تبقى، وإدارتها اليدوية من اللوحة لا تتأثر.
// إعادة التشغيل: STORY_AUTO_MATCH=on (بعد إصلاح حجم الطلب).
export function isStoryAutoMatchEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.STORY_AUTO_MATCH?.trim().toLowerCase() === "on";
}
