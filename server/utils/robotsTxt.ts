import { apiListingRobotsRules } from "./apiListingRobots";

// robots.txt لـ sabq.org (يُخدم عبر بروكسي Pages من Express).
// Content-Signal يطابق سياسة /ai-policy (Sabq-AI-Use-1.0): لا تغيّر ai-train
// دون تعديل صفحة السياسة في نفس الـ PR. راجع docs/systems/seo-ssr/SYSTEM.md.
export const CONTENT_SIGNAL = "search=yes, ai-input=yes, ai-train=no";

export function buildRobotsTxt(): string {
  return `# صحيفة سبق الإلكترونية — robots.txt
# سياسة استخدام المحتوى في الذكاء الاصطناعي: https://sabq.org/ai-policy (Sabq-AI-Use-1.0)
# Content-Signal (contentsignals.org) يعلن السياسة نفسها للزواحف:
#   search=yes   الفهرسة والظهور في نتائج البحث
#   ai-input=yes الاستشهاد في إجابات المساعدات الذكية مع الإسناد والرابط (الاستدلال)
#   ai-train=no  لا تدريب أو ضبط دقيق للنماذج دون اتفاق مكتوب (partnerships@sabq.org)
# دليل للنماذج اللغوية: https://sabq.org/llms.txt
User-agent: *
Content-Signal: ${CONTENT_SIGNAL}
Allow: /
Disallow: /api/
${apiListingRobotsRules}

# ملاحظة: صفحات الحساب والمصادقة (login, register, logout, *-password,
# 2fa-verify, verify-email, profile, bookmarks, reading-history, my-*,
# notification-settings, recommendation-settings, select-interests,
# dashboard, admin, ifox, onboarding, payment) لم تَعُد محظورة هنا عمدًا.
# حظرها بـ robots.txt كان يُبقيها "مفهرسة رغم الحظر بواسطة robots.txt" في
# Search Console: لأن Google لا يستطيع زحفها، فلا يرى وسم noindex ولا يُسقطها.
# الآن يستطيع زحفها ويرى X-Robots-Tag: noindex (يضيفه وسيط Cloudflare Pages
# لكل مسارات noindex — راجع functions/_middleware.js) فيُسقطها من الفهرس.
# بقية /api/ تبقى محظورة. قائمتا الأخبار المحددتان أعلاه قابلتان للزحف
# لرؤية X-Robots-Tag: noindex, nofollow؛ الترويسة صالحة لموارد JSON أيضاً.

# Googlebot-News intentionally has NO separate group — a previous
# "Disallow: /" (with a few Allow exceptions) blocked it from the homepage
# and section/category pages, which is where Google News discovers new
# articles. With no group of its own it falls back to "User-agent: *" above
# and can crawl everything public (articles + sections), which is what we want.

Sitemap: https://sabq.org/sitemap.xml
Sitemap: https://sabq.org/sitemap-news.xml
`;
}
