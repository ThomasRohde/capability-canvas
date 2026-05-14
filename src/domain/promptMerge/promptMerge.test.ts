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

    expect(prompt).toContain("# Goal");
    expect(prompt).toContain("Create 5 direct child capabilities");
    expect(prompt).toContain("# Success criteria");
    expect(prompt).toContain(`"${PROMPT_MERGE_SCHEMA}"`);
    expect(prompt).toContain(`"${PROMPT_MERGE_VERSION}"`);
    expect(prompt).toContain('"targetId": "digital-onboarding"');
  });

  it("builds a non-leaf prompt with merge instructions and subtree context", () => {
    const prompt = buildBcmPrompt(createSampleDocument(), "customer");

    expect(prompt).toContain("Create or refine 5 direct child capabilities");
    expect(prompt).toContain("existingSelectedSubtree");
    expect(prompt).toContain('"id": "channels"');
    expect(prompt).toContain('"id": "digital-onboarding"');
  });

  it("supports a custom direct capability count", () => {
    const prompt = buildBcmPrompt(createSampleDocument(), "risk", {
      childCount: 8,
    });

    expect(prompt).toContain("Create or refine 8 direct child capabilities");
    expect(prompt).toContain(
      'Return exactly 8 direct child capabilities for targetId "risk".',
    );
  });

  it("requires fenced json output only", () => {
    const prompt = buildBcmPrompt(createSampleDocument(), "risk");

    expect(prompt).toContain(
      "Return exactly one Markdown fenced code block using json, and no text outside the fence.",
    );
    expect(prompt).toContain(
      "The code block content must be a JSON object shaped like this:",
    );
    expect(prompt).toContain("```json");
  });

  it("discourages repetitive ability-based descriptions", () => {
    const prompt = buildBcmPrompt(createSampleDocument(), "risk");

    expect(prompt).toContain(
      'Capabilities already imply ability; do not begin descriptions with "The ability to", "Ability to", or similarly repetitive boilerplate.',
    );
    expect(prompt).toContain("Use concise, varied descriptions");
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
