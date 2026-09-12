import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const html = readFileSync("client/index.html", "utf8");
const bootstrap = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(script => script.includes("function requestAdScripts()"))!;

function fixture() {
  let allowed = false;
  const sources: string[] = [];
  const window = Object.assign(new EventTarget(), { __sabqAnalyticsAllowed: () => allowed });
  const document = Object.assign(new EventTarget(), {
    createElement: () => ({ src: "" }),
    head: { appendChild: (node: { src: string }) => sources.push(node.src) },
    getElementsByTagName: () => [{ parentNode: { insertBefore: (node: { src: string }) => sources.push(node.src) } }],
  });
  let timer = () => {};
  runInNewContext(bootstrap, { window, document, setTimeout: (callback: () => void) => { timer = callback; } });
  return { window, document, sources, allow: () => { allowed = true; }, timer: () => timer() };
}

describe("actual advertising bootstrap", () => {
  it("waits for content or interaction even when GA is ready, then loads the company container once", () => {
    const f = fixture(); f.allow();
    f.window.dispatchEvent(new Event("sabq:analytics-ready"));
    expect(f.sources).toEqual([]);
    f.window.dispatchEvent(new Event("sabq:content-painted"));
    f.timer(); f.document.dispatchEvent(new Event("click"));
    expect(f.sources).toEqual([
      "https://securepubads.g.doubleclick.net/tag/js/gpt.js",
      "https://www.googletagmanager.com/gtm.js?id=GTM-T5PW84LM",
    ]);
  });
  it("blocks loading on private routes and retries after returning to a public page", () => {
    const f = fixture(); f.timer();
    f.document.dispatchEvent(new Event("click"));
    expect(f.sources).toEqual([]);
    f.allow(); f.window.dispatchEvent(new Event("sabq:analytics-route"));
    expect(f.sources).toHaveLength(2);
  });
});
