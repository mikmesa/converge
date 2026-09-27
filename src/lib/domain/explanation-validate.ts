import { z } from "zod";
import type { ExplanationInput } from "./explanation";

/** Validation of AI explanation output (pure; unit tested). */

const OutputSchema = z.object({
  explanations: z
    .array(z.object({ option_id: z.string(), text: z.string().min(1).max(600) }))
    .max(3),
});

export const OUTPUT_JSON_SCHEMA = {
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

