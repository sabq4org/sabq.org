import express, { type Express, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';

let cachedHtml: string | null = null;
let htmlMtime: number = 0;

export function serveStaticWithRocketLoaderFix(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Serve static files BUT exclude index.html so we can patch it
  // Hashed assets (JS, CSS) get immutable cache, others get short cache
  app.use(express.static(distPath, {
    index: false,
    setHeaders: (res, filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      const fileName = path.basename(filePath);
      
      // Hashed assets (e.g., index-abc123.js) - long immutable cache
      const isHashedAsset = /\.[a-f0-9]{8,}\.(js|css|woff2?|ttf|eot)$/i.test(fileName) ||
                            /assets\/.*\.(js|css)$/i.test(filePath);
      
      if (isHashedAsset || ['.js', '.css'].includes(ext)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico'].includes(ext)) {
        res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      } else if (['.woff', '.woff2', '.ttf', '.eot'].includes(ext)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  }));

  app.use("*", (req: Request, res: Response, _next: NextFunction) => {
    const indexPath = path.resolve(distPath, "index.html");
    
    try {
      const stats = fs.statSync(indexPath);
      const currentMtime = stats.mtimeMs;
      
      if (!cachedHtml || currentMtime !== htmlMtime) {
        let html = fs.readFileSync(indexPath, "utf-8");
        
        html = html.replace(
          /<script(?![^>]*data-cfasync)([^>]*)(type="module")/g,
          '<script data-cfasync="false"$1$2'
        );
        
        html = html.replace(
          /<script(?![^>]*data-cfasync)(?![^>]*type=)/g,
          '<script data-cfasync="false"'
        );
        
        cachedHtml = html;
        htmlMtime = currentMtime;
        console.log("[RocketLoaderFix] HTML patched with data-cfasync attributes");
      }
      
      const isAuthenticated = !!(req as any).user || !!(req as any).session?.passport?.user;

      const headers: Record<string, string> = {
        "Content-Type": "text/html; charset=utf-8",
        "Vary": "Accept-Encoding, Cookie",
      };

      if (isAuthenticated) {
        headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0";
        headers["CDN-Cache-Control"] = "no-store";
        headers["Surrogate-Control"] = "no-store";
        headers["Pragma"] = "no-cache";
        headers["Expires"] = "0";
      } else {
        // Browser MUST NOT cache HTML — prevents stale chunk references after deploys.
        // Cloudflare edge caches briefly (s-maxage=60) for fast TTFB, with SWR window.
        headers["Cache-Control"] = "no-cache, no-store, must-revalidate, s-maxage=60, stale-while-revalidate=120";
        headers["CDN-Cache-Control"] = "max-age=60";
        headers["Pragma"] = "no-cache";
        headers["Expires"] = "0";
      }

      res.removeHeader('Cache-Control');
      res.removeHeader('Pragma');
      res.removeHeader('Expires');
      res.status(200).set(headers);

      if (!isAuthenticated) {
        res.removeHeader('Set-Cookie');
        res.removeHeader('set-cookie');
      }

      const originalEnd = res.end.bind(res);
      res.end = function(...args: any[]) {
        if (!isAuthenticated) {
          const cc = res.getHeader('Cache-Control');
          if (typeof cc === 'string' && cc.includes('private')) {
            res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=120');
          }
        }
        return originalEnd(...args);
      } as typeof res.end;

      res.end(cachedHtml);
    } catch (error) {
      console.error("[RocketLoaderFix] Error:", error);
      res.status(500).send("Error loading page");
    }
  });
}
