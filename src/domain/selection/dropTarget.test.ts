import { describe, expect, it } from "vitest";
import { runTransaction, updateNode } from "../commands/operations";
import { createSampleDocument } from "../fixtures/sample";
import { descendantsOf } from "../validation/validate";
import { findDropTarget, isAcceptableDropTarget } from "./dropTarget";

describe("drop target detection", () => {
  it("returns the deepest container under the pointer", () => {
    const doc = createSampleDocument();
    const digital = doc.nodesById.digital!;
    const target = findDropTarget({
      doc,
      pointDocX: digital.x + digital.w / 2,
      pointDocY: digital.y + digital.h / 2,
      draggedIds: new Set(),
    });
    expect(target.parentId).toBe("digital");
  });

  it("skips dragged nodes and their descendants", () => {
    const doc = createSampleDocument();
    const customer = doc.nodesById.customer!;
    const draggedIds = new Set<string>([
      "customer",
      ...descendantsOf(doc, "customer"),
    ]);
    const target = findDropTarget({
      doc,
      pointDocX: customer.x + customer.w / 2,
      pointDocY: customer.y + customer.h / 2,
      draggedIds,
    });
    // customer + everything inside it is excluded; the only remaining container is the root.
    expect(target.parentId).toBe("retail-banking");
  });

  it("skips locked containers", () => {
    const doc = runTransaction(
      createSampleDocument(),
      updateNode("digital", { isLockedAsIs: true }),
    ).doc;
    const digital = doc.nodesById.digital!;
    const target = findDropTarget({
      doc,
      pointDocX: digital.x + digital.w / 2,
      pointDocY: digital.y + digital.h / 2,
      draggedIds: new Set(),
    });
    expect(target.parentId).not.toBe("digital");
  });

  it("rejects drops onto self-descendants", () => {
    const doc = createSampleDocument();
    const result = isAcceptableDropTarget(doc, "customer", "digital");
    expect(result.accepted).toBe(false);
  });

  it("rejects drops onto text-label parents", () => {
    const doc = runTransaction(
      createSampleDocument(),
      updateNode("digital-onboarding", { isTextLabel: true, type: "text" }),
    ).doc;
    expect(doc.nodesById["digital-onboarding"]!.isTextLabel).toBe(true);
    const result = isAcceptableDropTarget(
      doc,
      "fraud-risk",
      "digital-onboarding",
    );
    expect(result.accepted).toBe(false);
  });

  it("accepts a top-level drop (parentId: null)", () => {
    const doc = createSampleDocument();
    const result = isAcceptableDropTarget(doc, "fraud-risk", null);
    expect(result.accepted).toBe(true);
  });
});
