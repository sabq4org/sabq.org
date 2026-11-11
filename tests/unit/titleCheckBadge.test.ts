import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TitleCheckBadge } from "../../client/src/components/articles/TitleCheckBadge";

describe("TitleCheckBadge", () => {
  // Vitest's node transform uses classic JSX; the client build uses Vite React.
  beforeEach(() => vi.stubGlobal("React", React));
  afterEach(() => vi.unstubAllGlobals());
  it("shows «راجع العنوان» with the score only for flagged articles", () => {
    const flags = new Map<string, number | null>([["a1", 0.149]]);
    const html = renderToStaticMarkup(createElement(TitleCheckBadge, { articleId: "a1", flags }));
    expect(html).toContain("راجع العنوان");
    expect(html).toContain("0.15");
    expect(html).toContain('data-testid="badge-title-check-a1"');
    expect(renderToStaticMarkup(createElement(TitleCheckBadge, { articleId: "a2", flags }))).toBe("");
    expect(renderToStaticMarkup(createElement(TitleCheckBadge, { articleId: "a1", flags: undefined }))).toBe("");
  });
});
