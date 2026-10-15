// Claude Structured Outputs behind a kill switch.
//
// Structured Outputs make Claude return JSON that matches a schema, replacing prompt-only
// "return JSON only" instructions and regex extraction. The API supports it, but SDK 0.68
// has no types for `output_config`, so call sites spread this helper into the request.
//
// Off by default: this repo has linked output_config to silent truncation when Arabic text
// contains ASCII double quotes. Enable with CLAUDE_STRUCTURED_OUTPUTS=on only after the
// comparison script (scripts/prompt-audit/compare-structured-outputs.ts) shows no regression.

export type JsonSchema = Record<string, unknown>;

export function claudeStructuredOutputsEnabled(): boolean {
  return process.env.CLAUDE_STRUCTURED_OUTPUTS === "on";
}

/**
 * Request fields that make Claude return JSON matching `schema`, or nothing when the
 * kill switch is off. Spread into `messages.create({...})` (cast the params `as any`).
 */
export function claudeJsonOutput(schema: JsonSchema): { output_config?: unknown } {
  if (!claudeStructuredOutputsEnabled()) return {};
  return { output_config: { format: { type: "json_schema", schema } } };
}
