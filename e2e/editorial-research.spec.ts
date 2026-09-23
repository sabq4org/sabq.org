import { test, expect } from "@playwright/test";
import type { ResearchJob } from "../shared/editorialResearch";
type ResearchTestUser = { id: string; role: string; permissions: string[] };
declare global {
  interface Window {
    researchTestUser?: ResearchTestUser;
    setResearchTestUser: (user: ResearchTestUser) => void;
  }
}
const initial = '<p>المتن الأصلي للمحرر</p>';
const job = (status: ResearchJob['status']): ResearchJob => ({ id: '00000000-0000-4000-8000-000000000001', topic: 'تقرير تجريبي عن اللون الأحمر للمريخ ومصدره الرسمي', status, createdAt: '2026-09-12T06:00:00Z', updatedAt: '2026-09-12T06:01:00Z', error: null, usage: { input_tokens: 9000, output_tokens: 200, total_tokens: 9200 }, research: status === 'completed' ? { summary: 'ملخص موثق عن اللون الأحمر للمريخ من المصدر الرسمي.', sources: [{ title: 'NASA Mars Facts', url: 'https://science.nasa.gov/mars/facts/', evidence: 'تفسير اللون الأحمر بأكاسيد الحديد.' }], openQuestions: ['حدود تفاصيل التربة تحتاج دراسة إضافية.'] } : null, result: status === 'completed' ? { headline: 'ناسا توضح سبب اللون الأحمر للمريخ', altHeadlines: [], body: '<p>يرتبط اللون الأحمر بأكاسيد الحديد.</p>', editorNotes: ['راجع المصدر الأصلي.'], sources: [{ title: 'NASA Mars Facts', url: 'https://science.nasa.gov/mars/facts/' }], riskFlags: [], pushText: null, enVersion: null, meta: { task: 'report', modelId: 'test', fallbackUsed: false, verificationRecommended: false } } : null });
test.beforeEach(async ({ page, baseURL }) => {
  page.on("pageerror", error => console.error("Research harness:", error.message));
  page.on("requestfailed", request => console.error("Research request:", request.url(), request.failure()?.errorText));
  test.skip(!baseURL || !['localhost','127.0.0.1'].includes(new URL(baseURL).hostname), 'Local Vite only');
  const transformed = await (await page.request.get(`${baseURL}/src/components/article-editor/EditorialResearchPanel.tsx`)).text();
  const queryModule = transformed.match(/from "([^"]+@tanstack_react-query\.js[^"]*)"/)![1];
  const reactModule = queryModule.replace(/@tanstack_react-query\.js/, 'react.js');
  const domModule = queryModule.replace(/@tanstack_react-query\.js/, 'react-dom_client.js');
  await page.route('**/__editorial-research-test', route => route.fulfill({ contentType:'text/html; charset=utf-8', body:`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
  import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
  document.cookie='csrf-token=test-csrf; path=/'; await import('/src/index.css');
  const {default:React}=await import('${reactModule}');const {default:ReactDOM}=await import('${domModule}');
  const {QueryClientProvider}=await import('${queryModule}'); const {queryClient}=await import('/src/lib/queryClient.ts');
  const {SabqEditorAssistant}=await import('/src/components/article-editor/SabqEditorAssistant.tsx');
  const {Toaster}=await import('/src/components/ui/toaster.tsx');
  const {LiveRegionProvider}=await import('/src/contexts/LiveRegionContext.tsx');
  const {LanguageProvider}=await import('/src/contexts/LanguageContext.tsx');
  window.setResearchTestUser = user => queryClient.setQueryData(['/api/auth/user'],user);
  window.setResearchTestUser(window.researchTestUser ?? {id:'editor-a',role:'system_admin',permissions:['articles.ai_generate']});
  function Test(){const [open,setOpen]=React.useState(false),[body,setBody]=React.useState(${JSON.stringify(initial)}),[title,setTitle]=React.useState('عنوان أصلي');return React.createElement(React.Fragment,null,
  React.createElement('button',{onClick:()=>setOpen(true)},'محرر سبق'),React.createElement('div',{'data-testid':'editor-title'},title),React.createElement('div',{'data-testid':'editor-body',dangerouslySetInnerHTML:{__html:body}}),
  React.createElement(SabqEditorAssistant,{open,onOpenChange:setOpen,articleTitle:title,articleContent:body,onApplyHeadline:setTitle,onApplyBody:setBody}),React.createElement(Toaster));}
  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(QueryClientProvider,{client:queryClient},React.createElement(LanguageProvider,null,React.createElement(LiveRegionProvider,null,React.createElement(Test)))));
  </script></body></html>` }));
  await page.route('**/api/accessibility/track', route => route.fulfill({status:204}));
  await page.route('**/api/auth/user', route => route.fulfill({ json: { id:'editor-a', role:'system_admin', permissions:['articles.ai_generate'] } }));
  await page.route('**/api/csrf-token', route => route.fulfill({ json: { csrfToken:'test-csrf' } }));
  await page.route('**/api/editorial-research/capabilities', route => route.fulfill({ json: { enabled:true, reason:null, dailyLimit:5, maxMinutes:5 } }));
});
async function openPanel(page: import('@playwright/test').Page) { await page.goto('/__editorial-research-test'); await page.getByRole('button',{name:'محرر سبق',exact:true}).click(); await page.getByTestId('open-editorial-research').click(); }
test('starts one task, resumes after reload, and applies only explicitly selected sources', async ({page}) => {
  let current: ResearchJob | null = null, posts = 0;
  await page.route('**/api/editorial-research/jobs', route => {
    if(route.request().method()==='POST'){posts++;expect(route.request().postDataJSON().requestId).toMatch(/^[a-f0-9-]{36}$/);current=job('researching');return route.fulfill({status:202,json:current});}
    return route.fulfill({json:current?[current]:[]});
  });
  await openPanel(page); await page.getByTestId('research-topic').fill(job('queued').topic);await page.getByTestId('research-start').click();
  await expect(page.getByTestId('research-status')).toContainText('جارٍ جمع المصادر');await expect(page.getByTestId('research-start')).toBeDisabled();expect(posts).toBe(1);
  current=job('completed');await openPanel(page);await expect(page.getByTestId('research-status')).toContainText('جاهز للمراجعة');
  await expect(page.getByTestId('editor-body')).toHaveText('المتن الأصلي للمحرر');
  await expect(page.getByTestId('dialog-sabq-assistant')).toHaveCSS('opacity','1');await page.screenshot({path:test.info().outputPath('research-ready.png'),fullPage:true,animations:'disabled'});
  await page.getByTestId('research-review').click();await page.screenshot({path:test.info().outputPath('research-report-preview.png'),fullPage:true,animations:'disabled'});await expect(page.getByTestId('editor-body')).toHaveText('المتن الأصلي للمحرر');
  await page.getByRole('checkbox',{name:'إدراج المصدر: NASA Mars Facts'}).check();await page.getByTestId('button-sabq-apply-body').click();
  await expect(page.getByTestId('editor-body')).toContainText('يرتبط اللون الأحمر');await expect(page.getByTestId('editor-body').locator('a')).toHaveAttribute('href','https://science.nasa.gov/mars/facts/');expect(posts).toBe(1);
});
test('shows errors and retries the same ambiguous request ID', async ({page}) => {
  const ids: string[]=[];
  await page.route('**/api/editorial-research/jobs', route => {
    if(route.request().method()==='POST'){ids.push(route.request().postDataJSON().requestId);return route.fulfill({status:503,json:{message:'اتصال غير محسوم'}});}
    return route.fulfill({json:[]});
  });
  await openPanel(page);await page.getByTestId('research-topic').fill(job('queued').topic);await page.getByTestId('research-start').click();await expect(page.getByRole('alert').first()).toBeVisible();
  await page.getByTestId('research-start').click();await expect.poll(()=>ids.length).toBe(2);expect(ids[0]).toBe(ids[1]);await expect(page.getByTestId('editor-body')).toHaveText('المتن الأصلي للمحرر');
});
test('cancels current work and fits a narrow RTL viewport', async ({page}) => {
  await page.setViewportSize({width:390,height:844});let current=job('researching');
  await page.route('**/api/editorial-research/jobs',route=>route.fulfill({json:[current]}));
  await page.route('**/api/editorial-research/jobs/*/cancel',route=>{current=job('cancelled');return route.fulfill({json:current});});
  await openPanel(page);await page.getByRole('button',{name:'إلغاء المهمة',exact:true}).click();await expect(page.getByTestId('research-status')).toHaveText('أُلغيت المهمة');
  const fits=await page.getByTestId('dialog-sabq-assistant').evaluate(el=>el.scrollWidth<=el.clientWidth+1);expect(fits).toBe(true);
  await page.screenshot({path:test.info().outputPath('research-mobile.png'),fullPage:true,animations:'disabled'});
});

for (const role of ['editor', 'admin', 'reader']) {
  test(`hides research from ${role} even with wildcard permissions`, async ({page}) => {
    const user = {id:'editor-a', role, permissions:['*', 'articles.ai_generate']};
    await page.addInitScript(user => { window.researchTestUser = user; }, user);
    await page.route('**/api/auth/user', route => route.fulfill({json:user}));
    const requests: string[] = [];
    page.on('request', request => { if(request.url().includes('/api/editorial-research/')) requests.push(request.url()); });
    await page.goto('/__editorial-research-test');
    await page.getByRole('button',{name:'محرر سبق',exact:true}).click();
    await expect(page.getByTestId('select-sabq-task')).toBeVisible();
    await expect(page.getByTestId('open-editorial-research')).toHaveCount(0);
    await expect(page.getByTestId('editorial-research-panel')).toHaveCount(0);
    expect(requests).toEqual([]);
  });
}
test('removes research and its preview when the current user loses the system administrator role', async ({page}) => {
  await page.route('**/api/editorial-research/jobs', route => route.fulfill({json:[job('completed')]}));
  await openPanel(page);
  await page.getByTestId('research-review').click();
  await expect(page.getByTestId('button-sabq-apply-body')).toBeVisible();
  await page.evaluate(() => window.setResearchTestUser({id:'editor-a',role:'editor',permissions:['*']}));
  await expect(page.getByTestId('select-sabq-task')).toBeVisible();
  await expect(page.getByTestId('open-editorial-research')).toHaveCount(0);
  await expect(page.getByTestId('button-sabq-apply-body')).toHaveCount(0);
});

test('shows only the disabled state and never requests unconfigured job storage', async ({page}) => {
  let jobRequests = 0, capabilitiesRequests = 0;
  await page.route('**/api/editorial-research/capabilities', route => { capabilitiesRequests++; return route.fulfill({json:{enabled:false,historyAvailable:false,reason:'مساعد البحث التجريبي غير مفعّل حاليًا.',dailyLimit:5,maxMinutes:5}}); });
  await page.route('**/api/editorial-research/jobs', route => { jobRequests++; return route.fulfill({status:503,json:{message:'storage not configured'}}); });
  await openPanel(page);
  await expect(page.getByTestId('editorial-research-panel').getByRole('status')).toContainText('غير مفعّل');
  await expect(page.getByTestId('research-topic')).toHaveCount(0);
  await expect(page.getByText('مهامك الأخيرة')).toHaveCount(0);
  await page.getByRole('button',{name:'تحديث الحالة',exact:true}).click();
  await expect.poll(()=>capabilitiesRequests).toBe(2);
  expect(jobRequests).toBe(0);
});
test('keeps history and cancellation available while admission is disabled', async ({page}) => {
  let current = job('researching');
  await page.route('**/api/editorial-research/capabilities', route => route.fulfill({json:{enabled:false,historyAvailable:true,reason:'مساعد البحث التجريبي غير مفعّل حاليًا.',dailyLimit:5,maxMinutes:5}}));
  await page.route('**/api/editorial-research/jobs',route=>route.fulfill({json:[current]}));
  await page.route('**/api/editorial-research/jobs/*/cancel',route=>{current=job('cancelled');return route.fulfill({json:current});});
  await openPanel(page);
  await expect(page.getByTestId('research-start')).toBeDisabled();
  await page.getByRole('button',{name:'إلغاء المهمة',exact:true}).click();
  await expect(page.getByTestId('research-status')).toHaveText('أُلغيت المهمة');
});
