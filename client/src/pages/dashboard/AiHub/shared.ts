// AI Hub dashboard — shared types, provider palette, and formatters.
// Provider colors are entity-fixed (never rank-based) and CVD-validated:
// worst adjacent-pair ΔE 35.2 (protan) on light surface.

import { useSyncExternalStore } from "react";

export const PROVIDER_META: Record<string, { name: string; color: string; colorDark: string }> = {
  openai: { name: "OpenAI", color: "#059669", colorDark: "#34d399" },
  anthropic: { name: "Anthropic", color: "#ea580c", colorDark: "#fb923c" },
  gemini: { name: "Google Gemini", color: "#4f46e5", colorDark: "#818cf8" },
  elevenlabs: { name: "ElevenLabs", color: "#db2777", colorDark: "#f472b6" },
};

export const ACCENT = { light: "#4f46e5", dark: "#818cf8" };
export const PROJECTION = { light: "#d97706", dark: "#fbbf24" };

export const CATEGORY_LABELS: Record<string, string> = {
  editorial: "تحريري",
  analysis: "تحليل",
  moderation: "إشراف",
  agents: "وكلاء",
  search: "بحث ومتجهات",
  media: "وسائط",
  audio: "صوت",
  seo: "SEO",
  general: "عام",
};

export const HEALTH_META: Record<string, { label: string; className: string }> = {
  healthy: { label: "صحي", className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900" },
  degraded: { label: "متدهور", className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900" },
  quota_exceeded: { label: "نفد الرصيد", className: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900" },
  down: { label: "معطّل", className: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900" },
};

export const STATUS_META: Record<string, { label: string; className: string }> = {
  success: { label: "نجاح", className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900" },
  fallback: { label: "تحويل", className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900" },
  failed: { label: "فشل", className: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900" },
};

/** Theme-aware flag: tracks the `dark` class on <html> (ThemeProvider toggles it). */
export function useIsDark(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const observer = new MutationObserver(onChange);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      return () => observer.disconnect();
    },
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );
}

export function providerColor(provider: string, dark: boolean): string {
  const meta = PROVIDER_META[provider];
  if (!meta) return dark ? "#94a3b8" : "#64748b";
  return dark ? meta.colorDark : meta.color;
}

export function providerName(provider: string): string {
  return PROVIDER_META[provider]?.name ?? provider;
}

const intFmt = new Intl.NumberFormat("en-US");

export function formatInt(n: number): string {
  return intFmt.format(Math.round(n));
}

export function formatUsd(n: number): string {
  if (n === 0) return "$0";
  if (Math.abs(n) < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return formatInt(n);
}

export function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

// ── API payload types ──

export interface OverviewStats {
  today: { requests: number; costUsd: number; inputTokens: number; outputTokens: number };
  yesterdaySameWindow: { requests: number; costUsd: number };
  last24h: {
    total: number;
    success: number;
    fallback: number;
    failed: number;
    successRate: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
  };
  month: { costUsd: number; projectedCostUsd: number; budgetUsd: number | null };
  providers: Record<
    string,
    { status: string; failCount: number; cooldownUntil: string | null; lastErrorCode: string | null; p95LatencyMs: number; requests24h: number }
  >;
}

export interface SeriesPoint {
  date: string;
  costUsd: number;
  requests: number;
  tokens: number;
}

export interface DistributionPayload {
  providers: Array<{ provider: string; costUsd: number; requests: number }>;
  features: Array<{ featureKey: string; displayName: string; costUsd: number; requests: number; fallbacks: number }>;
}

export interface ModelInfo {
  id: string;
  provider: string;
  modelId: string;
  displayName: string;
  capabilities: string[];
  pricingUnit: string;
  costPer1MInput: number;
  costPer1MOutput: number;
  costPerUnit: number;
  isActive: boolean;
  priority: number;
}

export interface FeatureRow {
  featureKey: string;
  displayName: string;
  category: string;
  primaryModel: ModelInfo | null;
  fallbackChain: ModelInfo[];
  maxTokens: number | null;
  temperature: number | null;
  isEnabled: boolean;
  allowFailover: boolean;
  usage30d: { costUsd: number; requests: number; fallbacks: number };
}

export interface ModelRow extends ModelInfo {
  health: {
    status: string;
    failCount: number;
    lastErrorCode: string | null;
    lastError: string | null;
    cooldownUntil: string | null;
  } | null;
  usage30d: { costUsd: number; requests: number };
}

export interface LogRow {
  id: string;
  featureKey: string;
  provider: string;
  modelId: string;
  operation: string;
  inputTokens: number;
  outputTokens: number;
  unitCount: number;
  estimatedCostUsd: number;
  latencyMs: number;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface AuditRow {
  id: string;
  entityType: string;
  entityKey: string;
  action: string;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  userName: string | null;
  createdAt: string;
}

export interface BudgetRow {
  id: string;
  scope: string;
  scopeKey: string;
  monthlyLimitUsd: number;
  alertAt80: boolean;
  alertAt100: boolean;
  isEnabled: boolean;
  spentThisMonthUsd: number;
}

export interface TestResult {
  ok: boolean;
  kind?: string;
  provider?: string;
  modelId?: string;
  latencyMs?: number;
  estimatedCostUsd?: number;
  fallbackUsed?: boolean;
  preview?: string;
  error?: string;
}
