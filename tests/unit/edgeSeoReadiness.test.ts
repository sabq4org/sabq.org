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
});
