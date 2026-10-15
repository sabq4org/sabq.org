/**
 * سجل ناشرين أولي للرادار (إصدار 2026-09-28) — مضمَّن في الحزمة (لا readFileSync:
 * صورة Railway لا تنسخ server/services/radar/data).
 *
 * النوع يحدد قوة الدليل لا صحة الخبر:
 * - official: ما أعلنته الجهة الرسمية (دليل قوي على الإعلان، لا على كل ادعاء).
 * - wire: وكالة أصلية — من ينقل عنها لا يُعدّ مصدرًا مستقلًا إضافيًا.
 * - major: مؤسسة تحرير كبرى.
 * - press_release: بيان مدفوع/ترويجي — لا يدخل قائمة الأخبار.
 * - aggregator: ناقل/مجمّع لا يضيف دليلًا.
 * عدّل القائمة بمراجعة تحريرية بشرية؛ اللغة أو البلد وحدهما لا يحددان الثقة.
 */
export type PublisherType =
  | "official"
  | "wire"
  | "major"
  | "press_release"
  | "aggregator"
  | "social"
  | "unknown";

export interface PublisherEntry {
  key: string;
  type: Exclude<PublisherType, "social" | "unknown">;
  names: string[];
  domains: string[];
  /** عبارات عزو داخل النص تدل على أن المادة منقولة عن هذا الناشر */
  wireMarkers: string[];
}

export const PUBLISHER_REGISTRY_VERSION = "2026-09-28";

export const PUBLISHERS: PublisherEntry[] = [
  {"key": "spa", "type": "official", "names": ["Saudi Press Agency", "SPA", "واس", "وكالة الأنباء السعودية"], "domains": ["spa.gov.sa"], "wireMarkers": ["(واس)", "واس -", "وكالة الأنباء السعودية", "Saudi Press Agency", "(SPA)"]},
  {"key": "reuters", "type": "wire", "names": ["Reuters", "رويترز"], "domains": ["reuters.com"], "wireMarkers": ["(Reuters)", "Reuters -", "رويترز", "(رويترز)"]},
  {"key": "ap", "type": "wire", "names": ["Associated Press", "AP News", "The Associated Press", "أسوشيتد برس"], "domains": ["apnews.com"], "wireMarkers": ["(AP)", "Associated Press", "أسوشيتد برس"]},
  {"key": "afp", "type": "wire", "names": ["AFP", "Agence France-Presse", "فرانس برس"], "domains": ["afp.com"], "wireMarkers": ["(AFP)", "AFP -", "فرانس برس", "(أ ف ب)", "أ ف ب"]},
  {"key": "bloomberg", "type": "wire", "names": ["Bloomberg", "بلومبرغ"], "domains": ["bloomberg.com"], "wireMarkers": ["(Bloomberg)", "بلومبرغ"]},
  {"key": "dpa", "type": "wire", "names": ["dpa", "Deutsche Presse-Agentur"], "domains": ["dpa.com", "dpa-international.com"], "wireMarkers": ["(dpa)", "د ب أ"]},
  {"key": "anadolu", "type": "wire", "names": ["Anadolu Agency", "Anadolu Ajansı", "الأناضول"], "domains": ["aa.com.tr"], "wireMarkers": ["(Anadolu)", "الأناضول"]},
  {"key": "wam", "type": "official", "names": ["WAM", "Emirates News Agency", "وام"], "domains": ["wam.ae"], "wireMarkers": ["(وام)", "(WAM)"]},
  {"key": "kuna", "type": "official", "names": ["KUNA", "Kuwait News Agency", "كونا"], "domains": ["kuna.net.kw"], "wireMarkers": ["(كونا)", "(KUNA)"]},
  {"key": "qna", "type": "official", "names": ["QNA", "Qatar News Agency", "قنا"], "domains": ["qna.org.qa"], "wireMarkers": ["(قنا)", "(QNA)"]},
  {"key": "bna", "type": "official", "names": ["BNA", "Bahrain News Agency", "بنا"], "domains": ["bna.bh"], "wireMarkers": ["(بنا)"]},
  {"key": "ona", "type": "official", "names": ["Oman News Agency", "العمانية"], "domains": ["omannews.gov.om"], "wireMarkers": ["(العمانية)"]},
  {"key": "fifa", "type": "official", "names": ["FIFA", "FIFA.com", "فيفا"], "domains": ["fifa.com", "inside.fifa.com"], "wireMarkers": []},
  {"key": "bbc", "type": "major", "names": ["BBC", "BBC News", "بي بي سي"], "domains": ["bbc.com", "bbc.co.uk"], "wireMarkers": []},
  {"key": "cnn", "type": "major", "names": ["CNN", "CNN International"], "domains": ["cnn.com"], "wireMarkers": []},
  {"key": "nyt", "type": "major", "names": ["The New York Times", "New York Times"], "domains": ["nytimes.com"], "wireMarkers": []},
  {"key": "wsj", "type": "major", "names": ["The Wall Street Journal", "WSJ"], "domains": ["wsj.com"], "wireMarkers": []},
  {"key": "ft", "type": "major", "names": ["Financial Times", "FT"], "domains": ["ft.com"], "wireMarkers": []},
  {"key": "guardian", "type": "major", "names": ["The Guardian"], "domains": ["theguardian.com"], "wireMarkers": []},
  {"key": "washingtonpost", "type": "major", "names": ["The Washington Post", "Washington Post"], "domains": ["washingtonpost.com"], "wireMarkers": []},
  {"key": "alarabiya", "type": "major", "names": ["Al Arabiya", "العربية", "Al Arabiya English"], "domains": ["alarabiya.net", "english.alarabiya.net"], "wireMarkers": []},
  {"key": "aawsat", "type": "major", "names": ["Asharq Al-Awsat", "الشرق الأوسط"], "domains": ["aawsat.com", "english.aawsat.com"], "wireMarkers": []},
  {"key": "aljazeera", "type": "major", "names": ["Al Jazeera", "الجزيرة", "Al Jazeera English"], "domains": ["aljazeera.com", "aljazeera.net"], "wireMarkers": []},
  {"key": "skynewsarabia", "type": "major", "names": ["Sky News Arabia", "سكاي نيوز عربية"], "domains": ["skynewsarabia.com"], "wireMarkers": []},
  {"key": "arabnews", "type": "major", "names": ["Arab News"], "domains": ["arabnews.com"], "wireMarkers": []},
  {"key": "saudigazette", "type": "major", "names": ["Saudi Gazette"], "domains": ["saudigazette.com.sa"], "wireMarkers": []},
  {"key": "okaz", "type": "major", "names": ["Okaz", "عكاظ"], "domains": ["okaz.com.sa"], "wireMarkers": []},
  {"key": "alriyadh", "type": "major", "names": ["Al Riyadh", "الرياض"], "domains": ["alriyadh.com"], "wireMarkers": []},
  {"key": "aleqt", "type": "major", "names": ["Aleqtisadiah", "الاقتصادية"], "domains": ["aleqt.com"], "wireMarkers": []},
  {"key": "alwatan", "type": "major", "names": ["Al Watan", "الوطن"], "domains": ["alwatan.com.sa"], "wireMarkers": []},
  {"key": "cnbc", "type": "major", "names": ["CNBC"], "domains": ["cnbc.com"], "wireMarkers": []},
  {"key": "espn", "type": "major", "names": ["ESPN"], "domains": ["espn.com"], "wireMarkers": []},
  {"key": "skysports", "type": "major", "names": ["Sky Sports"], "domains": ["skysports.com"], "wireMarkers": []},
  {"key": "lemonde", "type": "major", "names": ["Le Monde"], "domains": ["lemonde.fr"], "wireMarkers": []},
  {"key": "einpresswire", "type": "press_release", "names": ["EIN Presswire", "EIN News", "EINPresswire"], "domains": ["einpresswire.com", "einnews.com"], "wireMarkers": []},
  {"key": "prnewswire", "type": "press_release", "names": ["PR Newswire", "PRNewswire"], "domains": ["prnewswire.com", "prnewswire.co.uk"], "wireMarkers": ["/PRNewswire/"]},
  {"key": "globenewswire", "type": "press_release", "names": ["GlobeNewswire", "Globe Newswire"], "domains": ["globenewswire.com"], "wireMarkers": []},
  {"key": "businesswire", "type": "press_release", "names": ["Business Wire", "BusinessWire"], "domains": ["businesswire.com"], "wireMarkers": ["/BUSINESS WIRE/"]},
  {"key": "accesswire", "type": "press_release", "names": ["ACCESSWIRE", "Accesswire"], "domains": ["accesswire.com"], "wireMarkers": []},
  {"key": "openpr", "type": "press_release", "names": ["openPR", "openPR.com"], "domains": ["openpr.com"], "wireMarkers": []},
  {"key": "prlog", "type": "press_release", "names": ["PRLog"], "domains": ["prlog.org"], "wireMarkers": []},
  {"key": "newswire", "type": "press_release", "names": ["Newswire", "Newswire.com"], "domains": ["newswire.com"], "wireMarkers": []},
  {"key": "zawya-press", "type": "press_release", "names": ["Zawya Press Release"], "domains": [], "wireMarkers": []},
  {"key": "msn", "type": "aggregator", "names": ["MSN"], "domains": ["msn.com"], "wireMarkers": []},
  {"key": "yahoo", "type": "aggregator", "names": ["Yahoo", "Yahoo News", "Yahoo Finance"], "domains": ["yahoo.com", "news.yahoo.com", "finance.yahoo.com"], "wireMarkers": []},
];
