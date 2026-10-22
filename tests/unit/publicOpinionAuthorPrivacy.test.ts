import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routesSource = readFileSync(resolve("server/routes.ts"), "utf8");

// One route registration in routes.ts: from `app.get("<path>"` up to the next
// top-level `app.<verb>(` registration.
function handlerSource(path: string): string {
  const start = routesSource.indexOf(`app.get("${path}"`);
  expect(start, path).toBeGreaterThan(-1);
  const rest = routesSource.slice(start + 1);
  const end = rest.search(/\n {2}app\.(get|post|put|patch|delete|use)\(/);
  return end === -1 ? routesSource.slice(start) : routesSource.slice(start, start + 1 + end);
}

// Both answers are anonymous and edge-cached (Pages Cache API with a 24h
// last-good copy, Worker burst cache), so every field they select is public.
// Until 2026-10-22 both returned author.email for every writer.
describe("public opinion routes keep writer emails private", () => {
  it.each(["/api/opinion", "/api/opinion/related/category/:categoryId"])(
    "%s does not select the author email",
    (path) => {
      const source = handlerSource(path);
      expect(source).toContain("firstName: users.firstName");
      expect(source).not.toMatch(/users\.email/);
    },
  );
});
