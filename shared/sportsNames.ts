/**
 * معالجة وتنسيق أسماء اللاعبين والرياضيين إلى الصيغة الثنائية المعتمدة
 * (الاسم الأول + اسم العائلة/اللقب) والتخلص من سلاسل الأنساب الطويلة
 * (الأسماء الثلاثية والرباعية).
 */

const COMPOUND_PREFIXES = new Set([
  "بن",
  "ابن",
  "ابنة",
  "بنت",
  "آل",
  "دي",
  "فان",
  "دا",
  "دو",
  "لا",
  "لو",
  "ديل",
  "سان",
  "سانتا",
]);

/**
 * معالجة اسم مفرد مجرد (دون أقواس أو إضافات) وتحويله لصيغة ثنائية
 */
function toBinarySingleName(rawName: string): string {
  if (!rawName) return "";
  let clean = rawName
    .trim()
    .replace(/[\(\)\[\]\{\}]/g, "")
    .replace(/\s+/g, " ");

  // تصحيح تفكيك بعض الأسماء الأجنبية الشائعة (مثل ستوجانو فيتش -> ستوجانوفيتش)
  clean = clean.replace(/ستوجانو\s+فيتش/g, "ستوجانوفيتش");
  clean = clean.replace(/ميلينكوفيتش\s+سافيتش/g, "ميلينكوفيتش-سافيتش");

  const tokens = clean.split(" ").filter(Boolean);
  if (tokens.length <= 1) return clean;

  // 1) تحديد وحدة الاسم الأول (الاسم المركب)
  let firstName = tokens[0];
  let rest = tokens.slice(1);

  // حالة «عبد» + كلمة (مثل عبد الله، عبد العزيز، عبد الرحمن، عبد الإله...)
  if (tokens[0] === "عبد" && tokens.length > 1) {
    firstName = `عبد ${tokens[1]}`;
    rest = tokens.slice(2);
  }
  // حالة اسم ينتهي بـ «الدين» (مثل سيف الدين، نور الدين، صلاح الدين...)
  else if (tokens.length > 1 && tokens[1] === "الدين") {
    firstName = `${tokens[0]} الدين`;
    rest = tokens.slice(2);
  }
  // حالة «أبو/ابو/أم/ام» + كلمة (مثل أبو بكر، أبو طالب...)
  else if (
    (tokens[0] === "أبو" || tokens[0] === "ابو" || tokens[0] === "أم" || tokens[0] === "ام") &&
    tokens.length > 1
  ) {
    firstName = `${tokens[0]} ${tokens[1]}`;
    rest = tokens.slice(2);
  }

  // إذا لم يتبق أي أجزاء أخرى
  if (rest.length === 0) {
    return firstName;
  }

  // 2) إذا تبقى جزء واحد فقط (الاسم بالفعل ثنائي)
  if (rest.length === 1) {
    return `${firstName} ${rest[0]}`;
  }

  // 3) إذا تبقت كلمتان
  if (rest.length === 2) {
    // إذا كانت الكلمة الأولى بادئة مركبة (مثل «بن سلمان»، «آل الشيخ»، «دي بروين»)
    if (COMPOUND_PREFIXES.has(rest[0])) {
      return `${firstName} ${rest[0]} ${rest[1]}`;
    }
    // إذا كانت الكلمة الأولى «عبد»
    if (rest[0] === "عبد") {
      return `${firstName} ${rest[0]} ${rest[1]}`;
    }
    // إذا كانت الكلمة الثانية «الدين»
    if (rest[1] === "الدين") {
      return `${firstName} ${rest[0]} ${rest[1]}`;
    }
    // خلاف ذلك: اسم ثلاثي عادي مثل [مراد] [محمد] [خضري] -> نأخذ اللقب/العائلة الأخيرة
    return `${firstName} ${rest[1]}`;
  }

  // 4) إذا تبقت 3 كلمات أو أكثر (اسم رباعي، خماسي، أو سلسلة نسب)
  // مثل: [فهد] [بن] [عبدالعزيز] [بن] [تركي] [معاذ] [الطالب]
  // أو: [عبد الله] [مطوق] [أحمد] [سعيد]
  // أو: [سيف] [محمد] [بن] [فرحان] [العامري]
  const lastTwo = rest.slice(-2);
  if (COMPOUND_PREFIXES.has(lastTwo[0])) {
    return `${firstName} ${lastTwo[0]} ${lastTwo[1]}`;
  }
  if (lastTwo[0] === "عبد") {
    return `${firstName} ${lastTwo[0]} ${lastTwo[1]}`;
  }
  if (lastTwo[1] === "الدين") {
    return `${firstName} ${lastTwo[0]} ${lastTwo[1]}`;
  }

  // أخذ الكلمة الأخيرة كاسم عائلة/لقب
  return `${firstName} ${rest[rest.length - 1]}`;
}

/**
 * تحويل اسم اللاعب إلى الصيغة الثنائية مع التعامل مع الأقواس المضمنة (مثل اسم اللاعب وبديله)
 */
export function toBinaryPlayerName(name: string | null | undefined): string {
  if (!name || typeof name !== "string") return "";
  const trimmed = name.trim();
  if (!trimmed) return "";

  // فحص ما إذا كان النص يحتوي على صيغة مركبة بين قوسين مثل "اسم أول (اسم ثانٍ)"
  const parenMatch = trimmed.match(/^([^\(\)]+)\s*\(([^\(\)]+)\)$/);
  if (parenMatch) {
    const mainPart = toBinarySingleName(parenMatch[1]);
    const subPart = toBinarySingleName(parenMatch[2]);
    return subPart ? `${mainPart} (${subPart})` : mainPart;
  }

  return toBinarySingleName(trimmed);
}
