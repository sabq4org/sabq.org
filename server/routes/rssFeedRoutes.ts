import express from 'express';
import { db } from '../db';
import { eq, desc, and, isNotNull, sql } from 'drizzle-orm';
import { audioNewsletters, audioNewsletterArticles, articles, categories } from '@shared/schema';
import { cacheControl, CACHE_DURATIONS } from '../cacheMiddleware';

const router = express.Router();

// Podcast RSS feed for audio newsletters
// RSS feeds should be cached for 5 minutes (edge) with 10 min stale-while-revalidate
router.get('/audio-newsletters', cacheControl({ maxAge: 300, staleWhileRevalidate: 600 }), async (req, res) => {
  try {
    // Get published newsletters with audio
    const newsletters = await db.query.audioNewsletters.findMany({
      where: and(
        eq(audioNewsletters.status, 'published'),
        isNotNull(audioNewsletters.audioUrl)
      ),
      with: {
        articles: {
          with: {
            article: {
              columns: {
                id: true,
                title: true,
                slug: true,
                englishSlug: true,
                excerpt: true,
                imageUrl: true,
                thumbnailUrl: true,
                publishedAt: true,
                categoryId: true,
                audioUrl: true,
                seo: true,
              }
            }
          },
          orderBy: (articles, { asc }) => [asc(articles.orderIndex)]
        }
      },
      orderBy: [desc(audioNewsletters.createdAt)],
      limit: 50
    });

    // Build RSS feed
    const baseUrl = process.env.APP_URL || 'https://sabq.sa';
    const currentDate = new Date().toUTCString();
    
    const rssItems = newsletters.map(newsletter => {
      const pubDate = newsletter.publishedAt
        ? new Date(newsletter.publishedAt).toUTCString()
        : new Date(newsletter.createdAt || Date.now()).toUTCString();
      
      // Build description from articles
      const articleList = newsletter.articles
        .slice(0, 5)
        .map((na, index) => `${index + 1}. ${na.article.title}`)
        .join('\n');
      
      const description = newsletter.description || 
        `النشرة الصوتية من سبق - ${newsletter.title}\n\nالأخبار المتضمنة:\n${articleList}`;
      
      // Duration in iTunes format (HH:MM:SS)
      const duration = newsletter.duration || 0;
      const hours = Math.floor(duration / 3600);
      const minutes = Math.floor((duration % 3600) / 60);
      const seconds = Math.floor(duration % 60);
      const itunesDuration = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      
      return `
    <item>
      <title><![CDATA[${newsletter.title}]]></title>
      <description><![CDATA[${description}]]></description>
      <link>${baseUrl}/audio/${newsletter.id}</link>
      <guid isPermaLink="true">${baseUrl}/audio/${newsletter.id}</guid>
      <pubDate>${pubDate}</pubDate>
      <enclosure url="${newsletter.audioUrl}" type="audio/mpeg" length="${newsletter.audioSize || 0}"/>
      <itunes:author>سبق الإلكترونية</itunes:author>
      <itunes:subtitle><![CDATA[${newsletter.description || newsletter.title}]]></itunes:subtitle>
      <itunes:summary><![CDATA[${description}]]></itunes:summary>
      <itunes:duration>${itunesDuration}</itunes:duration>
      <itunes:explicit>no</itunes:explicit>
      <itunes:episode>${newsletter.episodeNumber || newsletters.indexOf(newsletter) + 1}</itunes:episode>
      <itunes:episodeType>full</itunes:episodeType>
    </item>`;
    }).join('\n');

    const rssFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" 
     xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" 
     xmlns:content="http://purl.org/rss/1.0/modules/content/"
     xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>نشرات سبق الصوتية</title>
    <link>${baseUrl}</link>
    <atom:link href="${baseUrl}/api/rss/audio-newsletters" rel="self" type="application/rss+xml"/>
    <description>النشرات الإخبارية الصوتية اليومية والأسبوعية من صحيفة سبق الإلكترونية - أبرز الأخبار والتحليلات</description>
    <language>ar-SA</language>
    <copyright>© ${new Date().getFullYear()} صحيفة سبق الإلكترونية</copyright>
    <lastBuildDate>${currentDate}</lastBuildDate>
    <pubDate>${currentDate}</pubDate>
    <webMaster>podcasts@sabq.sa (سبق الإلكترونية)</webMaster>
    <managingEditor>editor@sabq.sa (فريق التحرير)</managingEditor>
    <category>News</category>
    <category>Arabic</category>
    <category>Saudi Arabia</category>
    <ttl>60</ttl>
    <image>
      <url>${baseUrl}/images/podcast-cover.jpg</url>
      <title>نشرات سبق الصوتية</title>
      <link>${baseUrl}</link>
    </image>
    
    <!-- iTunes Podcast Tags -->
    <itunes:author>سبق الإلكترونية</itunes:author>
    <itunes:summary>النشرات الإخبارية الصوتية من سبق - تغطية شاملة لأهم الأخبار المحلية والعالمية، مع تحليلات معمقة ونشرات يومية وأسبوعية</itunes:summary>
    <itunes:owner>
      <itunes:name>صحيفة سبق الإلكترونية</itunes:name>
      <itunes:email>podcasts@sabq.sa</itunes:email>
    </itunes:owner>
    <itunes:explicit>no</itunes:explicit>
    <itunes:category text="News">
      <itunes:category text="Daily News"/>
    </itunes:category>
    <itunes:category text="Government"/>
    <itunes:category text="Society &amp; Culture"/>
    <itunes:image href="${baseUrl}/images/podcast-cover-1400.jpg"/>
    <itunes:type>episodic</itunes:type>
    <itunes:complete>no</itunes:complete>
    
    ${rssItems}
  </channel>
</rss>`;

    res.set('Content-Type', 'application/rss+xml; charset=utf-8');
    res.send(rssFeed);
  } catch (error) {
    console.error('Error generating RSS feed:', error);
    res.status(500).send('Error generating RSS feed');
  }
});

// JSON feed for modern podcast apps
router.get('/audio-newsletters.json', cacheControl({ maxAge: 300, staleWhileRevalidate: 600 }), async (req, res) => {
  try {
    const newsletters = await db.query.audioNewsletters.findMany({
      where: and(
        eq(audioNewsletters.status, 'published'),
        isNotNull(audioNewsletters.audioUrl)
      ),
      with: {
        articles: {
          with: {
            article: {
              columns: {
                id: true,
                title: true,
                slug: true,
                englishSlug: true,
                excerpt: true,
                imageUrl: true,
                thumbnailUrl: true,
                publishedAt: true,
                categoryId: true,
                audioUrl: true,
                seo: true,
              }
            }
          },
          orderBy: (articles, { asc }) => [asc(articles.orderIndex)]
        }
      },
      orderBy: [desc(audioNewsletters.createdAt)],
      limit: 50
    });

    const baseUrl = process.env.APP_URL || 'https://sabq.sa';
    
    const jsonFeed = {
      version: 'https://jsonfeed.org/version/1.1',
      title: 'نشرات سبق الصوتية',
      home_page_url: baseUrl,
      feed_url: `${baseUrl}/api/rss/audio-newsletters.json`,
      description: 'النشرات الإخبارية الصوتية اليومية والأسبوعية من صحيفة سبق الإلكترونية',
      icon: `${baseUrl}/images/icon-512.png`,
      favicon: `${baseUrl}/favicon.ico`,
      language: 'ar-SA',
      authors: [{
        name: 'سبق الإلكترونية',
        url: baseUrl,
        avatar: `${baseUrl}/images/sabq-logo.png`
      }],
      _itunes: {
        author: 'سبق الإلكترونية',
        categories: ['News', 'Society & Culture'],
        explicit: false,
        type: 'episodic',
        owner: {
          name: 'صحيفة سبق الإلكترونية',
          email: 'podcasts@sabq.sa'
        }
      },
      items: newsletters.map((newsletter, index) => ({
        id: newsletter.id,
        url: `${baseUrl}/audio/${newsletter.id}`,
        title: newsletter.title,
        summary: newsletter.description,
        content_text: newsletter.articles
          .slice(0, 5)
          .map((na, i) => `${i + 1}. ${na.article.title}`)
          .join('\n'),
        date_published: newsletter.publishedAt || newsletter.createdAt,
        date_modified: newsletter.updatedAt,
        attachments: [{
          url: newsletter.audioUrl,
          mime_type: 'audio/mpeg',
          size_in_bytes: newsletter.audioSize || 0,
          duration_in_seconds: newsletter.duration || 0
        }],
        _itunes: {
          episode: newsletter.episodeNumber || newsletters.length - index,
          duration: newsletter.duration || 0,
          explicit: false,
          episode_type: 'full'
        }
      }))
    };

    res.json(jsonFeed);
  } catch (error) {
    console.error('Error generating JSON feed:', error);
    res.status(500).json({ error: 'Error generating JSON feed' });
  }
});

// OPML file for podcast directories
router.get('/audio-newsletters.opml', cacheControl({ maxAge: 300, staleWhileRevalidate: 600 }), async (req, res) => {
  try {
    const baseUrl = process.env.APP_URL || 'https://sabq.sa';
    const currentDate = new Date().toISOString();
    
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>نشرات سبق الصوتية</title>
    <dateCreated>${currentDate}</dateCreated>
    <dateModified>${currentDate}</dateModified>
    <ownerName>صحيفة سبق الإلكترونية</ownerName>
    <ownerEmail>podcasts@sabq.sa</ownerEmail>
  </head>
  <body>
    <outline text="نشرات سبق الصوتية" type="rss" xmlUrl="${baseUrl}/api/rss/audio-newsletters" htmlUrl="${baseUrl}/audio"/>
  </body>
</opml>`;

    res.set('Content-Type', 'text/x-opml; charset=utf-8');
    res.send(opml);
  } catch (error) {
    console.error('Error generating OPML file:', error);
    res.status(500).send('Error generating OPML file');
  }
});

// ==================== ARTICLE RSS FEEDS ====================

// Main articles RSS feed
router.get('/articles', cacheControl({ maxAge: 300, staleWhileRevalidate: 600 }), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const baseUrl = process.env.APP_URL || 'https://sabq.org';
    const currentDate = new Date().toUTCString();

    const publishedArticles = await db
      .select({
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        excerpt: articles.excerpt,
        imageUrl: articles.imageUrl,
        publishedAt: articles.publishedAt,
        categoryId: articles.categoryId,
      })
      .from(articles)
      .where(eq(articles.status, 'published'))
      .orderBy(desc(articles.publishedAt))
      .limit(limit);

    const rssItems = publishedArticles.map(article => {
      const pubDate = article.publishedAt 
        ? new Date(article.publishedAt).toUTCString()
        : currentDate;
      const description = article.excerpt || '';
      const imageUrl = article.imageUrl || '';
      
      return `
    <item>
      <title><![CDATA[${article.title}]]></title>
      <description><![CDATA[${description}]]></description>
      <link>${baseUrl}/article/${article.slug}</link>
      <guid isPermaLink="true">${baseUrl}/article/${article.slug}</guid>
      <pubDate>${pubDate}</pubDate>
      <author>سبق</author>
      ${imageUrl ? `<enclosure url="${imageUrl}" type="image/jpeg"/>` : ''}
      ${imageUrl ? `<media:content url="${imageUrl}" medium="image"/>` : ''}
    </item>`;
    }).join('\n');

    const rssFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" 
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:media="http://search.yahoo.com/mrss/"
     xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>سبق الذكية - آخر الأخبار</title>
    <link>${baseUrl}</link>
    <atom:link href="${baseUrl}/api/rss/articles" rel="self" type="application/rss+xml"/>
    <description>آخر الأخبار والتحليلات من منصة سبق الذكية - المنصة الإخبارية العربية المدعومة بالذكاء الاصطناعي</description>
    <language>ar-SA</language>
    <copyright>© ${new Date().getFullYear()} سبق الذكية</copyright>
    <lastBuildDate>${currentDate}</lastBuildDate>
    <pubDate>${currentDate}</pubDate>
    <managingEditor>newsroom@sabq.org (فريق التحرير)</managingEditor>
    <webMaster>support@sabq.org (الدعم التقني)</webMaster>
    <category>News</category>
    <category>Arabic</category>
    <category>Saudi Arabia</category>
    <ttl>15</ttl>
    <image>
      <url>${baseUrl}/logo.png</url>
      <title>سبق الذكية</title>
      <link>${baseUrl}</link>
    </image>
    ${rssItems}
  </channel>
</rss>`;

    res.set('Content-Type', 'application/rss+xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
    res.send(rssFeed);
  } catch (error) {
    console.error('Error generating articles RSS feed:', error);
    res.status(500).send('Error generating RSS feed');
  }
});

// Category-specific RSS feed
router.get('/articles/category/:slug', cacheControl({ maxAge: 300, staleWhileRevalidate: 600 }), async (req, res) => {
  try {
    const { slug } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const baseUrl = process.env.APP_URL || 'https://sabq.org';
    const currentDate = new Date().toUTCString();

    // Get category
    const category = await db.query.categories.findFirst({
      where: eq(categories.slug, slug)
    });

    if (!category) {
      return res.status(404).send('Category not found');
    }

    const publishedArticles = await db
      .select({
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        excerpt: articles.excerpt,
        imageUrl: articles.imageUrl,
        publishedAt: articles.publishedAt,
      })
      .from(articles)
      .where(and(
        eq(articles.status, 'published'),
        eq(articles.categoryId, category.id)
      ))
      .orderBy(desc(articles.publishedAt))
      .limit(limit);

    const rssItems = publishedArticles.map(article => {
      const pubDate = article.publishedAt 
        ? new Date(article.publishedAt).toUTCString()
        : currentDate;
      const description = article.excerpt || '';
      const imageUrl = article.imageUrl || '';
      
      return `
    <item>
      <title><![CDATA[${article.title}]]></title>
      <description><![CDATA[${description}]]></description>
      <link>${baseUrl}/article/${article.slug}</link>
      <guid isPermaLink="true">${baseUrl}/article/${article.slug}</guid>
      <pubDate>${pubDate}</pubDate>
      <author>سبق</author>
      ${imageUrl ? `<enclosure url="${imageUrl}" type="image/jpeg"/>` : ''}
    </item>`;
    }).join('\n');

    const rssFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" 
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>سبق الذكية - ${category.nameAr}</title>
    <link>${baseUrl}/category/${category.slug}</link>
    <atom:link href="${baseUrl}/api/rss/articles/category/${category.slug}" rel="self" type="application/rss+xml"/>
    <description>آخر أخبار ${category.nameAr} من منصة سبق الذكية</description>
    <language>ar-SA</language>
    <copyright>© ${new Date().getFullYear()} سبق الذكية</copyright>
    <lastBuildDate>${currentDate}</lastBuildDate>
    <ttl>15</ttl>
    <image>
      <url>${baseUrl}/logo.png</url>
      <title>سبق الذكية - ${category.nameAr}</title>
      <link>${baseUrl}</link>
    </image>
    ${rssItems}
  </channel>
</rss>`;

    res.set('Content-Type', 'application/rss+xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=300');
    res.send(rssFeed);
  } catch (error) {
    console.error('Error generating category RSS feed:', error);
    res.status(500).send('Error generating RSS feed');
  }
});

// JSON Feed for articles (modern alternative to RSS)
router.get('/articles.json', cacheControl({ maxAge: 300, staleWhileRevalidate: 600 }), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const baseUrl = process.env.APP_URL || 'https://sabq.org';

    const publishedArticles = await db
      .select({
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        excerpt: articles.excerpt,
        imageUrl: articles.imageUrl,
        publishedAt: articles.publishedAt,
      })
      .from(articles)
      .where(eq(articles.status, 'published'))
      .orderBy(desc(articles.publishedAt))
      .limit(limit);

    const jsonFeed = {
      version: 'https://jsonfeed.org/version/1.1',
      title: 'سبق الذكية - آخر الأخبار',
      home_page_url: baseUrl,
      feed_url: `${baseUrl}/api/rss/articles.json`,
      description: 'آخر الأخبار والتحليلات من منصة سبق الذكية',
      icon: `${baseUrl}/logo.png`,
      favicon: `${baseUrl}/favicon.ico`,
      language: 'ar-SA',
      authors: [{
        name: 'سبق الذكية',
        url: baseUrl
      }],
      items: publishedArticles.map(article => ({
        id: article.id.toString(),
        url: `${baseUrl}/article/${article.slug}`,
        title: article.title,
        summary: article.excerpt || '',
        image: article.imageUrl || undefined,
        date_published: article.publishedAt,
        authors: [{
          name: 'سبق'
        }]
      }))
    };

    res.set('Cache-Control', 'public, max-age=300');
    res.json(jsonFeed);
  } catch (error) {
    console.error('Error generating JSON feed:', error);
    res.status(500).json({ error: 'Error generating JSON feed' });
  }
});

// Get available RSS feeds metadata
router.get('/feeds', cacheControl({ maxAge: 300, staleWhileRevalidate: 600 }), async (req, res) => {
  try {
    const baseUrl = process.env.APP_URL || 'https://sabq.org';
    
    // Get all active categories
    const activeCategories = await db.query.categories.findMany({
      where: eq(categories.status, 'active'),
      orderBy: [desc(categories.displayOrder)]
    });

    const feeds = {
      main: {
        title: 'جميع الأخبار',
        description: 'آخر الأخبار والتحليلات من سبق الذكية',
        rss: `${baseUrl}/api/rss/articles`,
        json: `${baseUrl}/api/rss/articles.json`,
        icon: 'newspaper'
      },
      audio: {
        title: 'النشرات الصوتية',
        description: 'النشرات الإخبارية الصوتية اليومية',
        rss: `${baseUrl}/api/rss/audio-newsletters`,
        json: `${baseUrl}/api/rss/audio-newsletters.json`,
        icon: 'headphones'
      },
      categories: activeCategories.map(cat => ({
        id: cat.id,
        title: cat.nameAr,
        titleEn: cat.nameEn,
        description: cat.description || `أخبار ${cat.nameAr}`,
        slug: cat.slug,
        rss: `${baseUrl}/api/rss/articles/category/${cat.slug}`,
        icon: cat.icon || 'folder',
        color: cat.color
      }))
    };

    res.set('Cache-Control', 'public, max-age=600');
    res.json(feeds);
  } catch (error) {
    console.error('Error fetching feeds metadata:', error);
    res.status(500).json({ error: 'Error fetching feeds' });
  }
});

// OPML export for all feeds
router.get('/feeds.opml', cacheControl({ maxAge: 300, staleWhileRevalidate: 600 }), async (req, res) => {
  try {
    const baseUrl = process.env.APP_URL || 'https://sabq.org';
    const currentDate = new Date().toISOString();
    
    const activeCategories = await db.query.categories.findMany({
      where: eq(categories.status, 'active'),
      orderBy: [desc(categories.displayOrder)]
    });

    const categoryOutlines = activeCategories.map(cat => 
      `    <outline text="${cat.nameAr}" title="${cat.nameAr}" type="rss" xmlUrl="${baseUrl}/api/rss/articles/category/${cat.slug}" htmlUrl="${baseUrl}/category/${cat.slug}"/>`
    ).join('\n');

    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>خلاصات سبق الذكية RSS</title>
    <dateCreated>${currentDate}</dateCreated>
    <dateModified>${currentDate}</dateModified>
    <ownerName>سبق الذكية</ownerName>
    <ownerEmail>newsroom@sabq.org</ownerEmail>
  </head>
  <body>
    <outline text="سبق الذكية" title="سبق الذكية">
      <outline text="جميع الأخبار" title="جميع الأخبار" type="rss" xmlUrl="${baseUrl}/api/rss/articles" htmlUrl="${baseUrl}"/>
      <outline text="النشرات الصوتية" title="النشرات الصوتية" type="rss" xmlUrl="${baseUrl}/api/rss/audio-newsletters" htmlUrl="${baseUrl}/audio"/>
${categoryOutlines}
    </outline>
  </body>
</opml>`;

    res.set('Content-Type', 'text/x-opml; charset=utf-8');
    res.send(opml);
  } catch (error) {
    console.error('Error generating OPML file:', error);
    res.status(500).send('Error generating OPML file');
  }
});

export default router;