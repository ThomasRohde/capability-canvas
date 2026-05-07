import { z } from "zod";
import { error, type Diagnostic } from "../validation/diagnostics";

export const PROMPT_MERGE_SCHEMA = "capability-canvas.prompt-merge";
export const PROMPT_MERGE_VERSION = "1.0";

const nonEmptyString = z.string().trim().min(1);

export const PromptMergeCapabilitySchema = z
  .object({
    id: nonEmptyString.optional(),
    name: nonEmptyString,
    parentId: nonEmptyString.optional(),
    description: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export const PromptMergePayloadSchema = z
  .object({
    schema: z.literal(PROMPT_MERGE_SCHEMA),
    version: z.literal(PROMPT_MERGE_VERSION),
    targetId: nonEmptyString,
    capabilities: z.array(PromptMergeCapabilitySchema).min(1),
  })
  .passthrough();

export type PromptMergeCapability = z.infer<
  typeof PromptMergeCapabilitySchema
>;
export type PromptMergePayload = z.infer<typeof PromptMergePayloadSchema>;

export interface PromptMergeParseResult {
  payload: PromptMergePayload | null;
  diagnostics: Diagnostic[];
}

export function isPromptMergePayloadShape(
  input: unknown,
): input is { schema: typeof PROMPT_MERGE_SCHEMA } {
  return isRecord(input) && input.schema === PROMPT_MERGE_SCHEMA;
}

export function parsePromptMergePayload(
  input: unknown,
): PromptMergeParseResult {
  const parsed = PromptMergePayloadSchema.safeParse(input);
  if (parsed.success) return { payload: parsed.data, diagnostics: [] };
  return {
    payload: null,
    diagnostics: parsed.error.issues.map((issue) =>
      error(
        "prompt-merge-invalid",
        `${issue.path.join(".") || "payload"}: ${issue.message}`,
      ),
    ),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
