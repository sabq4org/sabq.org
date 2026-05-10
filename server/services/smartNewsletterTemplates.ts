/**
 * Smart Newsletter Email Templates
 * قوالب النشرة البريدية الذكية مع تصميم جذاب ومتجاوب
 */

import type { Article } from "@shared/schema";

// Template types for different newsletter styles
export type NewsletterTemplateType = 
  | 'morning_brief' 
  | 'evening_digest' 
  | 'weekly_roundup'
  | 'breaking_news'
  | 'personalized_digest';

// Article summary with engagement elements
export interface ArticleSummary {
  id: string;
  title: string;
  excerpt: string;
  url?: string;
  imageUrl?: string;
  categoryName?: string;
  categoryColor?: string;
  readTime?: number;
  isExclusive?: boolean;
  isTrending?: boolean;
}

// Newsletter content structure
export interface NewsletterContent {
  subscriberEmail: string;
  subscriberName?: string;
  templateType: NewsletterTemplateType;
  subject: string;
  preheaderText: string;
  personalizedIntro: string;
  mainArticle?: ArticleSummary;
  articles: ArticleSummary[];
  dailyQuestion?: {
    question: string;
    options?: string[];
    link?: string;
  };
  exclusiveContent?: {
    title: string;
    teaser: string;
    link: string;
  };
  quickStats?: {
    label: string;
    value: string;
    trend?: 'up' | 'down' | 'neutral';
  }[];
  callToAction?: {
    text: string;
    link: string;
    style: 'primary' | 'secondary' | 'outline';
  };
  unsubscribeToken: string;
  audioUrl?: string;
  websiteUrl: string;
}

// Template color schemes - Premium design
const TEMPLATE_COLORS: Record<NewsletterTemplateType, { primary: string; secondary: string; accent: string }> = {
  morning_brief: { primary: '#1a5f7a', secondary: '#f8fafc', accent: '#f59e0b' },
  evening_digest: { primary: '#4c1d95', secondary: '#faf5ff', accent: '#a855f7' },
  weekly_roundup: { primary: '#065f46', secondary: '#f0fdf4', accent: '#34d399' },
  breaking_news: { primary: '#b91c1c', secondary: '#fef2f2', accent: '#fb923c' },
  personalized_digest: { primary: '#6d28d9', secondary: '#f5f3ff', accent: '#f472b6' },
};

// Template icons (SVG data URIs for email compatibility)
const ICONS = {
  sun: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path></svg>`,
  moon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path></svg>`,
  calendar: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`,
  fire: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path></svg>`,
  star: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,
  trending: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>`,
  clock: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
  headphones: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"></path><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path></svg>`,
  sparkles: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path><path d="M5 3v4"></path><path d="M19 17v4"></path><path d="M3 5h4"></path><path d="M17 19h4"></path></svg>`,
};

// Get time-appropriate greeting icon
function getTemplateIcon(type: NewsletterTemplateType): string {
  switch (type) {
    case 'morning_brief': return ICONS.sun;
    case 'evening_digest': return ICONS.moon;
    case 'weekly_roundup': return ICONS.calendar;
    case 'breaking_news': return ICONS.fire;
    case 'personalized_digest': return ICONS.sparkles;
    default: return ICONS.star;
  }
}

// Get template title in Arabic
function getTemplateTitle(type: NewsletterTemplateType): string {
  switch (type) {
    case 'morning_brief': return 'نشرة سبق الصباحية';
    case 'evening_digest': return 'نشرة سبق المسائية';
    case 'weekly_roundup': return 'النشرة الأسبوعية';
    case 'breaking_news': return 'عاجل | سبق';
    case 'personalized_digest': return 'اختياراتك الخاصة';
    default: return 'نشرة سبق الإخبارية';
  }
}

/**
 * Generate the main newsletter HTML template
 */
export function generateNewsletterHTML(content: NewsletterContent): string {
  const colors = TEMPLATE_COLORS[content.templateType];
  const templateIcon = getTemplateIcon(content.templateType);
  const templateTitle = getTemplateTitle(content.templateType);
  const currentDate = new Date().toLocaleDateString('ar-SA-u-ca-gregory', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <title>${content.subject}</title>
  <style>
    /* Reset styles */
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; font-size: inherit !important; font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important; }
    
    /* Google Fonts for Arabic */
    @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap');
    
    /* Main styles */
    body { font-family: 'Tajawal', 'Segoe UI', Tahoma, sans-serif; background-color: #f5f5f5; direction: rtl; }
    .email-wrapper { max-width: 640px; margin: 0 auto; background: #ffffff; }
    
    /* Header */
    .header { background: linear-gradient(135deg, ${colors.primary} 0%, ${adjustColor(colors.primary, -20)} 100%); padding: 32px 24px; text-align: center; }
    .header-icon { color: rgba(255,255,255,0.9); margin-bottom: 12px; }
    .header h1 { color: #ffffff; font-size: 26px; margin: 0 0 8px 0; font-weight: 700; letter-spacing: -0.5px; }
    .header .date { color: rgba(255,255,255,0.85); font-size: 14px; margin: 0; }
    
    /* Preheader (hidden preview text) */
    .preheader { display: none !important; visibility: hidden; opacity: 0; color: transparent; height: 0; width: 0; }
    
    /* Content area */
    .content { padding: 32px 24px; }
    .intro { font-size: 17px; line-height: 1.8; color: #374151; margin-bottom: 28px; background: ${colors.secondary}; padding: 20px; border-radius: 12px; border-right: 4px solid ${colors.primary}; }
    
    /* Featured article */
    .featured-article { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden; margin-bottom: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
    .featured-article img { width: 100%; height: 200px; object-fit: cover; }
    .featured-article-content { padding: 20px; }
    .featured-badge { display: inline-block; background: ${colors.accent}; color: #ffffff; font-size: 12px; font-weight: 600; padding: 4px 12px; border-radius: 20px; margin-bottom: 12px; }
    .featured-article h2 { font-size: 20px; color: #1f2937; margin: 0 0 12px 0; line-height: 1.5; }
    .featured-article p { color: #6b7280; font-size: 15px; line-height: 1.7; margin: 0 0 16px 0; }
    .read-more { display: inline-block; background: ${colors.primary}; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; transition: background 0.2s; }
    .read-more:hover { background: ${adjustColor(colors.primary, -15)}; }
    
    /* Article cards */
    .articles-section { margin: 28px 0; }
    .section-title { font-size: 18px; color: #1f2937; font-weight: 700; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
    .section-title svg { color: ${colors.primary}; }
    
    .article-card { display: flex; gap: 16px; padding: 16px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; margin-bottom: 12px; text-decoration: none; transition: box-shadow 0.2s; }
    .article-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    .article-card img { width: 100px; height: 80px; object-fit: cover; border-radius: 8px; flex-shrink: 0; }
    .article-card-content { flex: 1; }
    .article-card h3 { font-size: 15px; color: #1f2937; margin: 0 0 8px 0; line-height: 1.5; font-weight: 600; }
    .article-card p { font-size: 13px; color: #6b7280; margin: 0; line-height: 1.5; }
    .article-meta { display: flex; align-items: center; gap: 12px; margin-top: 8px; font-size: 12px; color: #9ca3af; }
    .article-category { background: ${colors.secondary}; color: ${colors.primary}; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; }
    .trending-badge { display: inline-flex; align-items: center; gap: 4px; background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; }
    
    /* Daily question box */
    .question-box { background: linear-gradient(135deg, ${colors.secondary} 0%, #fff 100%); border: 2px dashed ${colors.primary}; border-radius: 16px; padding: 24px; margin: 28px 0; text-align: center; }
    .question-box h3 { color: ${colors.primary}; font-size: 16px; margin: 0 0 12px 0; display: flex; align-items: center; justify-content: center; gap: 8px; }
    .question-box p { color: #374151; font-size: 18px; font-weight: 600; margin: 0 0 16px 0; line-height: 1.6; }
    .question-btn { display: inline-block; background: ${colors.primary}; color: #ffffff !important; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-size: 14px; margin: 4px; }
    
    /* Exclusive content teaser */
    .exclusive-box { background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius: 16px; padding: 24px; margin: 28px 0; }
    .exclusive-box .badge { display: inline-flex; align-items: center; gap: 4px; background: #f59e0b; color: #ffffff; font-size: 12px; font-weight: 600; padding: 4px 12px; border-radius: 20px; margin-bottom: 12px; }
    .exclusive-box h3 { color: #92400e; font-size: 18px; margin: 0 0 8px 0; }
    .exclusive-box p { color: #78350f; font-size: 14px; line-height: 1.6; margin: 0 0 16px 0; }
    
    /* Quick stats */
    .stats-row { display: flex; justify-content: space-around; background: ${colors.secondary}; border-radius: 12px; padding: 20px 16px; margin: 28px 0; }
    .stat-item { text-align: center; }
    .stat-value { font-size: 24px; font-weight: 700; color: ${colors.primary}; display: block; }
    .stat-label { font-size: 12px; color: #6b7280; }
    .stat-trend { font-size: 10px; display: flex; align-items: center; justify-content: center; gap: 2px; margin-top: 4px; }
    .stat-trend.up { color: #10b981; }
    .stat-trend.down { color: #ef4444; }
    
    /* Audio section */
    .audio-section { background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%); border-radius: 16px; padding: 24px; margin: 28px 0; text-align: center; }
    .audio-section h3 { color: #ffffff; font-size: 18px; margin: 0 0 8px 0; display: flex; align-items: center; justify-content: center; gap: 8px; }
    .audio-section p { color: rgba(255,255,255,0.8); font-size: 14px; margin: 0 0 16px 0; }
    .audio-btn { display: inline-flex; align-items: center; gap: 8px; background: #ffffff; color: #1e1b4b !important; text-decoration: none; padding: 12px 24px; border-radius: 24px; font-size: 14px; font-weight: 600; }
    
    /* CTA section */
    .cta-section { text-align: center; padding: 32px 24px; background: ${colors.secondary}; margin-top: 32px; }
    .cta-section h3 { color: #1f2937; font-size: 18px; margin: 0 0 8px 0; }
    .cta-section p { color: #6b7280; font-size: 14px; margin: 0 0 16px 0; }
    .cta-btn { display: inline-block; background: ${colors.primary}; color: #ffffff !important; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600; }
    .cta-btn.secondary { background: transparent; border: 2px solid ${colors.primary}; color: ${colors.primary} !important; }
    
    /* Footer */
    .footer { background: #1f2937; padding: 32px 24px; text-align: center; }
    .footer-logo { color: #ffffff; font-size: 20px; font-weight: 700; margin-bottom: 16px; }
    .social-links { margin: 16px 0; }
    .social-links a { display: inline-block; width: 36px; height: 36px; background: rgba(255,255,255,0.1); border-radius: 50%; margin: 0 4px; line-height: 36px; text-decoration: none; }
    .footer-links { margin: 16px 0; }
    .footer-links a { color: rgba(255,255,255,0.7); text-decoration: none; font-size: 13px; margin: 0 12px; }
    .footer-links a:hover { color: #ffffff; }
    .footer p { color: rgba(255,255,255,0.6); font-size: 12px; margin: 16px 0 0 0; }
    .unsubscribe { color: rgba(255,255,255,0.5); font-size: 11px; margin-top: 16px; }
    .unsubscribe a { color: rgba(255,255,255,0.6); text-decoration: underline; }
    
    /* Mobile responsiveness */
    @media only screen and (max-width: 600px) {
      .email-wrapper { width: 100% !important; }
      .content { padding: 20px 16px !important; }
      .header { padding: 24px 16px !important; }
      .header h1 { font-size: 22px !important; }
      .featured-article h2 { font-size: 18px !important; }
      .article-card { flex-direction: column !important; }
      .article-card img { width: 100% !important; height: 150px !important; }
      .stats-row { flex-wrap: wrap !important; gap: 16px !important; }
      .stat-item { flex: 1 1 40% !important; }
    }
  </style>
</head>
<body>
  <!-- Hidden preheader text -->
  <div class="preheader">${content.preheaderText}</div>
  
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 24px 16px;">
        <table class="email-wrapper" role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td class="header">
              <div class="header-icon" style="width: 48px; height: 48px; margin: 0 auto 12px; background: rgba(255,255,255,0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                ${templateIcon}
              </div>
              <h1>${templateTitle}</h1>
              <p class="date">${currentDate}</p>
            </td>
          </tr>
          
          <!-- Main content -->
          <tr>
            <td class="content">
              <!-- Personalized intro -->
              <div class="intro">
                ${content.personalizedIntro}
              </div>
              
              ${content.mainArticle ? generateFeaturedArticleHTML(content.mainArticle, colors) : ''}
              
              ${content.articles.length > 0 ? generateArticlesListHTML(content.articles, colors) : ''}
              
              ${content.dailyQuestion ? generateQuestionBoxHTML(content.dailyQuestion, colors) : ''}
              
              ${content.exclusiveContent ? generateExclusiveBoxHTML(content.exclusiveContent) : ''}
              
              ${content.quickStats && content.quickStats.length > 0 ? generateStatsRowHTML(content.quickStats, colors) : ''}
              
              ${content.audioUrl ? generateAudioSectionHTML(content.audioUrl) : ''}
            </td>
          </tr>
          
          <!-- CTA Section -->
          ${content.callToAction ? `
          <tr>
            <td class="cta-section">
              <h3>لا تفوّت أي خبر مهم</h3>
              <p>تابعنا على تطبيق سبق للحصول على إشعارات فورية</p>
              <a href="${content.callToAction.link}" class="cta-btn ${content.callToAction.style}">${content.callToAction.text}</a>
            </td>
          </tr>
          ` : ''}
          
          <!-- Footer -->
          <tr>
            <td class="footer">
              <div class="footer-logo">سبق الإخبارية</div>
              <div class="footer-links">
                <a href="${content.websiteUrl}">الرئيسية</a>
                <a href="${content.websiteUrl}/categories">الأقسام</a>
                <a href="${content.websiteUrl}/about">من نحن</a>
                <a href="${content.websiteUrl}/contact">تواصل معنا</a>
              </div>
              <p>© ${new Date().getFullYear()} صحيفة سبق الإلكترونية. جميع الحقوق محفوظة.</p>
              <div class="unsubscribe">
                <a href="${content.websiteUrl}/newsletter/unsubscribe?token=${content.unsubscribeToken}">إلغاء الاشتراك</a> | 
                <a href="${content.websiteUrl}/newsletter/preferences?token=${content.unsubscribeToken}">تعديل التفضيلات</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Generate featured article HTML
 */
function generateFeaturedArticleHTML(article: ArticleSummary, colors: { primary: string; secondary: string; accent: string }): string {
  return `
    <div class="featured-article">
      ${article.imageUrl ? `<img src="${article.imageUrl}" alt="${article.title}" />` : ''}
      <div class="featured-article-content">
        ${article.isExclusive ? `<span class="featured-badge">${ICONS.star} حصري</span>` : ''}
        ${article.isTrending ? `<span class="featured-badge" style="background: #ef4444;">${ICONS.trending} الأكثر قراءة</span>` : ''}
        <h2>${article.title}</h2>
        <p>${article.excerpt}</p>
        ${article.url ? `<a href="${article.url}" class="read-more">اقرأ المزيد</a>` : ''}
      </div>
    </div>
  `;
}

/**
 * Generate articles list HTML
 */
function generateArticlesListHTML(articles: ArticleSummary[], colors: { primary: string; secondary: string; accent: string }): string {
  const articlesHTML = articles.map(article => `
    <a href="${article.url || '#'}" class="article-card" style="text-decoration: none;">
      ${article.imageUrl ? `<img src="${article.imageUrl}" alt="${article.title}" />` : ''}
      <div class="article-card-content">
        <h3>${article.title}</h3>
        <p>${article.excerpt}</p>
        <div class="article-meta">
          ${article.categoryName ? `<span class="article-category">${article.categoryName}</span>` : ''}
          ${article.isTrending ? `<span class="trending-badge">${ICONS.fire} رائج</span>` : ''}
          ${article.readTime ? `<span>${ICONS.clock} ${article.readTime} دقائق</span>` : ''}
        </div>
      </div>
    </a>
  `).join('');

  return `
    <div class="articles-section">
      <h2 class="section-title">${ICONS.star} أخبار مختارة لك</h2>
      ${articlesHTML}
    </div>
  `;
}

/**
 * Generate daily question box HTML
 */
function generateQuestionBoxHTML(question: { question: string; options?: string[]; link?: string }, colors: { primary: string; secondary: string; accent: string }): string {
  const optionsHTML = question.options?.map(opt => 
    `<a href="${question.link || '#'}?answer=${encodeURIComponent(opt)}" class="question-btn">${opt}</a>`
  ).join('') || '';

  return `
    <div class="question-box">
      <h3>${ICONS.sparkles} سؤال اليوم</h3>
      <p>${question.question}</p>
      ${optionsHTML}
      ${!question.options && question.link ? `<a href="${question.link}" class="question-btn">شارك برأيك</a>` : ''}
    </div>
  `;
}

/**
 * Generate exclusive content box HTML
 */
function generateExclusiveBoxHTML(exclusive: { title: string; teaser: string; link: string }): string {
  return `
    <div class="exclusive-box">
      <span class="badge">${ICONS.star} محتوى حصري</span>
      <h3>${exclusive.title}</h3>
      <p>${exclusive.teaser}</p>
      <a href="${exclusive.link}" class="read-more" style="background: #f59e0b;">اكتشف المزيد</a>
    </div>
  `;
}

/**
 * Generate stats row HTML
 */
function generateStatsRowHTML(stats: { label: string; value: string; trend?: 'up' | 'down' | 'neutral' }[], colors: { primary: string; secondary: string; accent: string }): string {
  const statsHTML = stats.map(stat => `
    <div class="stat-item">
      <span class="stat-value">${stat.value}</span>
      <span class="stat-label">${stat.label}</span>
      ${stat.trend && stat.trend !== 'neutral' ? `
        <span class="stat-trend ${stat.trend}">
          ${stat.trend === 'up' ? '↑' : '↓'}
        </span>
      ` : ''}
    </div>
  `).join('');

  return `<div class="stats-row">${statsHTML}</div>`;
}

/**
 * Generate audio section HTML
 */
function generateAudioSectionHTML(audioUrl: string): string {
  return `
    <div class="audio-section">
      <h3>${ICONS.headphones} استمع للنشرة صوتياً</h3>
      <p>يمكنك الاستماع لملخص الأخبار أثناء تنقلك</p>
      <a href="${audioUrl}" class="audio-btn">${ICONS.headphones} تشغيل النسخة الصوتية</a>
    </div>
  `;
}

/**
 * Generate plain text version of newsletter
 */
export function generateNewsletterText(content: NewsletterContent): string {
  const templateTitle = getTemplateTitle(content.templateType);
  const currentDate = new Date().toLocaleDateString('ar-SA-u-ca-gregory', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  let text = `
${templateTitle}
${currentDate}

═══════════════════════════════════════

${content.personalizedIntro}

═══════════════════════════════════════
`;

  if (content.mainArticle) {
    text += `
📰 الخبر الرئيسي:
${content.mainArticle.title}

${content.mainArticle.excerpt}

${content.mainArticle.url ? `اقرأ المزيد: ${content.mainArticle.url}` : ''}

───────────────────────────────────────
`;
  }

  if (content.articles.length > 0) {
    text += `
📋 أخبار مختارة لك:

`;
    content.articles.forEach((article, index) => {
      text += `${index + 1}. ${article.title}
   ${article.excerpt}
   ${article.url ? `🔗 ${article.url}` : ''}

`;
    });
  }

  if (content.dailyQuestion) {
    text += `
───────────────────────────────────────

💭 سؤال اليوم:
${content.dailyQuestion.question}

${content.dailyQuestion.link ? `شارك برأيك: ${content.dailyQuestion.link}` : ''}

`;
  }

  if (content.audioUrl) {
    text += `
───────────────────────────────────────

🎧 استمع للنشرة صوتياً:
${content.audioUrl}

`;
  }

  text += `
═══════════════════════════════════════

صحيفة سبق الإلكترونية
${content.websiteUrl}

لإلغاء الاشتراك: ${content.websiteUrl}/newsletter/unsubscribe?token=${content.unsubscribeToken}

© ${new Date().getFullYear()} جميع الحقوق محفوظة
`;

  return text.trim();
}

/**
 * Helper function to adjust color brightness
 */
function adjustColor(color: string, percent: number): string {
  const num = parseInt(color.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = (num >> 8 & 0x00FF) + amt;
  const B = (num & 0x0000FF) + amt;
  return '#' + (
    0x1000000 +
    (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
    (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
    (B < 255 ? B < 1 ? 0 : B : 255)
  ).toString(16).slice(1);
}
