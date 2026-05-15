import { describe, expect, it } from "vitest";
import { createSampleDocument, createThousandNodeDocument } from "../fixtures/sample";
import { addLabel, runTransaction } from "../commands/operations";
import { searchOutline } from "./outlineSearch";

describe("outline search", () => {
  it("matches labels, IDs, descriptions, and primitive metadata", () => {
    const doc = createSampleDocument();

    expect(searchOutline(doc, "Digital Onboarding").matchingNodeIds).toContain(
      "digital-onboarding",
    );
    expect(searchOutline(doc, "digital-onboarding").matchingNodeIds).toContain(
      "digital-onboarding",
    );
    expect(searchOutline(doc, "open accounts").matchingNodeIds).toContain(
      "digital-onboarding",
    );
    expect(searchOutline(doc, "owner").matchingNodeIds).toContain(
      "digital-onboarding",
    );
    expect(searchOutline(doc, "Digital Banking").matchingNodeIds).toContain(
      "digital-onboarding",
    );
  });

  it("keeps ancestor context visible for deep matches", () => {
    const doc = createSampleDocument();
    const result = searchOutline(doc, "Digital Onboarding");

    expect(result.matchingNodeIds).toEqual(["digital-onboarding"]);
    for (const ancestorId of ["retail-banking", "customer", "channels", "digital"]) {
      expect(result.visibleNodeIds.has(ancestorId)).toBe(true);
      expect(result.ancestorNodeIds.has(ancestorId)).toBe(true);
    }
    expect(result.pathLabelsByNodeId["digital-onboarding"]).toEqual([
      "Retail Banking",
      "Customer",
      "Channels",
      "Digital",
      "Digital Onboarding",
    ]);
  });

  it("disambiguates duplicate labels by returning each result path", () => {
    const doc = createSampleDocument();
    doc.nodesById["digital-servicing"] = {
      ...doc.nodesById["digital-servicing"]!,
      label: "Duplicate capability",
    };
    doc.nodesById["branch-operations"] = {
      ...doc.nodesById["branch-operations"]!,
      label: "Duplicate capability",
    };

    const result = searchOutline(doc, "Duplicate capability");

    expect(result.matchingNodeIds).toEqual([
      "digital-servicing",
      "branch-operations",
    ]);
    expect(result.pathLabelsByNodeId["digital-servicing"]).toEqual([
      "Retail Banking",
      "Customer",
      "Channels",
      "Digital",
      "Duplicate capability",
    ]);
    expect(result.pathLabelsByNodeId["branch-operations"]).toEqual([
      "Retail Banking",
      "Customer",
      "Channels",
      "Branch",
      "Duplicate capability",
    ]);
  });

  it("searches the thousand-node fixture without broad fallback matches", () => {
    const result = searchOutline(createThousandNodeDocument(), "Capability 900");

    expect(result.matchingNodeIds).toEqual(["root-9-parent-8-leaf-9"]);
    expect(result.visibleNodeIds.has("root-9")).toBe(true);
    expect(result.visibleNodeIds.has("root-9-parent-8")).toBe(true);
  });

  it("excludes canvas labels from outline search matches", () => {
    const doc = runTransaction(
      createSampleDocument(),
      addLabel("Do not show in outline", { id: "label-outline-hidden" }),
    ).doc;

    const result = searchOutline(doc, "Do not show");

    expect(result.matchingNodeIds).toEqual([]);
    expect(result.visibleNodeIds.has("label-outline-hidden")).toBe(false);
  });
});
