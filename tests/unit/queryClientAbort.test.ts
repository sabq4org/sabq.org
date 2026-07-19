import { afterEach, describe, expect, it, vi } from "vitest";
import { getQueryFn } from "../../client/src/lib/queryClient";

describe("default query cancellation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes TanStack Query's abort signal to fetch", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ results: [] }),
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const queryFn = getQueryFn({ on401: "returnNull" });
    await queryFn({
      queryKey: ["/api/search", { q: "الاسكان" }],
      signal: controller.signal,
    } as never);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/search?q=%D8%A7%D9%84%D8%A7%D8%B3%D9%83%D8%A7%D9%86",
      expect.objectContaining({
        credentials: "include",
        signal: controller.signal,
      }),
    );
  });
});
