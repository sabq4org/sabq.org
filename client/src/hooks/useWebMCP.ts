import { useEffect } from "react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";

interface JsonSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
}

interface ToolResult {
  ok: boolean;
  message?: string;
  navigated_to?: string;
  status?: number;
  theme?: "light" | "dark";
}

interface SearchInput { query: string }
interface SlugInput { slug: string }
interface EmailInput { email: string }
interface ThemeInput { theme?: "light" | "dark" | "toggle" }

interface WebMCPTool<I> {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  execute: (input: I) => Promise<ToolResult> | ToolResult;
}

type AnyWebMCPTool =
  | WebMCPTool<SearchInput>
  | WebMCPTool<SlugInput>
  | WebMCPTool<EmailInput>
  | WebMCPTool<ThemeInput>;

interface ModelContextProvider {
  provideContext?: (ctx: { tools: AnyWebMCPTool[] }) => void | Promise<void>;
}

declare global {
  interface Navigator {
    modelContext?: ModelContextProvider;
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "unknown error";
}

export function useWebMCP() {
  const [, navigate] = useLocation();

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const modelContext = navigator.modelContext;
    if (!modelContext || typeof modelContext.provideContext !== "function") return;

    const searchNews: WebMCPTool<SearchInput> = {
      name: "search_news",
      description: "Search Sabq news articles by Arabic or English keyword and open the results page.",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string", description: "Search keyword" } },
        required: ["query"],
      },
      execute: ({ query }) => {
        const q = String(query ?? "").trim();
        if (!q) return { ok: false, message: "empty query" };
        const url = `/?q=${encodeURIComponent(q)}`;
        navigate(url);
        return { ok: true, navigated_to: url };
      },
    };

    const openCategory: WebMCPTool<SlugInput> = {
      name: "open_category",
      description: "Open a Sabq category page by its slug (e.g. 'sports', 'politics').",
      inputSchema: {
        type: "object",
        properties: { slug: { type: "string", description: "Category slug" } },
        required: ["slug"],
      },
      execute: ({ slug }) => {
        const s = String(slug ?? "").trim();
        if (!s) return { ok: false, message: "empty slug" };
        const url = `/category/${encodeURIComponent(s)}`;
        navigate(url);
        return { ok: true, navigated_to: url };
      },
    };

    const openArticle: WebMCPTool<SlugInput> = {
      name: "open_article",
      description: "Open a Sabq article page by its slug.",
      inputSchema: {
        type: "object",
        properties: { slug: { type: "string", description: "Article slug" } },
        required: ["slug"],
      },
      execute: ({ slug }) => {
        const s = String(slug ?? "").trim();
        if (!s) return { ok: false, message: "empty slug" };
        const url = `/article/${encodeURIComponent(s)}`;
        navigate(url);
        return { ok: true, navigated_to: url };
      },
    };

    const subscribeNewsletter: WebMCPTool<EmailInput> = {
      name: "subscribe_newsletter",
      description: "Subscribe an email address to the Sabq newsletter. Requires explicit user consent.",
      inputSchema: {
        type: "object",
        properties: { email: { type: "string", description: "Subscriber email" } },
        required: ["email"],
      },
      execute: async ({ email }) => {
        const e = String(email ?? "").trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) {
          return { ok: false, message: "invalid email" };
        }
        try {
          await apiRequest("/api/newsletter/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: e }),
          });
          return { ok: true, status: 200 };
        } catch (err) {
          return { ok: false, message: errorMessage(err) };
        }
      },
    };

    const toggleTheme: WebMCPTool<ThemeInput> = {
      name: "toggle_theme",
      description: "Toggle the Sabq site between light and dark themes.",
      inputSchema: {
        type: "object",
        properties: { theme: { type: "string", enum: ["light", "dark", "toggle"] } },
      },
      execute: ({ theme }) => {
        try {
          const root = document.documentElement;
          const current: "light" | "dark" = root.classList.contains("dark") ? "dark" : "light";
          const next: "light" | "dark" = !theme || theme === "toggle"
            ? current === "dark" ? "light" : "dark"
            : theme;
          root.classList.remove("light", "dark");
          root.classList.add(next);
          root.setAttribute("data-theme", next);
          root.setAttribute("data-theme-preference", next);
          root.style.colorScheme = next;
          try {
            localStorage.setItem("theme", next);
            localStorage.setItem("theme-preference", next);
          } catch { /* ignore */ }
          return { ok: true, theme: next };
        } catch (err) {
          return { ok: false, message: errorMessage(err) };
        }
      },
    };

    const tools: AnyWebMCPTool[] = [
      searchNews,
      openCategory,
      openArticle,
      subscribeNewsletter,
      toggleTheme,
    ];

    try {
      const result = modelContext.provideContext({ tools });
      if (result instanceof Promise) {
        result.catch((err) => console.warn("[WebMCP] provideContext failed:", errorMessage(err)));
      }
    } catch (err) {
      console.warn("[WebMCP] provideContext threw:", errorMessage(err));
    }
  }, [navigate]);
}
