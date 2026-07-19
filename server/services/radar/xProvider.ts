/**
 * مزوّدا بيانات إكس خلف واجهة واحدة — تنفيذ القرار الهجين:
 * الرسمي (X API v2) للأحمال منخفضة الحجم الحساسة (حسابات رسمية، ترندات)،
 * وطرف ثالث (twitterapi.io) للبحث الواسع بالكلمات والهاشتاقات.
 * سقوط أي مزوّد لا يعمي الرادار: التوجيه auto يستخدم المتوفر من المفاتيح،
 * والتبديل النهائي قلبُ متغير بيئة أو عمود x_provider للرصدة — لا تغيير كود.
 */

const FETCH_TIMEOUT_MS = 15_000;
const MAX_TWEETS_PER_FETCH = 30;

export interface XTweet {
  id: string;
  text: string;
  authorHandle?: string;
  authorName?: string;
  url: string;
  createdAt?: Date;
  likeCount?: number;
  retweetCount?: number;
  viewCount?: number;
  imageUrl?: string;
}

export interface XTrendEntry {
  name: string;
  rank?: number;
  tweetCount?: number;
  url: string;
}

export interface XProviderClient {
  name: "official" | "twitterapiio";
  /** بحث بصيغة استعلام إكس القياسية (from: و# والعبارات المقتبسة تعمل عند المزوّدين) */
  searchRecent(query: string, sinceId?: string): Promise<XTweet[]>;
  trends(woeid: number): Promise<XTrendEntry[]>;
}

async function fetchJsonWithTimeout(url: string, headers: Record<string, string>): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status} ${body.substring(0, 200)}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/** مقارنة معرفات التغريدات (snowflake) رقميًا — أطول = أحدث، وعند التساوي قاموسيًا */
export function isNewerTweetId(id: string, than: string): boolean {
  if (id.length !== than.length) return id.length > than.length;
  return id > than;
}

export function newestTweetId(tweets: { id: string }[]): string | undefined {
  let newest: string | undefined;
  for (const tweet of tweets) {
    if (!/^\d+$/.test(tweet.id)) continue;
    if (!newest || isNewerTweetId(tweet.id, newest)) newest = tweet.id;
  }
  return newest;
}

// ---------- المزوّد الرسمي (X API v2 — دفع بالاستخدام) ----------

class OfficialXProvider implements XProviderClient {
  readonly name = "official" as const;
  constructor(private bearerToken: string) {}

  private headers() {
    return { Authorization: `Bearer ${this.bearerToken}` };
  }

  async searchRecent(query: string, sinceId?: string): Promise<XTweet[]> {
    const params = new URLSearchParams({
      query,
      max_results: String(MAX_TWEETS_PER_FETCH),
      "tweet.fields": "created_at,public_metrics,author_id",
      expansions: "author_id,attachments.media_keys",
      "media.fields": "url,preview_image_url",
      "user.fields": "username,name",
    });
    if (sinceId) params.set("since_id", sinceId);
    const payload = await fetchJsonWithTimeout(
      `https://api.x.com/2/tweets/search/recent?${params}`,
      this.headers()
    );

    const users = new Map<string, { username?: string; name?: string }>();
    for (const user of payload?.includes?.users ?? []) {
      if (user?.id) users.set(String(user.id), { username: user.username, name: user.name });
    }
    const media = new Map<string, string>();
    for (const m of payload?.includes?.media ?? []) {
      const mediaUrl = m?.url || m?.preview_image_url;
      if (m?.media_key && mediaUrl) media.set(String(m.media_key), String(mediaUrl));
    }

    const tweets: XTweet[] = [];
    for (const raw of payload?.data ?? []) {
      if (!raw?.id || !raw?.text) continue;
      const author = users.get(String(raw.author_id));
      const handle = author?.username;
      const mediaKey = raw?.attachments?.media_keys?.[0];
      tweets.push({
        id: String(raw.id),
        text: String(raw.text),
        authorHandle: handle,
        authorName: author?.name,
        url: `https://x.com/${handle ?? "i"}/status/${raw.id}`,
        createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
        likeCount: raw.public_metrics?.like_count,
        retweetCount: raw.public_metrics?.retweet_count,
        viewCount: raw.public_metrics?.impression_count,
        imageUrl: mediaKey ? media.get(String(mediaKey)) : undefined,
      });
    }
    return tweets;
  }

  async trends(woeid: number): Promise<XTrendEntry[]> {
    const payload = await fetchJsonWithTimeout(
      `https://api.x.com/2/trends/by/woeid/${woeid}`,
      this.headers()
    );
    const list = Array.isArray(payload?.data) ? payload.data : [];
    return list
      .filter((t: any) => t?.trend_name || t?.name)
      .map((t: any, index: number) => {
        const name = String(t.trend_name ?? t.name);
        return {
          name,
          rank: index + 1,
          tweetCount: Number(t.tweet_count) || undefined,
          url: `https://x.com/search?q=${encodeURIComponent(name)}`,
        };
      });
  }
}

// ---------- مزوّد الطرف الثالث (twitterapi.io — دفع لكل ألف تغريدة) ----------

class TwitterApiIoProvider implements XProviderClient {
  readonly name = "twitterapiio" as const;
  constructor(private apiKey: string) {}

  private headers() {
    return { "X-API-Key": this.apiKey };
  }

  async searchRecent(query: string, sinceId?: string): Promise<XTweet[]> {
    // since_id ضمن الاستعلام (صيغة بحث إكس)، ونرشّح محليًا أيضًا احتياطًا
    const effectiveQuery = sinceId ? `${query} since_id:${sinceId}` : query;
    const params = new URLSearchParams({ query: effectiveQuery, queryType: "Latest" });
    const payload = await fetchJsonWithTimeout(
      `https://api.twitterapi.io/twitter/tweet/advanced_search?${params}`,
      this.headers()
    );

    const tweets: XTweet[] = [];
    for (const raw of payload?.tweets ?? []) {
      if (!raw?.id || !raw?.text) continue;
      const id = String(raw.id);
      if (sinceId && /^\d+$/.test(id) && !isNewerTweetId(id, sinceId)) continue;
      const handle = raw.author?.userName;
      tweets.push({
        id,
        text: String(raw.text),
        authorHandle: handle,
        authorName: raw.author?.name,
        url: String(raw.url || `https://x.com/${handle ?? "i"}/status/${id}`),
        createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
        likeCount: Number(raw.likeCount) || undefined,
        retweetCount: Number(raw.retweetCount) || undefined,
        viewCount: Number(raw.viewCount) || undefined,
        imageUrl: raw.entities?.media?.[0]?.media_url_https,
      });
      if (tweets.length >= MAX_TWEETS_PER_FETCH) break;
    }
    return tweets;
  }

  async trends(woeid: number): Promise<XTrendEntry[]> {
    const payload = await fetchJsonWithTimeout(
      `https://api.twitterapi.io/twitter/trends?woeid=${woeid}`,
      this.headers()
    );
    const list = Array.isArray(payload?.trends) ? payload.trends : [];
    return list
      .filter((t: any) => t?.name || t?.trend?.name)
      .map((t: any, index: number) => {
        const name = String(t.name ?? t.trend?.name);
        const query = t.target?.query ? String(t.target.query) : name;
        return {
          name,
          rank: Number(t.rank) || index + 1,
          tweetCount: Number(t.tweet_count ?? t.tweetCount) || undefined,
          url: `https://x.com/search?q=${encodeURIComponent(query)}`,
        };
      });
  }
}

// ---------- الرصدات: النوع والاستعلام (دوال نقية — قابلة للاختبار في tests/unit) ----------

export type XWatchType = "keyword" | "hashtag" | "account" | "query" | "trend";
export type XProviderChoice = "auto" | "official" | "twitterapiio";

/** تخمين نوع الرصدة من نص واحد يكتبه المحرر: @حساب، #هاشتاق، استعلام بمعاملات، أو كلمة */
export function detectWatchType(value: string): XWatchType {
  const trimmed = value.trim();
  if (/^@[A-Za-z0-9_]{1,15}$/.test(trimmed)) return "account";
  if (trimmed.startsWith("#")) return "hashtag";
  if (/(?:^|\s)(from:|to:|OR\s|AND\s|-is:|lang:|url:)/i.test(trimmed)) return "query";
  return "keyword";
}

/** استعلام إكس القياسي للرصدة — الحسابات عبر from: (أرخص من مسار التايملاين الرسمي) */
export function buildWatchQuery(xType: XWatchType, value: string): string {
  const trimmed = value.trim();
  switch (xType) {
    case "account":
      return `from:${trimmed.replace(/^@/, "")}`;
    case "hashtag":
      return `${trimmed.startsWith("#") ? trimmed : `#${trimmed}`} -is:retweet`;
    case "query":
      return trimmed;
    default: {
      // عبارة متعددة الكلمات بلا معاملات → مطابقة حرفية بالاقتباس
      const needsQuotes = /\s/.test(trimmed) && !/["():]/.test(trimmed);
      return `${needsQuotes ? `"${trimmed}"` : trimmed} -is:retweet`;
    }
  }
}

// ---------- التوجيه الهجين ----------

function officialClient(): XProviderClient | null {
  const token = process.env.X_API_BEARER_TOKEN;
  return token ? new OfficialXProvider(token) : null;
}

function thirdPartyClient(): XProviderClient | null {
  const key = process.env.TWITTERAPI_IO_API_KEY;
  return key ? new TwitterApiIoProvider(key) : null;
}

export function xProvidersConfigured(): { official: boolean; twitterapiio: boolean } {
  return {
    official: Boolean(process.env.X_API_BEARER_TOKEN),
    twitterapiio: Boolean(process.env.TWITTERAPI_IO_API_KEY),
  };
}

/**
 * اختيار المزوّد لرصدة:
 * - اختيار صريح → إياه (وخطأ واضح إن غاب مفتاحه).
 * - auto → الحسابات والترندات على الرسمي (حجم صغير + خصم تكرار 24 ساعة)،
 *   والكلمات/الهاشتاقات/الاستعلامات على الطرف الثالث (أرخص 30×)، مع
 *   السقوط للمتوفر إذا غاب المفضّل.
 */
export function resolveXProvider(
  xType: XWatchType,
  choice: XProviderChoice = "auto"
): XProviderClient {
  const official = officialClient();
  const thirdParty = thirdPartyClient();

  if (choice === "official") {
    if (!official) throw new Error("X_API_BEARER_TOKEN غير مضبوط — الرصدة تطلب المزوّد الرسمي");
    return official;
  }
  if (choice === "twitterapiio") {
    if (!thirdParty) throw new Error("TWITTERAPI_IO_API_KEY غير مضبوط — الرصدة تطلب twitterapi.io");
    return thirdParty;
  }

  const preferOfficial = xType === "account" || xType === "trend";
  const picked = preferOfficial ? official ?? thirdParty : thirdParty ?? official;
  if (!picked) {
    throw new Error("لا مزوّد إكس مضبوطًا — أضف X_API_BEARER_TOKEN أو TWITTERAPI_IO_API_KEY");
  }
  return picked;
}
