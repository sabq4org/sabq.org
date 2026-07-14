/**
 * جالب رصدات إكس — يحوّل رصدة (كلمة/هاشتاق/حساب/استعلام/ترند) إلى مواد
 * رادار موحّدة الشكل تدخل نفس خط التحليل والتنبيه، ويحفظ مؤشر آخر تغريدة
 * حتى لا يُدفع ثمن نفس التغريدات مرتين.
 */
import type { RadarSource } from "@shared/schema";
import type { NormalizedRadarItem } from "./repo";
import { updateSourceCursor } from "./repo";
import {
  buildWatchQuery,
  newestTweetId,
  resolveXProvider,
  type XProviderChoice,
  type XTweet,
  type XTrendEntry,
  type XWatchType,
} from "./xProvider";

// السعودية في تصنيف مواقع الترندات (WOEID)
const DEFAULT_TRENDS_WOEID = Number(process.env.RADAR_X_TRENDS_WOEID || 23424938);

function engagementLine(tweet: XTweet): string {
  const parts: string[] = [];
  if (tweet.viewCount) parts.push(`المشاهدات ${tweet.viewCount.toLocaleString("en")}`);
  if (tweet.likeCount) parts.push(`الإعجابات ${tweet.likeCount.toLocaleString("en")}`);
  if (tweet.retweetCount) parts.push(`إعادات النشر ${tweet.retweetCount.toLocaleString("en")}`);
  return parts.length ? `\nالتفاعل: ${parts.join(" · ")}` : "";
}

function normalizeTweet(tweet: XTweet): NormalizedRadarItem {
  const text = tweet.text.replace(/\s+/g, " ").trim();
  const author = tweet.authorName || tweet.authorHandle;
  return {
    guid: tweet.id,
    link: tweet.url,
    title: `${author ? `${author}: ` : ""}${text}`.substring(0, 300),
    excerpt: `${text}${engagementLine(tweet)}`.substring(0, 1200),
    imageUrl: tweet.imageUrl,
    publishedAt: tweet.createdAt,
  };
}

function normalizeTrend(trend: XTrendEntry, now: Date): NormalizedRadarItem {
  const countLine = trend.tweetCount
    ? ` — نحو ${trend.tweetCount.toLocaleString("en")} منشور`
    : "";
  return {
    // guid ثابت للترند نفسه: عودته وهو ما يزال في الجدول لا تكرره،
    // وعودته بعد التنظيف الدوري تظهر كإشارة جديدة مشروعة
    guid: `trend:${trend.name}`,
    link: trend.url,
    title: `ترند إكس${trend.rank ? ` #${trend.rank}` : ""}: ${trend.name}`.substring(0, 300),
    excerpt: `صعد "${trend.name}" في ترندات إكس${countLine}.`,
    // الترند لحظي بلا تاريخ نشر — وقت الرصد هو تاريخه وإلا أسقطته بوابة الحداثة
    publishedAt: now,
  };
}

/** يجلب رصدة إكس ويحدّث مؤشرها — يستدعيه fetchSource عند type = "x" */
export async function fetchXSource(source: RadarSource): Promise<NormalizedRadarItem[]> {
  const xType = (source.xType ?? "keyword") as XWatchType;
  const value = source.xValue?.trim();
  if (!value) throw new Error("رصدة إكس بلا قيمة (x_value)");

  const provider = resolveXProvider(xType, (source.xProvider ?? "auto") as XProviderChoice);

  if (xType === "trend") {
    const woeid = /^\d+$/.test(value) ? Number(value) : DEFAULT_TRENDS_WOEID;
    const now = new Date();
    return (await provider.trends(woeid)).map((trend) => normalizeTrend(trend, now));
  }

  const tweets = await provider.searchRecent(
    buildWatchQuery(xType, value),
    source.xSinceId ?? undefined
  );
  const cursor = newestTweetId(tweets);
  if (cursor && cursor !== source.xSinceId) {
    await updateSourceCursor(source.id, cursor);
  }
  return tweets.map(normalizeTweet);
}
