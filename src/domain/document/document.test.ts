import { describe, expect, it } from "vitest";
import { createNode, DEFAULT_HEATMAP, DEFAULT_SETTINGS } from "./defaults";
import { parseDocument } from "./parse";
import { serializeDocument } from "./serialize";
import {
  createVisualView,
  deleteVisualView,
  resetVisualViewFromTemplate,
  runTransaction,
  updateDocumentSettings,
  updateNode,
  updateVisualNodeState,
} from "../commands/operations";
import { createSampleDocument } from "../fixtures/sample";
import { resolveVisualDocument } from "../visual/workspace";
import { DOCUMENT_VERSION, ROOT_PARENT_ID } from "./types";

describe("document JSON adapter", () => {
  it("round-trips sample documents through the wire format", () => {
    const doc = createSampleDocument();
    const wire = serializeDocument(doc);
    const parsed = parseDocument(wire);
    expect(parsed.doc).not.toBeNull();
    expect(
      parsed.diagnostics.filter((diag) => diag.severity === "error"),
    ).toHaveLength(0);
    expect(serializeDocument(parsed.doc!)).toEqual(wire);
  });

  it("tastes and imports capability list JSON arrays", () => {
    const parsed = parseDocument([
      {
        id: "edm",
        name: "Enterprise Domain Model",
        description: "Root model",
        parent: null,
        capability: 0,
      },
      {
        id: "channels",
        name: "Channels",
        description: "Channel domain",
        parent: "edm",
        capability: 0,
      },
      {
        id: "human-channels",
        name: "Human Channels",
        parent: "channels",
        capability: 1,
      },
    ]);

    expect(parsed.doc).not.toBeNull();
    expect(parsed.doc!.title).toBe("Enterprise Domain Model");
    expect(parsed.doc!.layout.preservePositions).toBe(false);
    expect(parsed.doc!.nodesById.edm!.type).toBe("root");
    expect(parsed.doc!.nodesById.channels!.type).toBe("parent");
    expect(parsed.doc!.nodesById["human-channels"]!.type).toBe("leaf");
    expect(parsed.doc!.nodesById.edm!.isOnCanvas).toBe(false);
    expect(parsed.doc!.nodesById.channels!.isOnCanvas).toBe(false);
    expect(parsed.doc!.nodesById["human-channels"]!.isOnCanvas).toBe(false);
    expect(parsed.doc!.nodesById.channels!.parentId).toBe("edm");
    expect(parsed.doc!.nodesById["human-channels"]!.parentId).toBe(
      "channels",
    );
    expect(parsed.doc!.nodesById.channels!.metadata).toMatchObject({
      importFormat: "capability-list",
      capability: 0,
    });
    expect(
      parsed.diagnostics.some(
        (diag) => diag.code === "external-capability-list-imported",
      ),
    ).toBe(true);
  });

  it("imports tree-style schema-less JSON hierarchies without canvas layout", () => {
    const parsed = parseDocument({
      root: {
        capability_id: "root-capability",
        children: [
          {
            capability_id: "business-control",
            children: [
              {
                capability_id: "aml-kyc",
                children: [],
                description: "Management of AML obligations",
                name: "AML KYC",
                parent_slug: "business-control",
                slug: "aml-kyc",
                target_architecture: null,
              },
            ],
            description: "Management of business controls",
            name: "Business Control",
            parent_slug: "enterprise-model",
            slug: "business-control",
          },
        ],
        description: "Synthetic repository root",
        name: "Enterprise Capability Model",
        parent_slug: null,
        slug: "enterprise-model",
      },
      tree: "published",
    });

    expect(parsed.doc).not.toBeNull();
    expect(parsed.doc!.title).toBe("Enterprise Capability Model");
    expect(parsed.doc!.layout.preservePositions).toBe(false);
    expect(parsed.doc!.nodesById["root-capability"]!.type).toBe("root");
    expect(parsed.doc!.nodesById["business-control"]!.type).toBe("parent");
    expect(parsed.doc!.nodesById["aml-kyc"]!).toMatchObject({
      parentId: "business-control",
      type: "leaf",
      label: "AML KYC",
      description: "Management of AML obligations",
      isOnCanvas: false,
    });
    expect(parsed.doc!.nodesById["aml-kyc"]!.metadata).toMatchObject({
      importFormat: "external-json-hierarchy",
      slug: "aml-kyc",
      target_architecture: null,
    });
    expect(
      parsed.diagnostics.some(
        (diag) => diag.code === "external-json-hierarchy-imported",
      ),
    ).toBe(true);
  });

  it("resolves flat schema-less parent references across naming variants", () => {
    const parsed = parseDocument({
      nodes: [
        {
          slug: "enterprise-model",
          title: "Enterprise Model",
          parent_slug: null,
        },
        {
          slug: "customer-domain",
          display_name: "Customer Domain",
          parent_slug: "enterprise-model",
        },
        {
          node_id: "customer-insight",
          label: "Customer Insight",
          parent: { slug: "customer-domain" },
          summary: "Understanding customer needs",
        },
      ],
    });

    expect(parsed.doc).not.toBeNull();
    expect(parsed.doc!.nodesById["customer-domain"]!.parentId).toBe(
      "enterprise-model",
    );
    expect(parsed.doc!.nodesById["customer-insight"]).toMatchObject({
      parentId: "customer-domain",
      label: "Customer Insight",
      description: "Understanding customer needs",
      isOnCanvas: false,
    });
  });

  it("repairs missing parents without leaving orphans", () => {
    const wire = serializeDocument(createSampleDocument());
    wire.nodes[1]!.parentId = "missing";
    const parsed = parseDocument(wire);
    expect(parsed.doc).not.toBeNull();
    expect(parsed.doc!.nodesById[wire.nodes[1]!.id]!.parentId).toBeNull();
    expect(
      parsed.diagnostics.some(
        (diag) => diag.code === "missing-parent-repaired",
      ),
    ).toBe(true);
  });

  it("repairs duplicate ids and ambiguous duplicate parent references deterministically", () => {
    const wire = serializeDocument(createSampleDocument());
    const root = { ...wire.nodes.find((node) => node.id === "customer")! };
    const firstDuplicate = {
      ...wire.nodes.find((node) => node.id === "channels")!,
    };
    const secondDuplicate = {
      ...wire.nodes.find((node) => node.id === "digital")!,
    };
    const child = {
      ...wire.nodes.find((node) => node.id === "digital-onboarding")!,
    };
    root.id = "root-a";
    root.parentId = null;
    root.type = "root";
    firstDuplicate.id = "dup";
    firstDuplicate.parentId = "root-a";
    firstDuplicate.type = "leaf";
    secondDuplicate.id = "dup";
    secondDuplicate.parentId = "root-a";
    secondDuplicate.type = "leaf";
    child.id = "child";
    child.parentId = "dup";
    child.type = "leaf";
    wire.nodes = [root, firstDuplicate, secondDuplicate, child];
    delete wire.visual;

    const parsed = parseDocument(wire);

    expect(parsed.doc).not.toBeNull();
    expect(parsed.doc!.nodesById.dup).toBeDefined();
    expect(parsed.doc!.nodesById["dup-2"]).toBeDefined();
    expect(parsed.doc!.nodesById.child).toMatchObject({
      parentId: null,
      type: "root",
    });
    expect(parsed.doc!.childrenByParentId[ROOT_PARENT_ID]).toContain("child");
    expect(
      parsed.diagnostics.some(
        (diagnostic) => diagnostic.code === "duplicate-id-repaired",
      ),
    ).toBe(true);
    const ambiguous = parsed.diagnostics.find(
      (diagnostic) => diagnostic.code === "ambiguous-parent-repaired",
    );
    expect(ambiguous?.message).toContain("raw child id child");
    expect(ambiguous?.message).toContain("repaired as child");
    expect(ambiguous?.message).toContain("Parent reference dup");
    expect(ambiguous?.message).toContain("moved to root");
    expect(
      parsed.diagnostics.filter(
        (diagnostic) => diagnostic.severity === "error",
      ),
    ).toHaveLength(0);

    const reparsed = parseDocument(serializeDocument(parsed.doc!));
    expect(reparsed.doc).not.toBeNull();
    expect(
      reparsed.diagnostics.some((diagnostic) =>
        ["duplicate-id-repaired", "ambiguous-parent-repaired"].includes(
          diagnostic.code,
        ),
      ),
    ).toBe(false);
  });

  it("renames duplicate root ids while keeping both nodes at the root", () => {
    const wire = serializeDocument(createSampleDocument());
    const firstRoot = {
      ...wire.nodes.find((node) => node.id === "customer")!,
      id: "duplicate-root",
      parentId: null,
      type: "root" as const,
    };
    const secondRoot = {
      ...wire.nodes.find((node) => node.id === "risk")!,
      id: "duplicate-root",
      parentId: null,
      type: "root" as const,
    };
    wire.nodes = [firstRoot, secondRoot];
    delete wire.visual;

    const parsed = parseDocument(wire);

    expect(parsed.doc).not.toBeNull();
    expect(parsed.doc!.nodesById["duplicate-root"]).toMatchObject({
      parentId: null,
      type: "root",
    });
    expect(parsed.doc!.nodesById["duplicate-root-2"]).toMatchObject({
      parentId: null,
      type: "root",
    });
    expect(parsed.doc!.childrenByParentId[ROOT_PARENT_ID]).toEqual([
      "duplicate-root",
      "duplicate-root-2",
    ]);
    expect(
      parsed.diagnostics.some(
        (diagnostic) => diagnostic.code === "duplicate-id-repaired",
      ),
    ).toBe(true);
  });

  it("defaults spacing settings when parsing older documents", () => {
    const wire = serializeDocument(createSampleDocument());
    const legacySettings = wire.settings as Partial<typeof wire.settings>;
    delete legacySettings.gridSize;
    delete legacySettings.resizeSnapToGrid;
    delete legacySettings.containerPaddingTop;
    delete legacySettings.containerPaddingRight;
    delete legacySettings.containerPaddingBottom;
    delete legacySettings.containerPaddingLeft;
    delete legacySettings.containerTitleHeight;
    delete legacySettings.containerLabelOffsetTop;
    delete legacySettings.childGapX;
    delete legacySettings.childGapY;
    delete legacySettings.leafColor;
    delete legacySettings.colorPalette;
    delete (wire.heatmap as Partial<typeof wire.heatmap>).showValuePills;
    const view = wire.visual!.viewsById[wire.visual!.activeViewId]!;
    delete (view.heatmap as Partial<typeof view.heatmap>).showValuePills;

    const parsed = parseDocument(wire);
    expect(parsed.doc).not.toBeNull();
    expect(parsed.doc!.settings.gridSize).toBe(DEFAULT_SETTINGS.gridSize);
    expect(parsed.doc!.settings.resizeSnapToGrid).toBe(
      DEFAULT_SETTINGS.resizeSnapToGrid,
    );
    expect(parsed.doc!.settings.containerPaddingTop).toBe(
      DEFAULT_SETTINGS.containerPaddingTop,
    );
    expect(parsed.doc!.settings.containerPaddingRight).toBe(
      DEFAULT_SETTINGS.containerPaddingRight,
    );
    expect(parsed.doc!.settings.containerPaddingBottom).toBe(
      DEFAULT_SETTINGS.containerPaddingBottom,
    );
    expect(parsed.doc!.settings.containerPaddingLeft).toBe(
      DEFAULT_SETTINGS.containerPaddingLeft,
    );
    expect(parsed.doc!.settings.containerTitleHeight).toBe(
      DEFAULT_SETTINGS.containerTitleHeight,
    );
    expect(parsed.doc!.settings.containerLabelOffsetTop).toBe(
      DEFAULT_SETTINGS.containerLabelOffsetTop,
    );
    expect(parsed.doc!.settings.childGapX).toBe(DEFAULT_SETTINGS.childGapX);
    expect(parsed.doc!.settings.childGapY).toBe(DEFAULT_SETTINGS.childGapY);
    expect(parsed.doc!.settings.leafColor).toBe(DEFAULT_SETTINGS.leafColor);
    expect(parsed.doc!.settings.colorPalette).toBe(
      DEFAULT_SETTINGS.colorPalette,
    );
    expect(parsed.doc!.heatmap.showValuePills).toBe(
      DEFAULT_HEATMAP.showValuePills,
    );
    expect(
      parsed.doc!.visual.viewsById[parsed.doc!.visual.activeViewId]?.heatmap
        .showValuePills,
    ).toBe(DEFAULT_HEATMAP.showValuePills);
  });

  it("defaults legacy nodes without canvas membership to visible", () => {
    const wire = serializeDocument(createSampleDocument());
    for (const node of wire.nodes) {
      delete (node as Partial<typeof node>).isOnCanvas;
    }

    const parsed = parseDocument(wire);

    expect(parsed.doc).not.toBeNull();
    expect(
      Object.values(parsed.doc!.nodesById).every((node) => node.isOnCanvas),
    ).toBe(true);
  });

  it("preserves canvas membership through JSON round-trip", () => {
    const doc = createSampleDocument();
    doc.nodesById["digital-onboarding"] = {
      ...doc.nodesById["digital-onboarding"]!,
      isOnCanvas: false,
    };

    const parsed = parseDocument(serializeDocument(doc));

    expect(parsed.doc?.nodesById["digital-onboarding"]?.isOnCanvas).toBe(
      false,
    );
  });

  it("preserves spacing settings through JSON round-trip", () => {
    const doc = {
      ...createSampleDocument(),
      settings: {
        ...createSampleDocument().settings,
        gridSize: 24,
        resizeSnapToGrid: false,
        containerPaddingTop: 48,
        containerPaddingRight: 40,
        containerPaddingBottom: 36,
        containerPaddingLeft: 44,
        containerTitleHeight: 12,
        containerLabelOffsetTop: 6,
        childGapX: 52,
        childGapY: 20,
        leafColor: "stone" as const,
        colorPalette: "darker" as const,
      },
    };

    const parsed = parseDocument(serializeDocument(doc));
    expect(parsed.doc?.settings).toMatchObject({
      gridSize: 24,
      resizeSnapToGrid: false,
      containerPaddingTop: 48,
      containerPaddingRight: 40,
      containerPaddingBottom: 36,
      containerPaddingLeft: 44,
      containerTitleHeight: 12,
      containerLabelOffsetTop: 6,
      childGapX: 52,
      childGapY: 20,
      leafColor: "stone",
      colorPalette: "darker",
    });
  });

  it("applies the global leaf color unless a node color is overridden", () => {
    const themed = runTransaction(
      createSampleDocument(),
      updateDocumentSettings({ leafColor: "slate" }),
    ).doc;

    const resolved = resolveVisualDocument(themed);
    expect(resolved.nodesById["credit-risk"]?.color).toBe("slate");
    expect(resolved.nodesById.risk?.color).toBe("coral");

    const overridden = runTransaction(
      themed,
      updateNode("credit-risk", { color: "amber" }),
    ).doc;
    expect(overridden.nodesById["credit-risk"]?.colorOverride).toBe("amber");
    expect(resolveVisualDocument(overridden).nodesById["credit-risk"]?.color).toBe(
      "amber",
    );

    const l1 = runTransaction(
      themed,
      createVisualView({ templateId: "level-1-map@1" }),
    ).doc;
    expect(resolveVisualDocument(l1).nodesById.customer?.color).toBe(
      "slate",
    );
  });

  it("preserves transparent colors through JSON round-trip", () => {
    const doc = runTransaction(
      createSampleDocument(),
      updateNode("credit-risk", { color: "transparent" }),
    ).doc;

    const parsed = parseDocument(serializeDocument(doc));

    expect(parsed.doc?.nodesById["credit-risk"]?.colorOverride).toBe(
      "transparent",
    );
  });

  it("preserves legacy leaf color differences as explicit overrides", () => {
    const wire = serializeDocument(createSampleDocument());
    const creditRisk = wire.nodes.find((node) => node.id === "credit-risk")!;
    delete creditRisk.colorOverride;
    creditRisk.color = "lavender";

    const parsed = parseDocument(wire);

    expect(parsed.doc?.nodesById["credit-risk"]?.colorOverride).toBe(
      "lavender",
    );
  });

  it("migrates v1.0 documents to a default visual view", () => {
    const wire = serializeDocument(createSampleDocument());
    wire.version = "1.0";
    delete wire.visual;

    const parsed = parseDocument(wire);

    expect(parsed.doc).not.toBeNull();
    expect(parsed.doc!.version).toBe(DOCUMENT_VERSION);
    expect(parsed.doc!.visual.viewOrder).toHaveLength(1);
    const view = parsed.doc!.visual.viewsById[parsed.doc!.visual.activeViewId]!;
    expect(view.nodeStatesById["digital-onboarding"]).toMatchObject({
      x: wire.nodes.find((node) => node.id === "digital-onboarding")!.x,
      isOnCanvas: true,
    });
  });

  it("round-trips multiple visual views through JSON", () => {
    const first = runTransaction(
      createSampleDocument(),
      createVisualView({ templateId: "presentation-slide@1" }),
    ).doc;
    const viewId = first.visual.activeViewId;
    const updated = runTransaction(
      first,
      updateVisualNodeState(viewId, "digital-onboarding", {
        x: 1200,
        isOnCanvas: false,
      }),
    ).doc;

    const parsed = parseDocument(serializeDocument(updated));

    expect(parsed.doc?.visual.viewOrder).toHaveLength(2);
    expect(
      parsed.doc?.visual.viewsById[viewId]?.nodeStatesById[
        "digital-onboarding"
      ],
    ).toMatchObject({ x: 1200, isOnCanvas: false });
    expect(resolveVisualDocument(parsed.doc!, viewId).nodesById[
      "digital-onboarding"
    ]?.isOnCanvas).toBe(false);
  });

  it("creates level map templates with the expected visible depth", () => {
    const l1 = runTransaction(
      createSampleDocument(),
      createVisualView({ templateId: "level-1-map@1" }),
    ).doc;
    const l1Resolved = resolveVisualDocument(l1);
    expect(l1Resolved.nodesById["retail-banking"]?.isOnCanvas).toBe(true);
    expect(l1Resolved.nodesById.customer?.isOnCanvas).toBe(true);
    expect(l1Resolved.nodesById.risk?.isOnCanvas).toBe(true);
    expect(l1Resolved.nodesById.channels?.isOnCanvas).toBe(false);
    expect(l1.nodesById.customer?.type).toBe("parent");
    expect(l1Resolved.nodesById.customer?.type).toBe("leaf");
    expect(l1Resolved.nodesById["retail-banking"]?.type).toBe("root");

    const l2 = runTransaction(
      createSampleDocument(),
      createVisualView({ templateId: "level-2-map@1" }),
    ).doc;
    const l2Resolved = resolveVisualDocument(l2);
    expect(l2Resolved.nodesById.channels?.isOnCanvas).toBe(true);
    expect(l2Resolved.nodesById.servicing?.isOnCanvas).toBe(true);
    expect(l2Resolved.nodesById.digital?.isOnCanvas).toBe(false);
    expect(l2Resolved.nodesById.customer?.type).toBe("parent");
    expect(l2Resolved.nodesById.channels?.type).toBe("leaf");

    const l3 = runTransaction(
      createSampleDocument(),
      createVisualView({ templateId: "level-3-map@1" }),
    ).doc;
    const l3Resolved = resolveVisualDocument(l3);
    expect(l3Resolved.nodesById.digital?.isOnCanvas).toBe(true);
    expect(l3Resolved.nodesById.branch?.isOnCanvas).toBe(true);
    expect(l3Resolved.nodesById["digital-onboarding"]?.isOnCanvas).toBe(false);
    expect(l3Resolved.nodesById.digital?.type).toBe("leaf");

    const levelFiveDoc = createSampleDocument();
    levelFiveDoc.nodesById["digital-onboarding"] = {
      ...levelFiveDoc.nodesById["digital-onboarding"]!,
      type: "parent",
    };
    levelFiveDoc.nodesById["kyc-document-capture"] = createNode({
      id: "kyc-document-capture",
      parentId: "digital-onboarding",
      label: "KYC Document Capture",
      type: "leaf",
      color: "mint",
    });
    levelFiveDoc.childrenByParentId["digital-onboarding"] = [
      "kyc-document-capture",
    ];
    levelFiveDoc.childrenByParentId["kyc-document-capture"] = [];

    const l4 = runTransaction(
      levelFiveDoc,
      createVisualView({ templateId: "level-4-map@1" }),
    ).doc;
    const l4Resolved = resolveVisualDocument(l4);
    expect(l4Resolved.nodesById["digital-onboarding"]?.isOnCanvas).toBe(true);
    expect(l4Resolved.nodesById["kyc-document-capture"]?.isOnCanvas).toBe(
      false,
    );
    expect(l4Resolved.nodesById.digital?.type).toBe("parent");
    expect(l4Resolved.nodesById["digital-onboarding"]?.type).toBe("leaf");
  });

  it("preserves domain deep-dive template context through JSON and reset", () => {
    const first = runTransaction(
      createSampleDocument(),
      createVisualView({
        templateId: "domain-deep-dive@1",
        rootId: "operations",
      }),
    ).doc;
    const viewId = first.visual.activeViewId;

    const parsed = parseDocument(serializeDocument(first)).doc!;
    expect(parsed.visual.viewsById[viewId]?.templateContext).toEqual({
      rootId: "operations",
    });

    const reset = runTransaction(
      parsed,
      resetVisualViewFromTemplate(viewId, "domain-deep-dive@1"),
    ).doc;
    const resolved = resolveVisualDocument(reset, viewId);
    expect(reset.visual.viewsById[viewId]?.templateContext?.rootId).toBe(
      "operations",
    );
    expect(resolved.nodesById.operations?.isOnCanvas).toBe(true);
    expect(resolved.nodesById["process-management"]?.isOnCanvas).toBe(true);
    expect(resolved.nodesById.customer?.isOnCanvas).toBe(false);
  });

  it("warns and drops stale visual node references on import", () => {
    const wire = serializeDocument(createSampleDocument());
    const view = wire.visual!.viewsById[wire.visual!.activeViewId]!;
    view.nodeStatesById["missing-node"] = { x: 1, y: 2 };

    const parsed = parseDocument(wire);

    expect(
      parsed.diagnostics.some(
        (diagnostic) => diagnostic.code === "stale-view-node-reference",
      ),
    ).toBe(true);
    expect(
      parsed.doc!.visual.viewsById[parsed.doc!.visual.activeViewId]!
        .nodeStatesById["missing-node"],
    ).toBeUndefined();
  });

  it("rejects deleting the last visual view", () => {
    const result = runTransaction(
      createSampleDocument(),
      deleteVisualView("view-default"),
    );

    expect(result.doc.visual.viewOrder).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("delete-last-view");
  });
});
