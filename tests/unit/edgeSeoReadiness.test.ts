import { beforeEach, describe, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({ rows: [] as unknown[][], limits: [] as number[], offsets: [] as number[], author: vi.fn() }));
vi.mock('../../server/db', () => ({ db: { select: () => {
  const result = f.rows.shift() || [];
  const query: any = { then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve) };
  for (const method of ['from', 'leftJoin', 'innerJoin', 'where', 'orderBy']) query[method] = () => query;
  query.limit = (n: number) => { f.limits.push(n); return query; };
  query.offset = (n: number) => { f.offsets.push(n); return query; };
  return query;
} } }));
vi.mock('../../server/services/saudiLeagueService', () => ({ getTeamSeoMeta: vi.fn(), getMatchSeoMeta: vi.fn() }));
vi.mock('../../server/services/asianCupService', () => ({ getAcMatchDetail: vi.fn(), getAcPlayerCard: vi.fn(), getAcTeamProfile: vi.fn() }));
vi.mock('../../server/services/meetingsService', () => ({ getMeetingByInviteToken: vi.fn() }));
vi.mock('../../server/services/archiveSeo', () => ({ LEGACY_ARTICLE_PREFIXES: new Set(), resolveLegacyArticlePath: vi.fn(), resolveArchiveCanonical: vi.fn(async () => null) }));
vi.mock('../../server/services/authorProfileService', () => ({ getAuthorPageByName: f.author }));
import router from '../../server/routes/edgeMeta';
import { bumpSeoCacheGeneration } from '../../server/services/seoCacheInvalidation';

async function request(route: string, params: Record<string,string>, query: Record<string,string> = {}) {
  const layer = (router as any).stack.find((entry: any) => entry.route?.path === route);
  let body: any; let status = 200; const headers: Record<string,string> = {};
  const res: any = { set: (key: string,value: string) => { headers[key] = value; return res; }, status: (code: number) => { status = code; return res; }, json: (value: unknown) => { body = value; return res; } };
  await layer.route.stack.at(-1).handle({ params, query, path: route }, res);
  return { body, status, headers };
}
beforeEach(() => { f.rows = []; f.limits = []; f.offsets = []; f.author.mockReset(); bumpSeoCacheGeneration('test'); });

describe('public SEO projections', () => {
  it('paginates category rows deterministically and gives page two its own canonical', async () => {
    f.rows = [[{id:'c', nameAr:'محليات',slug:'saudi', englishSlug:'local'}], Array.from({length:31},(_,i)=>({id:`a${i}`,title:`خبر ${i}`,slug:`s${i}`,publishedAt:'2026-09-01'}))];
    const r = await request('/api/categories/:slug/seo-bundle', {slug:'saudi'}, {page:'2'});
    expect(r.status).toBe(200); expect(f.offsets).toEqual([30]);
    expect(r.body.articles).toHaveLength(30);
    expect(r.body.canonical).toBe('https://sabq.org/category/local?page=2');
    expect(r.body.pagination.previousHref).toBe('/category/local');
    expect(r.body.pagination.nextHref).toBe('/category/local?page=3');
  });
  it('returns non-cacheable 404 for an empty archive page', async () => {
    f.rows = [[{id:'c', nameAr:'محليات',slug:'saudi'}], []];
    const r = await request('/api/categories/:slug/seo-bundle', {slug:'saudi'}, {page:'2'});
    expect(r.status).toBe(404); expect(r.headers['Cache-Control']).toBe('no-store');
  });
  it('projects the existing public author bio and next-page links', async () => {
    f.author.mockResolvedValue({ author:{name:'كاتب الاختبار',bio:'نبذة الكاتب'}, stats:{articleCount:40}, recentArticles:[{title:'خبر',slug:'a'}], pagination:{hasMore:true} });
    const r = await request('/api/edge/seo-meta', {}, {path:'/author/name?page=2&utm_source=x'});
    expect(f.author).toHaveBeenCalledWith('name',{page:2,limit:18});
    expect(r.body.jsonLd['@type']).toBe('ProfilePage');
    expect(r.body.semanticHtml).toContain('نبذة الكاتب');
    expect(r.body.semanticHtml).toContain('?page=3');
    expect(r.body.canonical).toContain('?page=2');
  });
  it('does not expose a member bio without published work', async () => {
    f.author.mockResolvedValue({ author:{name:'private',bio:'PRIVATE'}, stats:{articleCount:0}, recentArticles:[], pagination:{hasMore:false} });
    const r = await request('/api/edge/seo-meta', {}, {path:'/author/private'});
    expect(r.body.robots).toContain('noindex');
    expect(JSON.stringify(r.body)).not.toContain('PRIVATE');
  });
  it('rejects an unbounded archive page without touching the database', async () => {
    const r = await request('/api/edge/seo-meta', {}, {path:'/category/local?page=999999999'});
    expect(r.status).toBe(400); expect(f.limits).toEqual([]);
  });
  it('does not leak draft content through the article bundle', async () => {
    f.rows = [[{id:'d',title:'DRAFT',content:'SECRET',slug:'draft',status:'draft',seo:{},publishedAt:null}], []];
    const r = await request('/api/articles/:slug/seo-bundle', {slug:'draft'});
    expect(r.status).toBe(404); expect(JSON.stringify(r.body)).not.toContain('SECRET');
    expect(r.headers['Cache-Control']).toBe('no-store');
  });
  it('answers an unknown top-level path with a real 404 and no canonical', async () => {
    const r = await request('/api/edge/seo-meta', {}, {path:'/this-page-does-not-exist-xyz123'});
    expect(r.body.status).toBe(404); expect(r.body.robots).toBe('noindex, follow');
    expect(r.body.canonical).toBe('');
    const known = await request('/api/edge/seo-meta', {}, {path:'/lite'});
    expect(known.body.status).toBeUndefined(); expect(known.body.image).toContain('/branding/sabq-og-image.png');
  });
  it('gives institutional pages their own title and crawlable text', async () => {
    const about = await request('/api/edge/seo-meta', {}, {path:'/about'});
    expect(about.body.title).toBe('من نحن — سبق'); expect(about.body.semanticHtml).toContain('<h1>');
    const policy = await request('/api/edge/seo-meta', {}, {path:'/ai-policy'});
    expect(policy.body.semanticHtml).toContain('تدريب نماذج الأساس');
    f.rows = [[{slug:'o1',englishSlug:'op1',title:'مقال رأي'}]];
    const opinion = await request('/api/edge/seo-meta', {}, {path:'/opinion'});
    expect(opinion.body.title).toBe('الرأي — سبق'); expect(opinion.body.semanticHtml).toContain('/article/op1');
    const contact = await request('/api/edge/seo-meta', {}, {path:'/contact'});
    expect(contact.body.title).toBe('اتصل بنا — سبق');
  });
  it('renders reporter bio and recent articles for crawlers', async () => {
    f.rows = [[{slug:'yasr',userId:'u1',nameAr:'ياسر',titleAr:'مراسل',bioAr:'نبذة المراسل'}], [{slug:'a1',englishSlug:'x1',title:'خبر المراسل'}]];
    const r = await request('/api/edge/seo-meta', {}, {path:'/reporter/yasr'});
    expect(r.body.title).toBe('ياسر — سبق');
    expect(r.body.semanticHtml).toContain('نبذة المراسل'); expect(r.body.semanticHtml).toContain('/article/x1');
  });
  it('redirects bare legacy roots and old AMP URLs to their canonical page', async () => {
    f.rows = [[{englishSlug:'CWtMvGT'}]];
    expect((await request('/api/edge/slug-redirect', {}, {path:'/saudia'})).body.redirect).toBe('/category/CWtMvGT');
    expect((await request('/api/edge/slug-redirect', {}, {path:'/collection/latest-news'})).body.redirect).toBe('/');
    expect((await request('/api/edge/slug-redirect', {}, {path:'/amp/article/x1'})).body.redirect).toBe('/article/x1');
    f.rows = [[{englishSlug:'x2', slug:'s2'}]];
    expect((await request('/api/edge/slug-redirect', {}, {path:'/amp/story/news/k27fxz'})).body.redirect).toBe('/article/x2');
    expect((await request('/api/edge/slug-redirect', {}, {path:'/amp/amp/article/x1'})).body.redirect).toBeNull();
  });
  it('sends old /en/article links of Arabic articles to the translation or the Arabic article', async () => {
    f.rows = [[], [{id:'a1', englishSlug:'1ehZR8x', slug:'s1'}], []];
    expect((await request('/api/edge/slug-redirect', {}, {path:'/en/article/1ehZR8x'})).body.redirect).toBe('/article/1ehZR8x');
    f.rows = [[], [{id:'a2', englishSlug:'tgZusyi', slug:'s2'}], [{slug:'en-s', englishSlug:'enX'}]];
    expect((await request('/api/edge/slug-redirect', {}, {path:'/en/article/tgZusyi'})).body.redirect).toBe('/en/article/enX');
    f.rows = [[{id:'e1'}]];
    expect((await request('/api/edge/slug-redirect', {}, {path:'/en/article/realEn'})).body.redirect).toBeNull();
    f.rows = [[], []];
    expect((await request('/api/edge/slug-redirect', {}, {path:'/ur/article/missing'})).body.redirect).toBeNull();
  });

  it.each([
    ['6ihtdc4', 'هيئة تطوير مكة شريك تنموي في معسكر للتوظيف بجامعة جدة', 'مناطق', 'Mm7WgHL'],
    ['5aflbvr', '"ليدار للاستثمار" تستعرض مشروع "دار المكيمن" في معرض "المدينة بيلدكس 2026"', 'أعمال', '-IHYckx'],
    ['kkqajht', 'تباين أسعار النفط وارتفاع الذهب إلى 4156 دولاراً للأوقية', 'أعمال', '-IHYckx'],
    ['2r5rr9f', 'الفيصلي يقلب تأخره بهدفين ويهزم الخلود بثلاثية ميندي', 'رياضة', 'VrlEcMg'],
    ['ne5e6tf', 'حرس الحدود بجدة يضبط مواطنَين يمارسان الصيد دون تصريح بأدوات محظورة', 'محليات', 'CWtMvGT'],
  ])('emits clean canonical, +03:00 NewsArticle JSON-LD, and named BreadcrumbList for sample article %s', async (slug, title, categoryName, categoryEnglishSlug) => {
    f.rows = [
      [{
        id: `id-${slug}`,
        title,
        slug: `ar-${slug}`,
        englishSlug: slug,
        excerpt: 'ملخص الخبر',
        content: '<p>متن الخبر الكامل</p>',
        imageUrl: 'https://media.sabq.org/news/2026/10/test/w1280.webp',
        publishedAt: '2026-10-15T18:04:59.394Z',
        updatedAt: '2026-10-15T18:04:59.414Z',
        status: 'published',
        seo: {},
        seoMetadata: {},
        categoryId: 'cat-1',
        categoryName,
        categorySlug: categoryName,
        categoryEnglishSlug,
        reporterFirstName: 'صحيفة',
        reporterLastName: 'سبق',
      }],
      [], // media assets
      [], // en sibling
    ];
    const r = await request('/api/edge/seo-meta', {}, { path: `/article/${slug}?_cb=123&utm_source=x` });
    expect(r.status).toBe(200);
    expect(r.body.canonical).toBe(`https://sabq.org/article/${slug}`);
    expect(r.body.jsonLd['@type']).toBe('NewsArticle');
    expect(r.body.jsonLd.mainEntityOfPage).toEqual({
      '@type': 'WebPage',
      '@id': `https://sabq.org/article/${slug}`,
    });
    expect(r.body.jsonLd.headline).toBe(title);
    expect(r.body.semanticHtml).toContain(`<h1>${title.replace(/"/g, '&quot;')}</h1>`);
    expect(r.body.jsonLd.datePublished).toBe('2026-10-15T21:04:59+03:00');
    expect(r.body.jsonLd.dateModified).toBe('2026-10-15T21:04:59+03:00');
    expect(r.body.jsonLd.inLanguage).toBe('ar');
    expect(r.body.jsonLd.author).toEqual({
      '@type': 'Organization',
      name: 'صحيفة سبق',
      url: 'https://sabq.org',
    });
    expect(r.body.jsonLd.publisher).toMatchObject({
      '@type': 'NewsMediaOrganization',
      name: 'صحيفة سبق الإلكترونية',
      url: 'https://sabq.org',
      logo: {
        '@type': 'ImageObject',
        url: 'https://sabq.org/branding/sabq-og-image.png',
        width: 1200,
        height: 630,
      },
    });
    expect(r.body.breadcrumbJsonLd).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'الرئيسية', item: 'https://sabq.org/' },
        { '@type': 'ListItem', position: 2, name: categoryName, item: `https://sabq.org/category/${categoryEnglishSlug}` },
        { '@type': 'ListItem', position: 3, name: title, item: `https://sabq.org/article/${slug}` },
      ],
    });
  });

  it('emits Person author with profile URL when a named journalist exists', async () => {
    f.rows = [
      [{
        id: 'id-named',
        title: 'خبر بمحرر مسمى',
        slug: 'named-slug',
        englishSlug: 'named12',
        excerpt: 'ملخص',
        content: '<p>المتن</p>',
        imageUrl: '',
        publishedAt: '2026-10-21T05:00:00.000Z',
        updatedAt: '2026-10-21T07:30:00.000Z',
        status: 'published',
        seo: {},
        seoMetadata: { editorialModifiedAt: '2026-10-21T07:30:00.000Z' },
        categoryName: 'السعودية',
        categorySlug: 'saudia',
        categoryEnglishSlug: 'saudia',
        reporterId: 'u-rep',
        reporterFirstName: 'أحمد',
        reporterLastName: 'العتيبي',
        reporterStaffSlug: 'ahmed-otaibi',
      }],
      [],
      [],
    ];
    const r = await request('/api/edge/seo-meta', {}, { path: '/article/named12' });
    expect(r.body.jsonLd.author).toMatchObject({
      '@type': 'Person',
      name: 'أحمد العتيبي',
      url: 'https://sabq.org/reporter/ahmed-otaibi',
    });
    expect(r.body.jsonLd.datePublished).toBe('2026-10-21T08:00:00+03:00');
    expect(r.body.jsonLd.dateModified).toBe('2026-10-21T10:30:00+03:00');
    expect(r.body.jsonLd.image[0]).toContain('width=1200');
  });

  it('keeps self-referencing ?page= on category seo-meta while stripping _cb and utm params, with BreadcrumbList', async () => {
    f.rows = [
      [{ id: 'c1', nameAr: 'السعودية', slug: 'saudia', englishSlug: 'saudia' }],
      [{ slug: 'a1', englishSlug: 'x1', title: 'خبر 1' }],
    ];
    const r = await request('/api/edge/seo-meta', {}, { path: '/category/saudia?page=2&_cb=999&utm_source=x' });
    expect(r.status).toBe(200);
    expect(r.body.canonical).toBe('https://sabq.org/category/saudia?page=2');
    expect(r.body.breadcrumbJsonLd).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'الرئيسية', item: 'https://sabq.org/' },
        { '@type': 'ListItem', position: 2, name: 'السعودية', item: 'https://sabq.org/category/saudia?page=2' },
      ],
    });
  });
});
