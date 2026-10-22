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
  it('answers an unpublished row like a missing one in seo-meta', async () => {
    const hidden = {id:'d',title:'HIDDEN-TITLE',excerpt:'HIDDEN-EXCERPT',aiSummary:'HIDDEN-SUMMARY',content:'<p>HIDDEN-BODY</p>',imageUrl:'https://img.example/hidden.jpg',slug:'s',englishSlug:'x',seo:{},publishedAt:'2026-10-30',updatedAt:'2026-10-20',reporterFirstName:'HIDDEN-REPORTER'};
    for (const [path, status] of [['/article/x','draft'],['/opinion/x','archived'],['/en/article/x','scheduled'],['/ur/article/x','draft']]) {
      f.rows = [[{...hidden, status}]];
      const r = await request('/api/edge/seo-meta', {}, {path});
      expect(r.body.robots, path).toBe('noindex, follow');
      expect(JSON.stringify(r.body), path).not.toContain('HIDDEN');
    }
    f.rows = [[{id:'g',country:'HIDDEN-COUNTRY',eventType:'x',content:'HIDDEN-BODY',status:'draft'}]];
    expect(JSON.stringify((await request('/api/edge/seo-meta', {}, {path:'/gulf/g'})).body)).not.toContain('HIDDEN');
    f.rows = [[{title:'HIDDEN-TITLE',excerpt:'HIDDEN-EXCERPT',content:{plainText:'HIDDEN-BODY'},status:'draft',seoMeta:{},topicSlug:'t',angleNameAr:'زاوية',angleSlug:'a'}]];
    expect(JSON.stringify((await request('/api/edge/seo-meta', {}, {path:'/muqtarab/a/topic/t'})).body)).not.toContain('HIDDEN');
    f.rows = [[{id:'o',title:'HIDDEN-TITLE',description:'HIDDEN-SUMMARY',status:'completed'}]];
    const omq = await request('/api/edge/seo-meta', {}, {path:'/omq/o'});
    expect(omq.body.robots).toBe('noindex, follow'); expect(JSON.stringify(omq.body)).not.toContain('HIDDEN');
    f.rows = [[{...hidden, englishSlug:'y', status:'published'}]];
    expect((await request('/api/edge/seo-meta', {}, {path:'/article/y'})).body.title).toContain('HIDDEN-TITLE');
  });
  it('links a service-date article to its service page in the crawler body and the SPA-shell fallback', async () => {
    const row = {id:'a1',title:'حساب المواطن يودع 3 مليارات ريال لمستفيدي دفعة سبتمبر',content:'<p>نص الخبر</p>',slug:'s1',englishSlug:'x1',status:'published',seo:{},publishedAt:'2026-09-10',updatedAt:'2026-09-10',categorySlug:'saudi',articleType:'news'};
    f.rows = [[row]];
    const bundle = await request('/api/articles/:slug/seo-bundle', {slug:'x1'});
    expect(bundle.status).toBe(200);
    expect(bundle.body.contentHtml).toBe('<p>نص الخبر</p>\n<p><a href="/services/citizen-account-date">موعد صرف حساب المواطن القادم</a></p>');
    f.rows = [[row]];
    const shell = await request('/api/edge/seo-meta', {}, {path:'/article/x1'});
    expect(shell.body.semanticHtml).toContain('<a href="/services/citizen-account-date">موعد صرف حساب المواطن القادم</a>');
    f.rows = [[{...row, articleType:'column'}]];
    const column = await request('/api/articles/:slug/seo-bundle', {slug:'x1'});
    expect(column.body.contentHtml).not.toContain('/services/');
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
});
