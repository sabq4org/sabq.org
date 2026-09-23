import { test, expect } from "@playwright/test";
import path from "node:path";

const sample = '<p><a href="https://example.com/الى" title="الى">الى</a> تنفيذ مشروعتقني وتحديد المخاطر<strong>والالتزامات</strong>.</p>';
const issues = [
  { original: "الى", suggestion: "إلى", type: "همزات", explanation: "همزة قطع" },
  { original: "مشروعتقني", suggestion: "مشروع تقني", type: "كلمات ملتصقة", explanation: "فصل كلمتين" },
  { original: "المخاطروالالتزامات", suggestion: "المخاطر والالتزامات", type: "كلمات ملتصقة", explanation: "فصل كلمتين" },
];

test.beforeEach(async ({page, baseURL}) => {
  page.on('pageerror', error => console.error('Proofread harness:', error.message));
  test.skip(!baseURL || !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname), "Local Vite only");
  const transformed = await (await page.request.get(`${baseURL}/src/hooks/useArticleAiTools.ts`)).text();
  const queryModule = transformed.match(/from "([^"]+@tanstack_react-query\.js[^"]*)"/)![1];
  const deps = `/@fs${path.resolve('node_modules/.vite/deps')}`;
  await page.route('**/__proofread-test', route => route.fulfill({contentType:'text/html; charset=utf-8',body:`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
    import RefreshRuntime from '/@react-refresh';
    RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type;
    window.__vite_plugin_react_preamble_installed__=true;
    document.cookie='csrf-token=test-csrf; path=/';
    await import('/src/index.css');
    const {default:React}=await import('${deps}/react.js');
    const {default:ReactDOM}=await import('${deps}/react-dom_client.js');
    const {QueryClientProvider}=await import('${queryModule}');
    const {queryClient}=await import('/src/lib/queryClient.ts');
    const {useArticleAiTools}=await import('/src/hooks/useArticleAiTools.ts');
    const {ProofreadDialog}=await import('/src/components/article-editor/ProofreadDialog.tsx');
    const {Toaster}=await import('/src/components/ui/toaster.tsx');
    const {LiveRegionProvider}=await import('/src/contexts/LiveRegionContext.tsx');
    const {LanguageProvider}=await import('/src/contexts/LanguageContext.tsx');
    const {applyProofreadIssue}=await import('/src/lib/applyProofreadIssue.ts');
    window.applyProofreadIssue=applyProofreadIssue;
    const noop=()=>{};
    function Test(){
      const [content,setContent]=React.useState(${JSON.stringify(sample)});
      const [issues,setIssues]=React.useState([]),[open,setOpen]=React.useState(false);
      const args={id:undefined,isNewArticle:true,categories:[],title:'تجربة التدقيق',subtitle:'',content,excerpt:'',categoryId:'',keywords:[],metaTitle:'',metaDescription:'',newsletterSubtitle:'',newsletterExcerpt:'',imageUrl:'',thumbnailUrl:'',status:'draft',generatedSocialCards:null,setContent,setProofreadIssues:setIssues,setShowProofreadDialog:setOpen};
      for(const k of ['setTitle','setSubtitle','setSlug','setExcerpt','setCategoryId','setKeywords','setMetaTitle','setMetaDescription','setNewsletterSubtitle','setNewsletterExcerpt','setTitleProofreadResult','setShowTitleProofreadDialog','setGeneratedSocialCards']) args[k]=noop;
      const {proofreadMutation}=useArticleAiTools(args);
      return React.createElement(React.Fragment,null,
        React.createElement('button',{onClick:()=>proofreadMutation.mutate(),disabled:proofreadMutation.isPending},'تدقيق لغوي'),
        React.createElement('div',{'data-testid':'editor-content',dangerouslySetInnerHTML:{__html:content}}),
        React.createElement(ProofreadDialog,{open,onOpenChange:setOpen,issues,setIssues,content,setContent}),React.createElement(Toaster));
    }
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(QueryClientProvider,{client:queryClient},React.createElement(LanguageProvider,null,React.createElement(LiveRegionProvider,null,React.createElement(Test)))));
  </script></body></html>`}));
  await page.route('**/api/csrf-token',route=>route.fulfill({json:{csrfToken:'test-csrf'}}));
});

test('shows joined words and hamzas and applies only on editor action without changing link attributes',async({page})=>{
  await page.route('**/api/ai/proofread',route=>{
    expect(route.request().postDataJSON().content).toBe(sample);
    return route.fulfill({json:{issues}});
  });
  await page.goto('/__proofread-test');
  await page.getByRole('button',{name:'تدقيق لغوي',exact:true}).click();
  await expect(page.getByTestId('proofread-original-1')).toHaveText('مشروعتقني');
  await expect(page.getByTestId('proofread-suggestion-2')).toHaveText('المخاطر والالتزامات');
  await expect(page.getByTestId('editor-content')).toContainText('مشروعتقني');
  await expect(page.getByTestId('dialog-proofread')).toHaveCSS('opacity','1');
  await page.screenshot({path:test.info().outputPath('proofread-dialog.png'),fullPage:true,animations:'disabled'});
  await page.getByTestId('button-apply-all-proofread').click();
  await expect(page.getByTestId('editor-content')).toHaveText('إلى تنفيذ مشروع تقني وتحديد المخاطر والالتزامات.');
  await expect(page.getByTestId('editor-content').locator('a')).toHaveAttribute('href','https://example.com/الى');
  await expect(page.getByTestId('editor-content').locator('a')).toHaveAttribute('title','الى');
  await expect(page.getByTestId('editor-content').locator('strong')).toContainText('والالتزامات');
});

test('malformed API success never becomes a clean-text result',async({page})=>{
  await page.route('**/api/ai/proofread',route=>route.fulfill({json:{}}));
  await page.goto('/__proofread-test');
  await page.getByRole('button',{name:'تدقيق لغوي',exact:true}).click();
  await expect(page.getByText('لم تكتمل نتيجة التدقيق، يرجى إعادة المحاولة', {exact:true})).toBeVisible();
  await expect(page.getByTestId('dialog-proofread')).not.toBeVisible();
});

test('server failure shows retry guidance and does not modify the editor',async({page})=>{
  await page.route('**/api/ai/proofread',route=>route.fulfill({status:502,json:{message:'لم تكتمل نتيجة التدقيق، يرجى إعادة المحاولة'}}));
  await page.goto('/__proofread-test');
  await page.getByRole('button',{name:'تدقيق لغوي',exact:true}).click();
  await expect(page.getByText('الخادم غير متاح مؤقتاً، يرجى المحاولة مرة أخرى', {exact:true})).toBeVisible();
  await expect(page.getByTestId('dialog-proofread')).not.toBeVisible();
  await expect(page.getByTestId('editor-content')).toContainText('مشروعتقني');
});

test('safe visible-text replacement handles entities, formatting, stale text and HTML-looking suggestions',async({page})=>{
  await page.goto('/__proofread-test');
  await expect(page.getByRole('button',{name:'تدقيق لغوي',exact:true})).toBeVisible();
  const results=await page.evaluate(()=>{
    const apply=(window as any).applyProofreadIssue;
    return [
      apply('<p>&#1575;لى</p>','الى','إلى'),
      apply('<p>استثمار</p>','ثمار','ثِمار جديدة'),
      apply('<p><a href="https://example.com/الى">رابط</a></p>','الى','إلى'),
      apply('<p>الادارة</p>','الادارة','<img src=x onerror=alert(1)>'),
      apply('<p>عمل&nbsp;جديد</p>','عمل جديد','عمل مميز'),
      apply('<p>المخاطر<strong>والالتزامات</strong></p>','المخاطروالالتزامات','المخاطر والالتزامات'),
      apply('<p>الوزار</p>','الوزار','الوزارة'),
    ];
  });
  expect(results[0]).toBe('<p>إلى</p>');
  expect(results[1]).toBeNull();
  expect(results[2]).toBeNull();
  expect(results[3]).not.toContain('<img');
  expect(results[3]).toContain('&lt;img');
  expect(results[4]).toBe('<p>عمل&nbsp;مميز</p>');
  expect(results[5]).toContain('<strong> والالتزامات</strong>');
  expect(results[6]).toBe('<p>الوزارة</p>');
});

test('mobile results fit the viewport',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.route('**/api/ai/proofread',route=>route.fulfill({json:{issues}}));
  await page.goto('/__proofread-test');
  await page.getByRole('button',{name:'تدقيق لغوي',exact:true}).click();
  const dialog=page.getByTestId('dialog-proofread');
  await expect(dialog).toBeVisible();
  const box=await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x+box!.width).toBeLessThanOrEqual(391);
});
