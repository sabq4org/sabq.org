import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const clientCss = readFileSync(resolve("client/src/index.css"), "utf8");
const nextCss = readFileSync(resolve("web-next/app/globals.css"), "utf8");
const editorSource = readFileSync(resolve("client/src/components/RichTextEditor.tsx"), "utf8");
const clientHtml = readFileSync(resolve("client/index.html"), "utf8");

function firstDarkBlock(source: string): string {
  const match = source.match(/\.dark\s*\{([\s\S]*?)\n\}/);
  if (!match) throw new Error("Missing core .dark theme block");
  return match[1];
}

function token(block: string, name: string): string {
  const match = block.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`Missing --${name} token`);
  return match[1].trim();
}

describe("comfortable dark theme", () => {
  it("keeps the SPA and Next public surfaces on the same core palette", () => {
    const spa = firstDarkBlock(clientCss);
    const next = firstDarkBlock(nextCss);
    const sharedTokens = [
      "background",
      "foreground",
      "border",
      "card",
      "card-foreground",
      "card-border",
      "popover",
      "popover-foreground",
      "primary",
      "primary-foreground",
      "secondary",
      "secondary-foreground",
      "muted",
      "muted-foreground",
      "footer",
      "footer-foreground",
      "accent",
      "accent-foreground",
      "input",
      "ring",
    ];

    for (const name of sharedTokens) {
      expect(token(next, name), `--${name}`).toBe(token(spa, name));
    }
    expect(token(spa, "background")).not.toBe("0 0% 0%");
  });

  it("boots the saved theme before the application safety scripts", () => {
    const themeBootstrap = clientHtml.indexOf("theme-preference");
    const safetyScript = clientHtml.indexOf("Suppress third-party script errors");
    expect(themeBootstrap).toBeGreaterThan(0);
    expect(themeBootstrap).toBeLessThan(safetyScript);
  });

  it("gives TipTap an inverted dark prose surface and protects legacy black text", () => {
    expect(editorSource).toContain("dark:prose-invert");
    expect(editorSource).toContain("rich-text-editor__surface");
    expect(clientCss).toContain("--editor-foreground:");
    expect(clientCss).toContain('[style*="color: #000000"]');
  });
});
