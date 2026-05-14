import { describe, expect, it } from "vitest";
import { createNode } from "../document/defaults";
import { createSampleDocument } from "../fixtures/sample";
import { evaluateCanvasLayoutIntent } from "./canvasLayoutPolicy";

describe("canvas layout action policy", () => {
  it("enables the arranging parent for direct child movement in automatic modes", () => {
    const doc = createSampleDocument();
    doc.settings.layoutMode = "adaptive";

    const result = evaluateCanvasLayoutIntent({
      doc,
      action: "move",
      rootNodeIds: ["digital-onboarding"],
    });

    expect(result.allowed).toBe(true);
    expect(result.manualParentIdsToEnable).toEqual(["digital"]);
    expect(result.diagnosticCode).toBe("manual-positioning-enabled-by-move");
    expect(result.skipAutoRelayout).toBe(true);
  });

  it("does not enable Manual again when the parent is already Manual", () => {
    const doc = createSampleDocument();
    doc.settings.layoutMode = "uniform";
    doc.nodesById.digital = {
      ...doc.nodesById.digital!,
      isManualPositioningEnabled: true,
    };

    const result = evaluateCanvasLayoutIntent({
      doc,
      action: "keyboard-nudge",
      rootNodeIds: ["digital-onboarding"],
    });

    expect(result.allowed).toBe(true);
    expect(result.manualParentIdsToEnable).toEqual([]);
    expect(result.diagnosticCode).toBeUndefined();
  });

  it("does not enable Manual in Freeform mode", () => {
    const doc = createSampleDocument();
    doc.settings.layoutMode = "free";

    const result = evaluateCanvasLayoutIntent({
      doc,
      action: "numeric-position",
      rootNodeIds: ["digital-onboarding"],
    });

    expect(result.allowed).toBe(true);
    expect(result.manualParentIdsToEnable).toEqual([]);
    expect(result.skipAutoRelayout).toBe(true);
  });

  it("does not enable Manual when the arranging parent is already locked", () => {
    const doc = createSampleDocument();
    doc.settings.layoutMode = "balanced";
    doc.nodesById.digital = {
      ...doc.nodesById.digital!,
      isLockedAsIs: true,
    };

    const result = evaluateCanvasLayoutIntent({
      doc,
      action: "move",
      rootNodeIds: ["digital-onboarding"],
    });

    expect(result.allowed).toBe(true);
    expect(result.manualParentIdsToEnable).toEqual([]);
  });

  it("does not set Manual for root movement", () => {
    const result = evaluateCanvasLayoutIntent({
      doc: createSampleDocument(),
      action: "move",
      rootNodeIds: ["retail-banking"],
    });

    expect(result.allowed).toBe(true);
    expect(result.manualParentIdsToEnable).toEqual([]);
  });

  it("uses only selected movement roots, not their descendants, for Manual scope", () => {
    const result = evaluateCanvasLayoutIntent({
      doc: createSampleDocument(),
      action: "move",
      rootNodeIds: ["operations"],
    });

    expect(result.allowed).toBe(true);
    expect(result.manualParentIdsToEnable).toEqual(["retail-banking"]);
  });

  it("deduplicates the shared arranging parent for sibling multi-select movement", () => {
    const result = evaluateCanvasLayoutIntent({
      doc: createSampleDocument(),
      action: "keyboard-nudge",
      rootNodeIds: ["credit-risk", "fraud-risk", "operational-risk"],
    });

    expect(result.allowed).toBe(true);
    expect(result.manualParentIdsToEnable).toEqual(["risk"]);
  });

  it("rejects mixed-parent movement selections", () => {
    const result = evaluateCanvasLayoutIntent({
      doc: createSampleDocument(),
      action: "move",
      rootNodeIds: ["credit-risk", "process-management"],
    });

    expect(result.allowed).toBe(false);
    expect(result.diagnosticCode).toBe("invalid-selection");
  });

  it("enables the destination parent for drag reparenting in automatic modes", () => {
    const result = evaluateCanvasLayoutIntent({
      doc: createSampleDocument(),
      action: "reparent",
      rootNodeIds: ["fraud-risk"],
      targetParentId: "operations",
    });

    expect(result.allowed).toBe(true);
    expect(result.manualParentIdsToEnable).toEqual(["operations"]);
    expect(result.diagnosticCode).toBe(
      "manual-positioning-enabled-by-reparent",
    );
  });

  it("rejects text-label drop targets", () => {
    const doc = createSampleDocument();
    doc.nodesById.note = createNode({
      id: "note",
      label: "Note",
      type: "text",
      isTextLabel: true,
      parentId: "risk",
    });
    doc.childrenByParentId.risk = [...doc.childrenByParentId.risk!, "note"];
    doc.childrenByParentId.note = [];

    const result = evaluateCanvasLayoutIntent({
      doc,
      action: "reparent",
      rootNodeIds: ["fraud-risk"],
      targetParentId: "note",
    });

    expect(result.allowed).toBe(false);
    expect(result.diagnosticCode).toBe("text-label-parent");
  });

  it("rejects cycle-creating drag reparenting", () => {
    const result = evaluateCanvasLayoutIntent({
      doc: createSampleDocument(),
      action: "reparent",
      rootNodeIds: ["customer"],
      targetParentId: "digital-onboarding",
    });

    expect(result.allowed).toBe(false);
    expect(result.diagnosticCode).toBe("cycle");
  });

  it("requests relayout for Add child under automatic parents", () => {
    const result = evaluateCanvasLayoutIntent({
      doc: createSampleDocument(),
      action: "add-child",
      rootNodeIds: ["risk"],
    });

    expect(result.allowed).toBe(true);
    expect(result.requestAutoRelayout).toBe(true);
    expect(result.skipAutoRelayout).toBe(false);
  });

  it("skips relayout for Add child under Manual parents", () => {
    const doc = createSampleDocument();
    doc.nodesById.risk = {
      ...doc.nodesById.risk!,
      isManualPositioningEnabled: true,
    };

    const result = evaluateCanvasLayoutIntent({
      doc,
      action: "add-child",
      rootNodeIds: ["risk"],
    });

    expect(result.allowed).toBe(true);
    expect(result.requestAutoRelayout).toBe(false);
    expect(result.skipAutoRelayout).toBe(true);
  });
});
