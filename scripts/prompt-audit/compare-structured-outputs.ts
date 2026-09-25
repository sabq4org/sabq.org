/**
 * Compare the unified editor on Claude with and without Structured Outputs.
 *
 * This is a local, private evaluation artifact. It never writes to the database and never
 * turns CLAUDE_STRUCTURED_OUTPUTS on. The input must contain exactly 20 newsroom samples:
 * 10 normal, 5 with ASCII double quotes, and 5 short. The script exits non-zero when the
 * schema arm has an invalid/truncated/incomplete result or loses a successful pair.
 *
 * Usage:
 *   npx tsx scripts/prompt-audit/compare-structured-outputs.ts samples.json [out-dir]
 *     [--input-price-usd-per-1m=NUMBER --output-price-usd-per-1m=NUMBER]
 *     [--cache-read-price-usd-per-1m=NUMBER --cache-creation-price-usd-per-1m=NUMBER]
 *
 * Prices are optional. Without explicit prices, estimatedCostUsd remains null. Even with a
 * passing automated gate, a human must review factual accuracy, editorial length, and cost;
 * this script never approves the production flag automatically.
 */
import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";
import {
  EDITORIAL_JSON_SCHEMA,
  buildSystemPrompt,
  buildUserMessage,
} from "../../server/ai/prompts/editorialRequest";
import { SABQ_PRIMARY_EDITOR_MODEL } from "../../server/ai/sabqEditorialPrompt";
import { assertEditedContentComplete } from "../../server/ai/editorialOutputGuards";
import {
  type ComparisonMode,
  type ComparisonRow,
  type ComparisonSample,
  type PriceConfig,
  csvEscape,
  estimateCostUsd,
  evaluateGate,
  isClaudeModel,
  isEditorialOutputShape,
  parseJsonOutput,
  summarizeRows,
  usageSnapshot,
  validateSamples,
} from "./structuredOutputsComparison";

const MAX_TOKENS = 12_000;
const TEMPERATURE = 0.3;

const client = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
  timeout: 120_000,
  maxRetries: 0,
});

function stripFences(raw: string): string {
  const t = raw.trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return m ? m[1] : t;
}

function parsePriceArgs(args: string[]): PriceConfig {
  const values: Record<keyof PriceConfig, number | null> = {
    inputUsdPer1M: null,
    outputUsdPer1M: null,
    cacheReadUsdPer1M: null,
    cacheCreationUsdPer1M: null,
  };
  const flags: Record<string, keyof PriceConfig> = {
    "--input-price-usd-per-1m": "inputUsdPer1M",
    "--output-price-usd-per-1m": "outputUsdPer1M",
    "--cache-read-price-usd-per-1m": "cacheReadUsdPer1M",
    "--cache-creation-price-usd-per-1m": "cacheCreationUsdPer1M",
  };
  for (const arg of args) {
    const [flag, raw] = arg.split("=", 2);
    if (!(flag in flags) || raw === undefined) throw new Error(`invalid price argument: ${arg}`);
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`price must be a non-negative number: ${arg}`);
    values[flags[flag]] = parsed;
  }
  return values;
}

async function runOnce(sample: ComparisonSample, mode: ComparisonMode, prices: PriceConfig): Promise<ComparisonRow> {
  const inputText = `${sample.material}\n${sample.material2 ?? ""}`;
  const started = new Date();
  const row: ComparisonRow = {
    id: sample.id,
    cohort: sample.cohort,
    type: sample.type,
    mode,
    source: sample,
    startedAt: started.toISOString(),
    finishedAt: started.toISOString(),
    latencyMs: 0,
    hasAsciiQuote: /"/.test(inputText),
    stopReason: "",
    jsonParsed: false,
    validJson: false,
    schemaValid: false,
    editorNotesOk: false,
    completenessOk: "n/a",
    bodyChars: 0,
    rawText: "",
    parsedOutput: null,
    usage: usageSnapshot(null),
    estimatedCostUsd: null,
    error: "",
  };

  try {
    const response = await client.messages.create({
      model: SABQ_PRIMARY_EDITOR_MODEL,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      system: buildSystemPrompt(sample.type),
      messages: [{ role: "user", content: buildUserMessage(sample) }],
      ...(mode === "schema"
        ? { output_config: { format: { type: "json_schema", schema: EDITORIAL_JSON_SCHEMA } } }
        : {}),
    } as Anthropic.MessageCreateParamsNonStreaming);
    row.stopReason = response.stop_reason ?? "";
    row.usage = usageSnapshot(response.usage);
    row.estimatedCostUsd = estimateCostUsd(row.usage, prices);
    row.rawText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
    const parsed = parseJsonOutput(stripFences(row.rawText));
    row.jsonParsed = parsed.jsonParsed;
    row.parsedOutput = parsed.parsedOutput;
    row.validJson = parsed.jsonParsed && typeof parsed.parsedOutput === "object" && parsed.parsedOutput !== null && !Array.isArray(parsed.parsedOutput);
    row.schemaValid = row.validJson && isEditorialOutputShape(parsed.parsedOutput);
    if (row.validJson) {
      const output = parsed.parsedOutput as Record<string, unknown>;
      row.editorNotesOk = Array.isArray(output.editorNotes) && output.editorNotes.length > 0 && output.editorNotes.every((note) => typeof note === "string");
      const body = typeof output.body === "string" ? output.body : "";
      row.bodyChars = body.length;
      if (sample.type === "edit" || sample.type === "merge") {
        try {
          assertEditedContentComplete(body, inputText);
          row.completenessOk = true;
        } catch (error) {
          row.completenessOk = false;
          row.error = (error as Error).message;
        }
      }
    }
  } catch (error) {
    row.error = error instanceof Error ? error.message : String(error);
  } finally {
    const finished = new Date();
    row.finishedAt = finished.toISOString();
    row.latencyMs = finished.getTime() - started.getTime();
  }
  return row;
}

function writeArtifacts(outDir: string, rows: ComparisonRow[], summary: unknown): void {
  fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(outDir, 0o700);
  // results.json deliberately contains the submitted material and raw model output. Keep it
  // local/private so newsroom material is never printed or committed accidentally.
  fs.writeFileSync(path.join(outDir, "results.json"), JSON.stringify(rows, null, 2), { mode: 0o600 });

  const columns = [
    "id", "cohort", "type", "mode", "startedAt", "finishedAt", "latencyMs", "hasAsciiQuote",
    "stopReason", "jsonParsed", "validJson", "schemaValid", "editorNotesOk", "completenessOk",
    "bodyChars", "inputTokens", "outputTokens", "cacheReadInputTokens", "cacheCreationInputTokens",
    "estimatedCostUsd", "error", "rawText", "parsedOutputJson",
  ] as const;
  const csvRows = [columns.join(",")];
  for (const row of rows) {
    const values: Record<(typeof columns)[number], unknown> = {
      id: row.id,
      cohort: row.cohort,
      type: row.type,
      mode: row.mode,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      latencyMs: row.latencyMs,
      hasAsciiQuote: row.hasAsciiQuote,
      stopReason: row.stopReason,
      jsonParsed: row.jsonParsed,
      validJson: row.validJson,
      schemaValid: row.schemaValid,
      editorNotesOk: row.editorNotesOk,
      completenessOk: row.completenessOk,
      bodyChars: row.bodyChars,
      inputTokens: row.usage.inputTokens,
      outputTokens: row.usage.outputTokens,
      cacheReadInputTokens: row.usage.cacheReadInputTokens,
      cacheCreationInputTokens: row.usage.cacheCreationInputTokens,
      estimatedCostUsd: row.estimatedCostUsd,
      error: row.error,
      rawText: row.rawText,
      parsedOutputJson: row.parsedOutput === null ? "" : JSON.stringify(row.parsedOutput),
    };
    csvRows.push(columns.map((column) => csvEscape(values[column])).join(","));
  }
  fs.writeFileSync(path.join(outDir, "results.csv"), `${csvRows.join("\n")}\n`, { mode: 0o600 });
  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2), { mode: 0o600 });
}

async function main(): Promise<void> {
  const [samplesPath, outDir = "outputs/prompt-audit/structured-outputs-run", ...priceArgs] = process.argv.slice(2);
  if (!samplesPath) throw new Error("usage: compare-structured-outputs.ts samples.json [out-dir] [price flags]");
  if (!isClaudeModel(SABQ_PRIMARY_EDITOR_MODEL)) {
    throw new Error(`SABQ_PRIMARY_EDITOR_MODEL must be a Claude model for this comparison: ${SABQ_PRIMARY_EDITOR_MODEL}`);
  }
  const prices = parsePriceArgs(priceArgs);
  const input = JSON.parse(fs.readFileSync(samplesPath, "utf8")) as unknown;
  const validation = validateSamples(input);
  if (validation.errors.length > 0) {
    throw new Error(`invalid comparison dataset; no provider calls made:\n- ${validation.errors.join("\n- ")}`);
  }

  const rows: ComparisonRow[] = [];
  for (const sample of validation.samples) {
    for (const mode of ["prompt-only", "schema"] as const) {
      const row = await runOnce(sample, mode, prices);
      rows.push(row);
      // Persist after every paid provider call so an interruption does not lose completed
      // evidence. A later run can inspect this checkpoint; this script intentionally does
      // not auto-resume or replay prior calls.
      writeArtifacts(outDir, rows, {
        checkpoint: true,
        model: SABQ_PRIMARY_EDITOR_MODEL,
        rowsCompleted: rows.length,
        prices,
        modes: summarizeRows(rows),
        gate: evaluateGate(rows),
      });
      console.log(`${row.id} [${mode}] json=${row.validJson} schema=${row.schemaValid} stop=${row.stopReason} complete=${row.completenessOk}`);
    }
  }

  const gate = evaluateGate(rows);
  const summary = {
    model: SABQ_PRIMARY_EDITOR_MODEL,
    maxTokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    prices,
    modes: summarizeRows(rows),
    gate,
    manualReviewRequired: [
      "Review factual accuracy against the submitted source for all 20 paired outputs.",
      "Review editorial length and quality, including Arabic quote handling.",
      "Review provider billing using explicit pricing and the usage artifact; estimated cost is null when prices or cache rates are missing.",
      "A passing gate never enables CLAUDE_STRUCTURED_OUTPUTS automatically.",
    ],
  };
  writeArtifacts(outDir, rows, summary);
  console.log(JSON.stringify({ gate, modes: summarizeRows(rows), artifactDir: outDir }, null, 2));
  if (!gate.ok) {
    throw new Error(`comparison gate failed; see ${path.join(outDir, "summary.json")}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
