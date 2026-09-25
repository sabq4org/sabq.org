/**
 * Compare the unified editor on Claude with and without Structured Outputs.
 *
 * Gate for turning CLAUDE_STRUCTURED_OUTPUTS=on in production. Calls the Anthropic API
 * directly (no gateway, no DB writes) with the exact production system prompt, once
 * with the prompt-only JSON path and once with the output schema, and records per sample:
 * stop reason, JSON validity, mandatory editorNotes, the body completeness guard, body
 * length, latency and tokens.
 *
 * Usage:
 *   npx tsx scripts/prompt-audit/compare-structured-outputs.ts samples.json [out-dir]
 *
 * samples.json: [{ "id": "...", "type": "edit", "material": "...", "material2"?: "...",
 *                  "instructions"?: "..." }]
 * Use real newsroom material. Include at least 5 samples whose text contains ASCII
 * double quotes (") inside Arabic sentences: that is the known truncation trigger.
 *
 * Output: <out-dir>/results.csv and a summary on stdout. Accept the switch only if the
 * schema run is never worse on valid JSON, truncation or the completeness guard.
 */
import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";
import {
  EDITORIAL_JSON_SCHEMA,
  buildSystemPrompt,
  buildUserMessage,
  type EditorialTaskInput,
} from "../../server/ai/prompts/editorialRequest";
import { SABQ_PRIMARY_EDITOR_MODEL } from "../../server/ai/sabqEditorialPrompt";
import { assertEditedContentComplete } from "../../server/ai/editorialOutputGuards";

type Mode = "prompt-only" | "schema";
interface Row {
  id: string;
  type: string;
  mode: Mode;
  hasAsciiQuote: boolean;
  stopReason: string;
  validJson: boolean;
  editorNotesOk: boolean;
  completenessOk: boolean | "n/a";
  bodyChars: number;
  latencyMs: number;
  outputTokens: number;
  error: string;
}

const MAX_TOKENS = 12_000;
const TEMPERATURE = 0.3;
const client = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

function stripFences(raw: string): string {
  const t = raw.trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return m ? m[1] : t;
}

async function runOnce(sample: EditorialTaskInput & { id: string }, mode: Mode): Promise<Row> {
  const inputText = `${sample.material}\n${sample.material2 ?? ""}`;
  const row: Row = {
    id: sample.id,
    type: sample.type,
    mode,
    hasAsciiQuote: /"/.test(inputText),
    stopReason: "",
    validJson: false,
    editorNotesOk: false,
    completenessOk: "n/a",
    bodyChars: 0,
    latencyMs: 0,
    outputTokens: 0,
    error: "",
  };
  const started = Date.now();
  try {
    const res = await client.messages.create({
      model: SABQ_PRIMARY_EDITOR_MODEL,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      system: buildSystemPrompt(sample.type),
      messages: [{ role: "user", content: buildUserMessage(sample) }],
      ...(mode === "schema"
        ? { output_config: { format: { type: "json_schema", schema: EDITORIAL_JSON_SCHEMA } } }
        : {}),
    } as Anthropic.MessageCreateParamsNonStreaming);
    row.latencyMs = Date.now() - started;
    row.stopReason = res.stop_reason ?? "";
    row.outputTokens = res.usage.output_tokens;
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const parsed = JSON.parse(stripFences(text));
    row.validJson = typeof parsed === "object" && parsed !== null;
    row.editorNotesOk = Array.isArray(parsed.editorNotes) && parsed.editorNotes.length > 0;
    const body = typeof parsed.body === "string" ? parsed.body : "";
    row.bodyChars = body.length;
    if (sample.type === "edit" || sample.type === "merge") {
      try {
        assertEditedContentComplete(body, inputText);
        row.completenessOk = true;
      } catch (e) {
        row.completenessOk = false;
        row.error = (e as Error).message;
      }
    }
  } catch (e) {
    row.latencyMs = row.latencyMs || Date.now() - started;
    row.error = (e as Error).message;
  }
  return row;
}

function summarize(rows: Row[], mode: Mode) {
  const r = rows.filter((x) => x.mode === mode);
  const pct = (n: number) => `${n}/${r.length}`;
  const guarded = r.filter((x) => x.completenessOk !== "n/a");
  return {
    mode,
    validJson: pct(r.filter((x) => x.validJson).length),
    truncated: pct(r.filter((x) => x.stopReason === "max_tokens").length),
    editorNotes: pct(r.filter((x) => x.editorNotesOk).length),
    completeness: `${guarded.filter((x) => x.completenessOk === true).length}/${guarded.length}`,
    asciiQuoteValid: `${r.filter((x) => x.hasAsciiQuote && x.validJson).length}/${r.filter((x) => x.hasAsciiQuote).length}`,
    avgLatencyMs: Math.round(r.reduce((s, x) => s + x.latencyMs, 0) / Math.max(r.length, 1)),
    avgOutputTokens: Math.round(r.reduce((s, x) => s + x.outputTokens, 0) / Math.max(r.length, 1)),
  };
}

async function main() {
  const [samplesPath, outDir = "outputs/prompt-audit/structured-outputs-run"] = process.argv.slice(2);
  if (!samplesPath) throw new Error("usage: compare-structured-outputs.ts samples.json [out-dir]");
  const samples: Array<EditorialTaskInput & { id: string }> = JSON.parse(fs.readFileSync(samplesPath, "utf8"));
  const rows: Row[] = [];
  for (const s of samples) {
    for (const mode of ["prompt-only", "schema"] as const) {
      const row = await runOnce(s, mode);
      rows.push(row);
      console.log(`${s.id} [${mode}] json=${row.validJson} stop=${row.stopReason} complete=${row.completenessOk} ${row.error}`);
    }
  }
  fs.mkdirSync(outDir, { recursive: true });
  const header = Object.keys(rows[0] ?? {}) as Array<keyof Row>;
  const csv = [header.join(","), ...rows.map((r) => header.map((k) => JSON.stringify(r[k] ?? "")).join(","))].join("\n");
  fs.writeFileSync(path.join(outDir, "results.csv"), csv);
  console.table([summarize(rows, "prompt-only"), summarize(rows, "schema")]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
