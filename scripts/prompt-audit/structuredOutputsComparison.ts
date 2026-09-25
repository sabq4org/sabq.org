import type { EditorialTaskInput } from "../../server/ai/prompts/editorialRequest";
import { SABQ_TASK_PROMPTS_AR } from "../../server/ai/prompts/tasks";

export type ComparisonCohort = "normal" | "quotes" | "short";
export type ComparisonMode = "prompt-only" | "schema";

export type ComparisonSample = EditorialTaskInput & Record<string, unknown> & {
  id: string;
  cohort: ComparisonCohort;
};

export type UsageSnapshot = {
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadInputTokens: number | null;
  cacheCreationInputTokens: number | null;
  raw: unknown;
};

export type PriceConfig = {
  inputUsdPer1M: number | null;
  outputUsdPer1M: number | null;
  cacheReadUsdPer1M: number | null;
  cacheCreationUsdPer1M: number | null;
};

export type ComparisonRow = {
  id: string;
  cohort: ComparisonCohort;
  type: string;
  mode: ComparisonMode;
  source: ComparisonSample;
  startedAt: string;
  finishedAt: string;
  latencyMs: number;
  hasAsciiQuote: boolean;
  stopReason: string;
  jsonParsed: boolean;
  validJson: boolean;
  schemaValid: boolean;
  editorNotesOk: boolean;
  completenessOk: boolean | "n/a";
  bodyChars: number;
  rawText: string;
  parsedOutput: unknown;
  usage: UsageSnapshot;
  estimatedCostUsd: number | null;
  error: string;
};

export type GateResult = {
  ok: boolean;
  failures: string[];
  manualReviewRequired: true;
};

export const EXPECTED_COHORT_COUNTS: Record<ComparisonCohort, number> = {
  normal: 10,
  quotes: 5,
  short: 5,
};

const EDITORIAL_TYPES = new Set(Object.keys(SABQ_TASK_PROMPTS_AR));

function combinedMaterial(sample: Pick<ComparisonSample, "material" | "material2">): string {
  return sample.material2 ? `${sample.material}\n${sample.material2}` : sample.material;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** Validate the deliberately small, private 20-sample input contract. */
export function validateSamples(value: unknown): { samples: ComparisonSample[]; errors: string[] } {
  const errors: string[] = [];
  if (!Array.isArray(value)) {
    return { samples: [], errors: ["samples must be a JSON array"] };
  }

  const samples: ComparisonSample[] = [];
  const ids = new Set<string>();
  const counts: Record<ComparisonCohort, number> = { normal: 0, quotes: 0, short: 0 };

  value.forEach((candidate, index) => {
    const label = `samples[${index}]`;
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      errors.push(`${label} must be an object`);
      return;
    }
    const sample = candidate as Record<string, unknown>;
    const id = sample.id;
    const cohort = sample.cohort;
    const type = sample.type;
    const material = sample.material;
    const material2 = sample.material2;

    if (!isNonEmptyString(id)) errors.push(`${label}.id must be a non-empty string`);
    else if (ids.has(id)) errors.push(`${label}.id must be unique: ${id}`);
    else ids.add(id);

    if (cohort !== "normal" && cohort !== "quotes" && cohort !== "short") {
      errors.push(`${label}.cohort must be normal, quotes, or short`);
    } else {
      counts[cohort] += 1;
    }

    if (typeof type !== "string" || !EDITORIAL_TYPES.has(type)) {
      errors.push(`${label}.type must be an editorial task type`);
    }
    if (!isNonEmptyString(material)) errors.push(`${label}.material must be a non-empty string`);
    if (type === "merge" && !isNonEmptyString(material2)) {
      errors.push(`${label}.material2 is required for merge samples`);
    } else if (material2 !== undefined && typeof material2 !== "string") {
      errors.push(`${label}.material2 must be a string when provided`);
    }
    for (const optional of ["instructions", "verificationContext", "userId"] as const) {
      if (sample[optional] !== undefined && typeof sample[optional] !== "string") {
        errors.push(`${label}.${optional} must be a string when provided`);
      }
    }

    if (typeof cohort === "string" && isNonEmptyString(material)) {
      const text = combinedMaterial({ material, material2: typeof material2 === "string" ? material2 : undefined });
      if (cohort === "quotes" && !text.includes('"')) {
        errors.push(`${label} quotes cohort must contain an ASCII double quote in material`);
      }
      if (cohort === "normal" && text.includes('"')) {
        errors.push(`${label} normal cohort must not contain an ASCII double quote`);
      }
      if (cohort === "short" && text.length > 1000) {
        errors.push(`${label} short cohort material must be at most 1000 characters`);
      }
    }

    if (
      isNonEmptyString(id) &&
      (cohort === "normal" || cohort === "quotes" || cohort === "short") &&
      typeof type === "string" &&
      EDITORIAL_TYPES.has(type) &&
      isNonEmptyString(material) &&
      (type !== "merge" || isNonEmptyString(material2))
    ) {
      // Preserve extra provenance fields (for example sourceUrl/publishedAt) in the private
      // artifact. They are ignored by buildUserMessage but remain available for review.
      samples.push({ ...sample } as unknown as ComparisonSample);
    }
  });

  if (value.length !== 20) errors.push(`exactly 20 samples are required; received ${value.length}`);
  for (const cohort of Object.keys(EXPECTED_COHORT_COUNTS) as ComparisonCohort[]) {
    if (counts[cohort] !== EXPECTED_COHORT_COUNTS[cohort]) {
      errors.push(`${cohort} cohort requires ${EXPECTED_COHORT_COUNTS[cohort]} samples; received ${counts[cohort]}`);
    }
  }

  return { samples, errors };
}

export function isClaudeModel(model: string): boolean {
  return /^claude[-_]/i.test(model.trim());
}

export function parseJsonOutput(rawText: string): { jsonParsed: boolean; parsedOutput: unknown } {
  try {
    return { jsonParsed: true, parsedOutput: JSON.parse(rawText) };
  } catch {
    return { jsonParsed: false, parsedOutput: null };
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** Runtime shape check for the exact unified-editor schema used by the provider call. */
export function isEditorialOutputShape(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const output = value as Record<string, unknown>;
  const keys = Object.keys(output).sort();
  const expected = [
    "altHeadlines",
    "body",
    "editorNotes",
    "enVersion",
    "headline",
    "pushText",
    "riskFlags",
    "sources",
  ].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) return false;
  if (typeof output.headline !== "string" || typeof output.body !== "string") return false;
  if (!isStringArray(output.altHeadlines) || !isStringArray(output.editorNotes)) return false;
  if (typeof output.pushText !== "string" || !isStringArray(output.riskFlags)) return false;
  if (
    !Array.isArray(output.sources) ||
    !output.sources.every((source) => {
      if (!source || typeof source !== "object" || Array.isArray(source)) return false;
      const item = source as Record<string, unknown>;
      return Object.keys(item).sort().join(",") === "title,url" && typeof item.title === "string" && typeof item.url === "string";
    })
  ) {
    return false;
  }
  if (output.enVersion === null) return true;
  if (!output.enVersion || typeof output.enVersion !== "object" || Array.isArray(output.enVersion)) return false;
  const enVersion = output.enVersion as Record<string, unknown>;
  return (
    Object.keys(enVersion).sort().join(",") === "body,headline,pushText" &&
    typeof enVersion.headline === "string" &&
    typeof enVersion.body === "string" &&
    typeof enVersion.pushText === "string"
  );
}

export function usageSnapshot(usage: unknown): UsageSnapshot {
  const value = usage && typeof usage === "object" ? (usage as Record<string, unknown>) : {};
  const numberOrNull = (candidate: unknown): number | null =>
    typeof candidate === "number" && Number.isFinite(candidate) ? candidate : null;
  return {
    inputTokens: numberOrNull(value.input_tokens ?? value.inputTokens),
    outputTokens: numberOrNull(value.output_tokens ?? value.outputTokens),
    cacheReadInputTokens: numberOrNull(value.cache_read_input_tokens ?? value.cacheReadInputTokens),
    cacheCreationInputTokens: numberOrNull(value.cache_creation_input_tokens ?? value.cacheCreationInputTokens),
    raw: usage ?? null,
  };
}

export function estimateCostUsd(usage: UsageSnapshot, prices: PriceConfig): number | null {
  if (!isFiniteNonNegativeNumber(usage.inputTokens) || !isFiniteNonNegativeNumber(usage.outputTokens)) return null;
  if (usage.cacheReadInputTokens !== null && prices.cacheReadUsdPer1M === null) return null;
  if (usage.cacheCreationInputTokens !== null && prices.cacheCreationUsdPer1M === null) return null;
  if (!isFiniteNonNegativeNumber(prices.inputUsdPer1M) || !isFiniteNonNegativeNumber(prices.outputUsdPer1M)) return null;
  const million = 1_000_000;
  return (
    (usage.inputTokens * prices.inputUsdPer1M) / million +
    (usage.outputTokens * prices.outputUsdPer1M) / million +
    ((usage.cacheReadInputTokens ?? 0) * (prices.cacheReadUsdPer1M ?? 0)) / million +
    ((usage.cacheCreationInputTokens ?? 0) * (prices.cacheCreationUsdPer1M ?? 0)) / million
  );
}

export function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function rowSucceeded(row: Pick<ComparisonRow, "jsonParsed" | "validJson" | "schemaValid" | "editorNotesOk" | "completenessOk" | "stopReason">, requireSchema: boolean): boolean {
  return (
    row.jsonParsed &&
    row.validJson &&
    (!requireSchema || row.schemaValid) &&
    row.editorNotesOk &&
    row.completenessOk !== false &&
    row.stopReason !== "max_tokens"
  );
}

export function evaluateGate(rows: ComparisonRow[]): GateResult {
  const failures: string[] = [];
  const byId = new Map<string, Partial<Record<ComparisonMode, ComparisonRow>>>();
  for (const row of rows) {
    const pair = byId.get(row.id) ?? {};
    if (pair[row.mode]) failures.push(`${row.id} has duplicate ${row.mode} result`);
    pair[row.mode] = row;
    byId.set(row.id, pair);
    if (row.mode === "schema") {
      if (!row.jsonParsed || !row.validJson || !row.schemaValid) failures.push(`${row.id} schema output is invalid`);
      if (row.stopReason === "max_tokens") failures.push(`${row.id} schema output was truncated`);
      if (!row.editorNotesOk || row.completenessOk === false) failures.push(`${row.id} schema output is incomplete`);
    }
  }
  for (const [id, pair] of byId) {
    if (!pair["prompt-only"] || !pair.schema) {
      failures.push(`${id} is missing a paired prompt-only or schema result`);
      continue;
    }
    if (rowSucceeded(pair["prompt-only"], false) && !rowSucceeded(pair.schema, true)) {
      failures.push(`${id} schema result is worse than its prompt-only pair`);
    }
  }
  if (rows.length !== 40) failures.push(`exactly 40 result rows are required; received ${rows.length}`);
  return { ok: failures.length === 0, failures, manualReviewRequired: true };
}

export function summarizeRows(rows: ComparisonRow[]) {
  return (["prompt-only", "schema"] as const).map((mode) => {
    const selected = rows.filter((row) => row.mode === mode);
    const guarded = selected.filter((row) => row.completenessOk !== "n/a");
    const costs = selected.map((row) => row.estimatedCostUsd);
    return {
      mode,
      samples: selected.length,
      validJson: selected.filter((row) => row.validJson).length,
      schemaValid: selected.filter((row) => row.schemaValid).length,
      truncated: selected.filter((row) => row.stopReason === "max_tokens").length,
      editorNotes: selected.filter((row) => row.editorNotesOk).length,
      completeness: { passed: guarded.filter((row) => row.completenessOk === true).length, checked: guarded.length },
      success: selected.filter((row) => rowSucceeded(row, mode === "schema")).length,
      avgLatencyMs: Math.round(selected.reduce((sum, row) => sum + row.latencyMs, 0) / Math.max(selected.length, 1)),
      inputTokens: selected.reduce((sum, row) => sum + (row.usage.inputTokens ?? 0), 0),
      outputTokens: selected.reduce((sum, row) => sum + (row.usage.outputTokens ?? 0), 0),
      estimatedCostUsd: costs.every((cost) => cost !== null) ? costs.reduce((sum, cost) => sum + (cost ?? 0), 0) : null,
    };
  });
}
