import { describe, expect, it } from "vitest";
import {
  type ComparisonRow,
  type ComparisonSample,
  csvEscape,
  estimateCostUsd,
  evaluateGate,
  isClaudeModel,
  isEditorialOutputShape,
  usageSnapshot,
  validateSamples,
} from "../../scripts/prompt-audit/structuredOutputsComparison";

function makeSample(index: number, cohort: ComparisonSample["cohort"]): ComparisonSample {
  return {
    id: `${cohort}-${index}`,
    cohort,
    type: "edit",
    material:
      cohort === "quotes"
        ? `أعلنت الجهة أن المؤشر ارتفع إلى 24%، وقالت: "النتائج مستقرة" خلال الفترة الحالية.`
        : cohort === "short"
          ? "خبر قصير عن فعالية محلية ومعلومة مؤكدة."
          : `مادة تحريرية مطولة ${index} تتضمن تفاصيل الجهة والتاريخ والمكان والأرقام المعلنة، مع سياق واضح يساعد المحرر على مراجعة الخبر قبل النشر.`,
    ...(index === 0 && cohort === "normal" ? { sourceUrl: "https://example.com/news", publishedAt: "2026-09-25" } : {}),
  };
}

function validSamples(): ComparisonSample[] {
  return [
    ...Array.from({ length: 10 }, (_, index) => makeSample(index, "normal")),
    ...Array.from({ length: 5 }, (_, index) => makeSample(index, "quotes")),
    ...Array.from({ length: 5 }, (_, index) => makeSample(index, "short")),
  ];
}

const output = {
  headline: "عنوان",
  altHeadlines: ["عنوان بديل"],
  body: "",
  editorNotes: ["مراجعة"],
  sources: [],
  pushText: "",
  enVersion: null,
  riskFlags: [],
};

function row(sample: ComparisonSample, mode: "prompt-only" | "schema", overrides: Partial<ComparisonRow> = {}): ComparisonRow {
  return {
    id: sample.id,
    cohort: sample.cohort,
    type: sample.type,
    mode,
    source: sample,
    startedAt: "2026-09-25T00:00:00.000Z",
    finishedAt: "2026-09-25T00:00:00.001Z",
    latencyMs: 1,
    hasAsciiQuote: sample.cohort === "quotes",
    stopReason: "end_turn",
    jsonParsed: true,
    validJson: true,
    schemaValid: true,
    editorNotesOk: true,
    completenessOk: "n/a",
    bodyChars: 0,
    rawText: JSON.stringify(output),
    parsedOutput: output,
    usage: usageSnapshot({ input_tokens: 10, output_tokens: 20 }),
    estimatedCostUsd: null,
    error: "",
    ...overrides,
  };
}

describe("structured output comparison helpers", () => {
  it("requires the exact 20-sample cohort contract and preserves provenance", () => {
    const result = validateSamples(validSamples());
    expect(result.errors).toEqual([]);
    expect(result.samples).toHaveLength(20);
    expect(result.samples[0]).toMatchObject({ sourceUrl: "https://example.com/news", publishedAt: "2026-09-25" });

    const invalid = validateSamples(validSamples().slice(0, 19));
    expect(invalid.errors.some((error) => error.includes("exactly 20"))).toBe(true);
  });

  it("rejects invalid task/material/merge and quote cohort inputs", () => {
    const samples = validSamples();
    samples[0] = { ...samples[0], type: "unknown" as ComparisonSample["type"] };
    samples[1] = { ...samples[1], material: "", material2: undefined };
    samples[10] = { ...samples[10], material: "بدون اقتباس" };
    const result = validateSamples(samples);
    expect(result.errors.join("\n")).toMatch(/type must be an editorial task type/);
    expect(result.errors.join("\n")).toMatch(/material must be a non-empty string/);
    expect(result.errors.join("\n")).toMatch(/quotes cohort/);

    const merge = validateSamples(validSamples().map((sample, index) => index === 0 ? { ...sample, type: "merge" } : sample));
    expect(merge.errors.some((error) => error.includes("material2 is required"))).toBe(true);
  });

  it("enforces the documented 1000-character short-material boundary", () => {
    const accepted = validSamples();
    accepted[15] = { ...accepted[15], material: "ا".repeat(1000) };
    expect(validateSamples(accepted).errors).toEqual([]);

    const rejected = validSamples();
    rejected[15] = { ...rejected[15], material: "ا".repeat(1001) };
    expect(validateSamples(rejected).errors.join("\n")).toMatch(/at most 1000 characters/);
  });

  it("checks Claude model identity, shape, cost nullability, and CSV escaping", () => {
    expect(isClaudeModel("claude-sonnet-4-6")).toBe(true);
    expect(isClaudeModel("gpt-5.1")).toBe(false);
    expect(isEditorialOutputShape(output)).toBe(true);
    expect(isEditorialOutputShape({ ...output, extra: true })).toBe(false);
    const usage = usageSnapshot({ input_tokens: 100, output_tokens: 200, cache_read_input_tokens: 50 });
    expect(estimateCostUsd(usage, {
      inputUsdPer1M: null,
      outputUsdPer1M: null,
      cacheReadUsdPer1M: null,
      cacheCreationUsdPer1M: null,
    })).toBeNull();
    expect(estimateCostUsd(usage, {
      inputUsdPer1M: 1,
      outputUsdPer1M: 2,
      cacheReadUsdPer1M: 0.5,
      cacheCreationUsdPer1M: 0,
    })).toBe(0.000525);
    expect(csvEscape('a,"b"\nc')).toBe('"a,""b""\nc"');
  });

  it("fails the gate for schema defects and a worse paired success", () => {
    const samples = validSamples();
    const passingRows = samples.flatMap((sample) => [row(sample, "prompt-only"), row(sample, "schema")]);
    expect(evaluateGate(passingRows)).toMatchObject({ ok: true, manualReviewRequired: true });

    const failedRows = passingRows.map((item) =>
      item.id === "normal-0" && item.mode === "schema"
        ? { ...item, schemaValid: false, stopReason: "max_tokens", completenessOk: false }
        : item,
    );
    const gate = evaluateGate(failedRows);
    expect(gate.ok).toBe(false);
    expect(gate.failures.join("\n")).toMatch(/normal-0/);
    expect(gate.failures.join("\n")).toMatch(/invalid|truncated|incomplete/);
  });
});
