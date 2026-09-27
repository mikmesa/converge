import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  buildExplanationInput,
  type ExplanationInput,
  type ExplanationPayload,
} from "../domain/explanation";
import { getResults } from "./decision-service";
import { getSql } from "./db";

/**
 * AI EXPLANATION LAYER (§23, §24, §40.6).
 *
 * - Input: ONLY buildExplanationInput(sanitized result). No budgets, notes or
 *   response history ever reach the model.
 * - The model does not score, rank, decide or infer anything; it rephrases
 *   facts the deterministic engine already produced.
 * - Output is schema-validated and content-checked; anything suspicious is
 *   discarded and the UI keeps the deterministic explanation.
 * - Failure, timeout or a missing key never blocks results or voting: this
 *   runs on its own request after results render, with one attempt and a
 *   hard timeout.
 */

export const AI_TIMEOUT_MS = 15_000;
const DEFAULT_MODEL = "claude-opus-5";

const SYSTEM_PROMPT = `You write short, plain-English explanations for a group trip decision tool.

You receive the output of a deterministic engine: for each candidate destination, how well it fits each person, as categories only. You restate those facts in natural language. You are not the decision-maker.

Meaning of the fields:
- tier: "strong" (everything they specified fits), "compromise" (exactly one thing doesn't fully fit), "conflict" (two or more things don't fully fit), "insufficient" (they gave too little input to evaluate).
- cost: "within_budget", "stretch" (above their ideal budget but within their maximum), "over_budget", or "unknown" (not provided).
- type: "met" (a destination type they prefer), "partial" (neither preferred nor avoided), "unmet" (a type they'd rather avoid), or "unknown".
- dates: "met" (their dates fit the destination's season), "partial" (only some overlap), "unmet" (no overlap), or "unknown".
- wanted_activities_available / avoided_activities_present: context only. Activities did NOT affect the ranking.

Rules:
- Only state facts present in the input. Never invent preferences, reasons, conflicts, constraints or scores.
- Never mention money amounts, percentages, scores or ratings. Say "stretching on budget", never a number.
- Do not say why an option ranked higher or lower, and do not recommend one. If you mention activities, present them as context (e.g. "Riya would enjoy the water sports there"), never as a reason for the ranking.
- Unknown values mean "not provided" — do not guess them.
- One to three sentences per option, warm but neutral. Use people's names as given.`;

const OutputSchema = z.object({
  explanations: z
    .array(z.object({ option_id: z.string(), text: z.string().min(1).max(600) }))
    .max(3),
});

const OUTPUT_JSON_SCHEMA = {
  type: "object",
  properties: {
    explanations: {
      type: "array",
      items: {
        type: "object",
        properties: { option_id: { type: "string" }, text: { type: "string" } },
        required: ["option_id", "text"],
        additionalProperties: false,
      },
    },
  },
  required: ["explanations"],
  additionalProperties: false,
} as const;

/**
 * Rejects prose that smuggles in precision or claims the engine never made.
 * Single digits are allowed (tier counts ≤ 8); anything else numeric is not.
 */
export function isAcceptableExplanation(text: string): boolean {
  if (/[₹$€£%]/.test(text)) return false;
  if (/\d{2,}/.test(text)) return false;
  if (/\b(score|scored|rating|points?|\/\s*10|confidence)\b/i.test(text)) return false;
  if (/\b(ranked|ranks|ranking) (higher|lower|first|top)\b.*\bbecause\b/i.test(text)) return false;
  return true;
}

export function validateExplanationOutput(
  input: ExplanationInput,
  raw: unknown,
): Record<string, string> | null {
  const parsed = OutputSchema.safeParse(raw);
  if (!parsed.success) return null;
  const expected = new Set(input.options.map((o) => o.option_id));
  const out: Record<string, string> = {};
  for (const e of parsed.data.explanations) {
    if (!expected.has(e.option_id) || out[e.option_id]) return null;
    if (!isAcceptableExplanation(e.text)) return null;
    out[e.option_id] = e.text.trim();
  }
  if (Object.keys(out).length !== expected.size) return null;
  return out;
}

function hashInput(model: string, input: ExplanationInput): string {
  return createHash("sha256").update(model).update(JSON.stringify(input)).digest("hex");
}

async function callModel(model: string, input: ExplanationInput): Promise<unknown> {
  const client = new Anthropic({ timeout: AI_TIMEOUT_MS, maxRetries: 0 });
  const response = await client.beta.messages.create({
    model,
    max_tokens: 2000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM_PROMPT,
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: OUTPUT_JSON_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: `Engine output (JSON):\n${JSON.stringify(input)}\n\nWrite one explanation per option_id.`,
      },
    ],
  });
  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") return null;
  const text = response.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
  return JSON.parse(text);
}

export async function getExplanation(
  decisionId: string,
  userId: string,
): Promise<ExplanationPayload> {
  // Authorization + sanitization happen inside getResults().
  const result = await getResults(decisionId, userId);
  const input = buildExplanationInput(result);
  if (input.options.length === 0) return { status: "ok", explanations: {} };

  if (!process.env.ANTHROPIC_API_KEY) return { status: "unavailable", explanations: {} };
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const hash = hashInput(model, input);
  const sql = getSql();

  const cached = await sql<{ content: Record<string, string> }[]>`
    select content from public.explanation_cache
    where decision_id = ${decisionId} and input_hash = ${hash}`;
  if (cached[0]) return { status: "ok", explanations: cached[0].content };

  try {
    const raw = await callModel(model, input);
    const explanations = validateExplanationOutput(input, raw);
    if (!explanations) return { status: "unavailable", explanations: {} };
    await sql`
      insert into public.explanation_cache (decision_id, input_hash, content)
      values (${decisionId}, ${hash}, ${sql.json(explanations)})
      on conflict do nothing`;
    return { status: "ok", explanations };
  } catch (err) {
    console.warn("[converge] explanation unavailable:", (err as Error).message);
    return { status: "unavailable", explanations: {} };
  }
}
