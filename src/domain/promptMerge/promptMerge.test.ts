import { describe, expect, it } from "vitest";
import { createSampleDocument } from "../fixtures/sample";
import { buildBcmPrompt } from "./bcmPrompt";
import {
  parsePromptMergePayload,
  PROMPT_MERGE_SCHEMA,
  PROMPT_MERGE_VERSION,
} from "./payload";

describe("BCM prompt merge contract", () => {
  it("builds a leaf prompt with child-creation instructions and schema", () => {
    const prompt = buildBcmPrompt(createSampleDocument(), "digital-onboarding");

    expect(prompt).toContain(
      "create child capabilities under the selected leaf capability",
    );
    expect(prompt).toContain(`"${PROMPT_MERGE_SCHEMA}"`);
    expect(prompt).toContain(`"${PROMPT_MERGE_VERSION}"`);
    expect(prompt).toContain('"targetId": "digital-onboarding"');
    expect(prompt).toContain("```json");
  });

  it("builds a non-leaf prompt with merge instructions and subtree context", () => {
    const prompt = buildBcmPrompt(createSampleDocument(), "customer");

    expect(prompt).toContain("merge generated children with existing children");
    expect(prompt).toContain("existingSelectedSubtree");
    expect(prompt).toContain('"id": "channels"');
    expect(prompt).toContain('"id": "digital-onboarding"');
  });

  it("requires fenced json output only", () => {
    const prompt = buildBcmPrompt(createSampleDocument(), "risk");

    expect(prompt).toContain(
      "Return exactly one Markdown fenced code block using json, and no text outside the fence.",
    );
    expect(prompt).toContain("The code block content must be a JSON object");
  });

  it("discourages repetitive ability-based descriptions", () => {
    const prompt = buildBcmPrompt(createSampleDocument(), "risk");

    expect(prompt).toContain(
      'Capabilities already imply ability; do not begin descriptions with "The ability to", "Ability to", or similarly repetitive boilerplate.',
    );
    expect(prompt).toContain("Vary description phrasing across siblings");
  });

  it("reports invalid prompt merge payloads", () => {
    const parsed = parsePromptMergePayload({
      schema: PROMPT_MERGE_SCHEMA,
      version: PROMPT_MERGE_VERSION,
      targetId: "",
      capabilities: [],
    });

    expect(parsed.payload).toBeNull();
    expect(
      parsed.diagnostics.some(
        (diagnostic) => diagnostic.code === "prompt-merge-invalid",
      ),
    ).toBe(true);
  });
});
