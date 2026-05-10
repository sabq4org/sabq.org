import OpenAI from "openai";

const openai = new OpenAI();

export interface GeoLocation {
  name: string;
  nameEn: string;
  country: string;
  lat: number;
  lng: number;
}

const KNOWN_LOCATIONS: Record<string, GeoLocation> = {
  "riyadh": { name: "الرياض", nameEn: "Riyadh", country: "SA", lat: 24.7136, lng: 46.6753 },
  "jeddah": { name: "جدة", nameEn: "Jeddah", country: "SA", lat: 21.4858, lng: 39.1925 },
  "mecca": { name: "مكة المكرمة", nameEn: "Mecca", country: "SA", lat: 21.3891, lng: 39.8579 },
  "makkah": { name: "مكة المكرمة", nameEn: "Mecca", country: "SA", lat: 21.3891, lng: 39.8579 },
  "medina": { name: "المدينة المنورة", nameEn: "Medina", country: "SA", lat: 24.5247, lng: 39.5692 },
  "madinah": { name: "المدينة المنورة", nameEn: "Medina", country: "SA", lat: 24.5247, lng: 39.5692 },
  "dammam": { name: "الدمام", nameEn: "Dammam", country: "SA", lat: 26.3927, lng: 49.9777 },
  "khobar": { name: "الخبر", nameEn: "Khobar", country: "SA", lat: 26.2172, lng: 50.1971 },
  "dhahran": { name: "الظهران", nameEn: "Dhahran", country: "SA", lat: 26.2361, lng: 50.0393 },
  "tabuk": { name: "تبوك", nameEn: "Tabuk", country: "SA", lat: 28.3838, lng: 36.5550 },
  "abha": { name: "أبها", nameEn: "Abha", country: "SA", lat: 18.2164, lng: 42.5053 },
  "taif": { name: "الطائف", nameEn: "Taif", country: "SA", lat: 21.2700, lng: 40.4200 },
  "hail": { name: "حائل", nameEn: "Hail", country: "SA", lat: 27.5114, lng: 41.7208 },
  "jizan": { name: "جازان", nameEn: "Jizan", country: "SA", lat: 16.8892, lng: 42.5511 },
  "najran": { name: "نجران", nameEn: "Najran", country: "SA", lat: 17.4924, lng: 44.1277 },
  "buraydah": { name: "بريدة", nameEn: "Buraydah", country: "SA", lat: 26.3260, lng: 43.9750 },
  "qassim": { name: "القصيم", nameEn: "Qassim", country: "SA", lat: 26.2079, lng: 43.4844 },
  "yanbu": { name: "ينبع", nameEn: "Yanbu", country: "SA", lat: 24.0895, lng: 38.0618 },
  "jubail": { name: "الجبيل", nameEn: "Jubail", country: "SA", lat: 27.0046, lng: 49.6225 },
  "neom": { name: "نيوم", nameEn: "NEOM", country: "SA", lat: 27.9500, lng: 35.5833 },
  "alula": { name: "العلا", nameEn: "AlUla", country: "SA", lat: 26.6174, lng: 37.9160 },
  "dubai": { name: "دبي", nameEn: "Dubai", country: "AE", lat: 25.2048, lng: 55.2708 },
  "abu dhabi": { name: "أبو ظبي", nameEn: "Abu Dhabi", country: "AE", lat: 24.4539, lng: 54.3773 },
  "sharjah": { name: "الشارقة", nameEn: "Sharjah", country: "AE", lat: 25.3463, lng: 55.4209 },
  "doha": { name: "الدوحة", nameEn: "Doha", country: "QA", lat: 25.2854, lng: 51.5310 },
  "kuwait city": { name: "الكويت", nameEn: "Kuwait City", country: "KW", lat: 29.3759, lng: 47.9774 },
  "kuwait": { name: "الكويت", nameEn: "Kuwait", country: "KW", lat: 29.3759, lng: 47.9774 },
  "manama": { name: "المنامة", nameEn: "Manama", country: "BH", lat: 26.2285, lng: 50.5860 },
  "bahrain": { name: "البحرين", nameEn: "Bahrain", country: "BH", lat: 26.0667, lng: 50.5577 },
  "muscat": { name: "مسقط", nameEn: "Muscat", country: "OM", lat: 23.5880, lng: 58.3829 },
  "cairo": { name: "القاهرة", nameEn: "Cairo", country: "EG", lat: 30.0444, lng: 31.2357 },
  "alexandria": { name: "الإسكندرية", nameEn: "Alexandria", country: "EG", lat: 31.2001, lng: 29.9187 },
  "amman": { name: "عمّان", nameEn: "Amman", country: "JO", lat: 31.9454, lng: 35.9284 },
  "beirut": { name: "بيروت", nameEn: "Beirut", country: "LB", lat: 33.8938, lng: 35.5018 },
  "baghdad": { name: "بغداد", nameEn: "Baghdad", country: "IQ", lat: 33.3152, lng: 44.3661 },
  "damascus": { name: "دمشق", nameEn: "Damascus", country: "SY", lat: 33.5138, lng: 36.2765 },
  "tunis": { name: "تونس", nameEn: "Tunis", country: "TN", lat: 36.8065, lng: 10.1815 },
  "rabat": { name: "الرباط", nameEn: "Rabat", country: "MA", lat: 34.0209, lng: -6.8416 },
  "algiers": { name: "الجزائر", nameEn: "Algiers", country: "DZ", lat: 36.7538, lng: 3.0588 },
  "khartoum": { name: "الخرطوم", nameEn: "Khartoum", country: "SD", lat: 15.5007, lng: 32.5599 },
  "sana'a": { name: "صنعاء", nameEn: "Sana'a", country: "YE", lat: 15.3694, lng: 44.1910 },
  "sanaa": { name: "صنعاء", nameEn: "Sana'a", country: "YE", lat: 15.3694, lng: 44.1910 },
  "aden": { name: "عدن", nameEn: "Aden", country: "YE", lat: 12.7855, lng: 45.0187 },
  "washington": { name: "واشنطن", nameEn: "Washington", country: "US", lat: 38.9072, lng: -77.0369 },
  "london": { name: "لندن", nameEn: "London", country: "GB", lat: 51.5074, lng: -0.1278 },
  "paris": { name: "باريس", nameEn: "Paris", country: "FR", lat: 48.8566, lng: 2.3522 },
  "moscow": { name: "موسكو", nameEn: "Moscow", country: "RU", lat: 55.7558, lng: 37.6173 },
  "beijing": { name: "بكين", nameEn: "Beijing", country: "CN", lat: 39.9042, lng: 116.4074 },
  "tokyo": { name: "طوكيو", nameEn: "Tokyo", country: "JP", lat: 35.6762, lng: 139.6503 },
  "new york": { name: "نيويورك", nameEn: "New York", country: "US", lat: 40.7128, lng: -74.0060 },
  "ankara": { name: "أنقرة", nameEn: "Ankara", country: "TR", lat: 39.9334, lng: 32.8597 },
  "istanbul": { name: "إسطنبول", nameEn: "Istanbul", country: "TR", lat: 41.0082, lng: 28.9784 },
  "tehran": { name: "طهران", nameEn: "Tehran", country: "IR", lat: 35.6892, lng: 51.3890 },
  "islamabad": { name: "إسلام آباد", nameEn: "Islamabad", country: "PK", lat: 33.6844, lng: 73.0479 },
  "new delhi": { name: "نيودلهي", nameEn: "New Delhi", country: "IN", lat: 28.6139, lng: 77.2090 },
  "al quwaiyah": { name: "القويعية", nameEn: "Al Quwaiyah", country: "SA", lat: 24.0434, lng: 45.2814 },
  "quwaiyah": { name: "القويعية", nameEn: "Al Quwaiyah", country: "SA", lat: 24.0434, lng: 45.2814 },
  "arar": { name: "عرعر", nameEn: "Arar", country: "SA", lat: 30.9753, lng: 41.0381 },
  "al baha": { name: "الباحة", nameEn: "Al Baha", country: "SA", lat: 20.0000, lng: 41.4667 },
  "baha": { name: "الباحة", nameEn: "Al Baha", country: "SA", lat: 20.0000, lng: 41.4667 },
  "khamis mushait": { name: "خميس مشيط", nameEn: "Khamis Mushait", country: "SA", lat: 18.3061, lng: 42.7350 },
  "sakaka": { name: "سكاكا", nameEn: "Sakaka", country: "SA", lat: 29.9697, lng: 40.2064 },
  "al jouf": { name: "الجوف", nameEn: "Al Jouf", country: "SA", lat: 29.8117, lng: 39.8684 },
  "jouf": { name: "الجوف", nameEn: "Al Jouf", country: "SA", lat: 29.8117, lng: 39.8684 },
  "hafr al batin": { name: "حفر الباطن", nameEn: "Hafr Al Batin", country: "SA", lat: 28.4337, lng: 45.9708 },
  "al ahsa": { name: "الأحساء", nameEn: "Al Ahsa", country: "SA", lat: 25.3494, lng: 49.5886 },
  "ahsa": { name: "الأحساء", nameEn: "Al Ahsa", country: "SA", lat: 25.3494, lng: 49.5886 },
  "al kharj": { name: "الخرج", nameEn: "Al Kharj", country: "SA", lat: 24.1556, lng: 47.3122 },
  "diriyah": { name: "الدرعية", nameEn: "Diriyah", country: "SA", lat: 24.7343, lng: 46.5726 },
  "al zulfi": { name: "الزلفي", nameEn: "Al Zulfi", country: "SA", lat: 26.2927, lng: 44.8117 },
  "al rass": { name: "الرس", nameEn: "Al Rass", country: "SA", lat: 25.8683, lng: 43.5039 },
  "northern borders": { name: "الحدود الشمالية", nameEn: "Northern Borders", country: "SA", lat: 30.9753, lng: 41.0381 },
  "الحدود الشمالية": { name: "الحدود الشمالية", nameEn: "Northern Borders", country: "SA", lat: 30.9753, lng: 41.0381 },
  "eastern province": { name: "الشرقية", nameEn: "Eastern Province", country: "SA", lat: 26.3927, lng: 49.9777 },
  "الشرقية": { name: "الشرقية", nameEn: "Eastern Province", country: "SA", lat: 26.3927, lng: 49.9777 },
  "uzbekistan": { name: "أوزبكستان", nameEn: "Uzbekistan", country: "UZ", lat: 41.2995, lng: 69.2401 },
  "gaza": { name: "غزة", nameEn: "Gaza", country: "PS", lat: 31.3547, lng: 34.3088 },
  "jerusalem": { name: "القدس", nameEn: "Jerusalem", country: "PS", lat: 31.7683, lng: 35.2137 },
  "al quds": { name: "القدس", nameEn: "Jerusalem", country: "PS", lat: 31.7683, lng: 35.2137 },
  "badr": { name: "بدر", nameEn: "Badr", country: "SA", lat: 23.7833, lng: 38.7833 },
};

function stripHtml(html: string): string {
  let text = html.replace(/<[^>]*>/g, '');
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

const SPORTS_TEAM_NAMES = new Set([
  'الهلال', 'الاتحاد', 'النصر', 'الأهلي', 'التعاون', 'العروبة', 'الشباب',
  'الفيصلي', 'الباطن', 'ضمك', 'الخليج', 'الفتح', 'الرائد', 'الطائي',
  'الوحدة', 'الحزم', 'أُحد', 'الأخدود', 'الخلود', 'العين',
  'al-hilal', 'al-ittihad', 'al-nassr', 'al-ahli', 'al-taawoun', 'al-orobah',
  'al-shabab', 'al-faisaly', 'al-batin', 'damac', 'al-khaleej', 'al-fateh',
  'al-raed', 'al-tai', 'al-wehda', 'al-hazem', 'ohod', 'al-akhdoud', 'al-kholood',
]);

function isSportsTeamName(name: string): boolean {
  const cleaned = name.trim();
  if (SPORTS_TEAM_NAMES.has(cleaned)) return true;
  if (SPORTS_TEAM_NAMES.has(cleaned.toLowerCase())) return true;
  return false;
}

function matchKnownLocation(nameEn: string): GeoLocation | null {
  const key = nameEn.toLowerCase().trim();
  if (KNOWN_LOCATIONS[key]) {
    return KNOWN_LOCATIONS[key];
  }
  for (const [locKey, loc] of Object.entries(KNOWN_LOCATIONS)) {
    if (key.includes(locKey) || locKey.includes(key)) {
      return loc;
    }
  }
  return null;
}

export async function extractGeoLocations(title: string, content: string): Promise<GeoLocation[]> {
  try {
    const cleanContent = stripHtml(content).substring(0, 2000);
    const cleanTitle = stripHtml(title);

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `أنت نظام استخراج مواقع جغرافية من الأخبار العربية والخليجية. مهمتك تحديد المدن والدول والأماكن المهمة المذكورة في الخبر.

قواعد مهمة:
- استخرج فقط المواقع الجغرافية الحقيقية (مدن، دول، مناطق) وليس أسماء أندية رياضية أو منظمات
- لا تستخرج أسماء الأندية الرياضية مثل: الهلال، الاتحاد، النصر، الأهلي، التعاون، العروبة، الشباب، الفيصلي، الباطن، ضمك، الخليج، الفتح، الرائد، الطائي، أبها (النادي)
- استخرج فقط المواقع التي هي موضوع الخبر الرئيسي، وليس المذكورة عرضاً
- الأولوية: مدن سعودية ← مدن خليجية ← عربية ← دولية
- أعد 5 مواقع كحد أقصى
- أعد النتيجة بصيغة JSON فقط

أعد مصفوفة JSON بالشكل:
{"locations": [{"name": "الاسم بالعربية", "nameEn": "English Name", "country": "XX", "lat": 0.0, "lng": 0.0}]}

حيث country هو رمز الدولة المكون من حرفين (SA, AE, QA, KW, BH, OM, EG, JO, LB, IQ, SY, US, GB, FR, etc.)
إذا لم تجد مواقع جغرافية واضحة، أعد: {"locations": []}`
        },
        {
          role: "user",
          content: `العنوان: ${cleanTitle}\n\nالمحتوى: ${cleanContent}`
        }
      ],
      response_format: { type: "json_object" },
      max_tokens: 500,
      temperature: 0.1,
    });

    const messageContent = response.choices?.[0]?.message?.content;
    if (!messageContent) {
      console.warn("[GeoExtraction] Empty response from OpenAI");
      return [];
    }

    const result = JSON.parse(messageContent);
    const rawLocations: GeoLocation[] = result.locations || [];

    if (rawLocations.length === 0) {
      return [];
    }

    const locations: GeoLocation[] = rawLocations
      .filter(loc => !isSportsTeamName(loc.name) && !isSportsTeamName(loc.nameEn))
      .filter(loc => !(loc.lat === 0 && loc.lng === 0))
      .slice(0, 5)
      .map((loc) => {
        const known = matchKnownLocation(loc.nameEn);
        if (known) {
          return {
            name: known.name,
            nameEn: known.nameEn,
            country: known.country,
            lat: known.lat,
            lng: known.lng,
          };
        }
        return {
          name: loc.name,
          nameEn: loc.nameEn,
          country: loc.country,
          lat: loc.lat,
          lng: loc.lng,
        };
      });

    console.log(`[GeoExtraction] Extracted ${locations.length} locations: ${locations.map(l => l.nameEn).join(', ')}`);
    return locations;
  } catch (error) {
    console.error("[GeoExtraction] Error extracting geo locations:", error);
    return [];
  }
}
