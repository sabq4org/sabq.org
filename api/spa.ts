export const config = {
  runtime: "edge",
};

// SPA shell delivery via Vercel Edge Function.
//
// Why this exists: Vercel's "rewrite caching" (x-vercel-enable-rewrite-caching: 1)
// holds onto the rewritten /index.html response for tens of minutes on each
// POP, even with Cache-Control: no-store + Vercel-CDN-Cache-Control: no-store
// on the response. That means right after a deploy the edge keeps serving
// HTML pointing at the previous build's hashed chunk names, and users see
// 404s on /assets/index-<old-hash>.js until the POP cache rotates.
//
// Routing requests through an Edge Function instead of a plain rewrite
// bypasses that caching path. The function fetches the real built
// index.html out of the static asset pipeline (which IS cacheable on its
// own URL, but cheap to refetch) and re-emits it with the maximum no-cache
// directives the spec gives us. Each user request now goes browser → CF →
// Vercel Edge function → static index.html → fresh response, so HTML and
// chunks always come from the same deployment.

export default async function handler(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  // Fetch the real built /index.html from the same origin. Vercel serves it
  // as a static asset; this fetch is cheap and shares the deploy lifecycle.
  // We append a deployment-id query param so the fetch hits the static
  // file directly without going back through our own catch-all rewrite.
  const deployId = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || "";
  const indexUrl = `${requestUrl.origin}/index.html?_=${encodeURIComponent(deployId)}`;

  let html: string;
  let status = 200;
  try {
    const upstream = await fetch(indexUrl, {
      // Don't let the edge dedupe this fetch with the user's cached one
      cache: "no-store",
    });
    status = upstream.status;
    html = await upstream.text();
  } catch (err) {
    return new Response(
      `<!doctype html><meta charset="utf-8"><title>سبق</title><p>تعذّر تحميل الصفحة، حاول التحديث.</p>`,
      {
        status: 503,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      },
    );
  }

  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0",
      "CDN-Cache-Control": "no-store",
      "Vercel-CDN-Cache-Control": "no-store",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
