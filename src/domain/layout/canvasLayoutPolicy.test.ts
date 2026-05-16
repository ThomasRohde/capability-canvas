import { describe, expect, it } from "vitest";
import { createNode } from "../document/defaults";
import { createSampleDocument } from "../fixtures/sample";
import {
  AUTOMATIC_LAYOUT_GEOMETRY_LOCKED,
  SOURCE_LOCKED_SEMANTIC_EDIT_BLOCKED,
  evaluateCanvasLayoutIntent,
  isSourceModelEditable,
} from "./canvasLayoutPolicy";

describe("canvas layout action policy", () => {
  it("blocks direct child movement in automatic modes", () => {
    const doc = createSampleDocument();
    doc.settings.layoutMode = "adaptive";

    const result = evaluateCanvasLayoutIntent({
      doc,
      action: "move",
      rootNodeIds: ["digital-onboarding"],
    });

    expect(result.allowed).toBe(false);
    expect(result.manualParentIdsToEnable).toEqual([]);
    expect(result.diagnosticCode).toBe(AUTOMATIC_LAYOUT_GEOMETRY_LOCKED);
    expect(result.skipAutoRelayout).toBe(true);
  });

  it("blocks keyboard movement in automatic modes even when the parent is already Manual", () => {
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

    expect(result.allowed).toBe(false);
    expect(result.manualParentIdsToEnable).toEqual([]);
    expect(result.diagnosticCode).toBe(AUTOMATIC_LAYOUT_GEOMETRY_LOCKED);
  });

  it("allows direct text-label movement in automatic modes", () => {
    const doc = createSampleDocument();
    doc.settings.layoutMode = "uniform";
    doc.nodesById.annotation = createNode({
      id: "annotation",
      label: "Annotation",
      type: "label",
      parentId: null,
    });

    const result = evaluateCanvasLayoutIntent({
      doc,
      action: "move",
      rootNodeIds: ["annotation"],
    });

    expect(result.allowed).toBe(true);
    expect(result.manualParentIdsToEnable).toEqual([]);
    expect(result.skipAutoRelayout).toBe(true);
  });

  it("keeps mixed label and capability geometry locked in automatic modes", () => {
    const doc = createSampleDocument();
    doc.settings.layoutMode = "uniform";
    doc.nodesById.annotation = createNode({
      id: "annotation",
      label: "Annotation",
      type: "label",
      parentId: null,
    });

    const result = evaluateCanvasLayoutIntent({
      doc,
      action: "move",
      rootNodeIds: ["annotation", "credit-risk"],
    });

    expect(result.allowed).toBe(false);
    expect(result.diagnosticCode).toBe(AUTOMATIC_LAYOUT_GEOMETRY_LOCKED);
  });

  it("allows direct movement in Freeform mode without enabling per-parent Manual", () => {
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

  it("blocks resize in automatic modes", () => {
    const doc = createSampleDocument();
    doc.settings.layoutMode = "balanced";

    const result = evaluateCanvasLayoutIntent({
      doc,
      action: "resize",
      rootNodeIds: ["digital-onboarding"],
    });

    expect(result.allowed).toBe(false);
    expect(result.diagnosticCode).toBe(AUTOMATIC_LAYOUT_GEOMETRY_LOCKED);
    expect(result.manualParentIdsToEnable).toEqual([]);
  });

  it("allows root movement in Freeform mode without enabling per-parent Manual", () => {
    const doc = createSampleDocument();
    doc.settings.layoutMode = "free";

    const result = evaluateCanvasLayoutIntent({
      doc,
      action: "move",
      rootNodeIds: ["retail-banking"],
    });

    expect(result.allowed).toBe(true);
    expect(result.manualParentIdsToEnable).toEqual([]);
  });

  it("does not use descendants to create hidden Manual scopes in Freeform mode", () => {
    const doc = createSampleDocument();
    doc.settings.layoutMode = "free";

    const result = evaluateCanvasLayoutIntent({
      doc,
      action: "move",
      rootNodeIds: ["operations"],
    });

    expect(result.allowed).toBe(true);
    expect(result.manualParentIdsToEnable).toEqual([]);
  });

  it("deduplicates the shared arranging parent for sibling multi-select movement", () => {
    const doc = createSampleDocument();
    doc.settings.layoutMode = "free";

    const result = evaluateCanvasLayoutIntent({
      doc,
      action: "keyboard-nudge",
      rootNodeIds: ["credit-risk", "fraud-risk", "operational-risk"],
    });

    expect(result.allowed).toBe(true);
    expect(result.manualParentIdsToEnable).toEqual([]);
  });

  it("rejects mixed-parent movement selections", () => {
    const doc = createSampleDocument();
    doc.settings.layoutMode = "free";

    const result = evaluateCanvasLayoutIntent({
      doc,
      action: "move",
      rootNodeIds: ["credit-risk", "process-management"],
    });

    expect(result.allowed).toBe(false);
    expect(result.diagnosticCode).toBe("invalid-selection");
  });

  it("allows explicit reparenting in automatic modes without direct geometry scope", () => {
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

  it("detects editable and source-locked source models", () => {
    const editable = createSampleDocument();
    const locked = {
      ...createSampleDocument(),
      access: { sourceLocked: true },
    };

    expect(isSourceModelEditable(editable)).toBe(true);
    expect(isSourceModelEditable(locked)).toBe(false);
  });

  it("blocks semantic edits on source-locked models", () => {
    const doc = createSampleDocument();
    doc.access = { sourceLocked: true };

    const result = evaluateCanvasLayoutIntent({
      doc,
      action: "add-child",
      rootNodeIds: ["risk"],
    });

    expect(result.allowed).toBe(false);
    expect(result.diagnosticCode).toBe(SOURCE_LOCKED_SEMANTIC_EDIT_BLOCKED);
  });

  it("permits visual movement on source-locked models in Freeform mode", () => {
    const doc = createSampleDocument();
    doc.settings.layoutMode = "free";
    doc.access = { sourceLocked: true };

    const result = evaluateCanvasLayoutIntent({
      doc,
      action: "move",
      rootNodeIds: ["credit-risk"],
    });

    expect(result.allowed).toBe(true);
    expect(result.skipAutoRelayout).toBe(true);
  });
});
