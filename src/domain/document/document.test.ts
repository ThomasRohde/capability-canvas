import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./defaults";
import { parseDocument } from "./parse";
import { serializeDocument } from "./serialize";
import { createSampleDocument } from "../fixtures/sample";

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
    delete legacySettings.childGapX;
    delete legacySettings.childGapY;

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
    expect(parsed.doc!.settings.childGapX).toBe(DEFAULT_SETTINGS.childGapX);
    expect(parsed.doc!.settings.childGapY).toBe(DEFAULT_SETTINGS.childGapY);
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
        childGapX: 52,
        childGapY: 20,
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
      childGapX: 52,
      childGapY: 20,
    });
  });
});
