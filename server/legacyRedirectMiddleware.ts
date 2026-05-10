import type { Request, Response, NextFunction } from "express";
import { db } from "./db";
import { legacyRedirects } from "@shared/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { memoryCache } from "./memoryCache";

const hitCountBuffer = new Map<string, number>();

setInterval(async () => {
  if (hitCountBuffer.size === 0) return;
  const batch = new Map(hitCountBuffer);
  hitCountBuffer.clear();

  for (const [id, count] of batch) {
    try {
      await db
        .update(legacyRedirects)
        .set({
          hitCount: sql`${legacyRedirects.hitCount} + ${count}`,
          lastHitAt: new Date()
        })
        .where(eq(legacyRedirects.id, id));
    } catch (err) {
      hitCountBuffer.set(id, (hitCountBuffer.get(id) || 0) + count);
    }
  }
}, 5 * 60 * 1000);

function generatePathVariants(normalizedPath: string): string[] {
  const paths = [normalizedPath];
  const segments = normalizedPath.split('/').filter(Boolean);

  if (segments.length === 3) {
    paths.push(`/${segments[1]}/${segments[2]}`);
    paths.push(`/${segments[2]}`);
  } else if (segments.length === 2) {
    paths.push(`/${segments[1]}`);
  }

  return paths;
}

export async function legacyRedirectMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const urlPath = req.path;
  
  if (urlPath.startsWith('/api/') || 
      urlPath.startsWith('/@') || 
      urlPath.startsWith('/node_modules/') ||
      urlPath.startsWith('/src/') ||
      urlPath.includes('.')) {
    return next();
  }

  try {
    let normalizedPath = urlPath;
    try {
      normalizedPath = decodeURIComponent(urlPath);
    } catch (e) {}
    normalizedPath = normalizedPath.replace(/\/$/, '');

    const cacheKey = `legacy-redirect:${normalizedPath}`;
    const cached = memoryCache.get<{ found: boolean; newPath?: string; redirectType?: number; id?: string }>(cacheKey);

    if (cached !== null && cached !== undefined) {
      if (!cached.found) return next();
      hitCountBuffer.set(cached.id!, (hitCountBuffer.get(cached.id!) || 0) + 1);
      return res.redirect(cached.redirectType!, cached.newPath!);
    }

    const pathVariants = generatePathVariants(normalizedPath);

    const [redirect] = await db
      .select({
        id: legacyRedirects.id,
        newPath: legacyRedirects.newPath,
        redirectType: legacyRedirects.redirectType,
      })
      .from(legacyRedirects)
      .where(
        and(
          inArray(legacyRedirects.oldPath, pathVariants),
          eq(legacyRedirects.isActive, true)
        )
      )
      .limit(1);

    if (redirect) {
      memoryCache.set(cacheKey, { found: true, id: redirect.id, newPath: redirect.newPath, redirectType: redirect.redirectType }, 60000);
      hitCountBuffer.set(redirect.id, (hitCountBuffer.get(redirect.id) || 0) + 1);
      return res.redirect(redirect.redirectType, redirect.newPath);
    }

    memoryCache.set(cacheKey, { found: false }, 60000);
    return next();
  } catch (error) {
    console.error("[LegacyRedirect] Error checking redirects:", error);
    return next();
  }
}
