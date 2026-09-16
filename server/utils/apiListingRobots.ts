import type { RequestHandler } from "express";

// Exact JSON listing endpoints observed in GSC. Do not open their child routes
// or unrelated APIs: crawlers only need to see the noindex response here.
const LISTINGS = ["/api/articles", "/api/v2/articles"];
export const apiListingRobotsRules = LISTINGS.flatMap(path => [
  `Allow: ${path}$`, `Allow: ${path}?`,
  `Allow: ${path}/$`, `Allow: ${path}/?`,
]).join("\n");

export const apiListingNoindex: RequestHandler = (req, res, next) => {
  if ((req.method === "GET" || req.method === "HEAD") && LISTINGS.includes(req.path.replace(/\/$/, ""))) {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
  }
  next();
};
