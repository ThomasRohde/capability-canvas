import { beforeEach, describe, expect, it } from "vitest";
import { applyImportedDocument } from "../importDocument";
import { createSampleDocument } from "../../domain/fixtures/sample";
import { parseDocument, parseDocumentJson } from "../../domain/document/parse";
import { serializeDocument } from "../../domain/document/serialize";
import { childrenOf } from "../../domain/document/types";
import { findParentContainmentViolations } from "../../domain/layout/containment";
import { resetDocumentStoreForTests } from "../../test/documentStoreHarness";
import { useDocumentStore } from "./documentStore";

describe("document store import and hydration", () => {
  beforeEach(() => {
    resetDocumentStoreForTests();
  });

  it("hydrates restored documents without dirty state or undo history", () => {
    const restored = createSampleDocument();
    restored.title = "Saved local draft";

    useDocumentStore.getState().hydrateDocument(restored);

    expect(useDocumentStore.getState().doc.title).toBe("Saved local draft");
    expect(useDocumentStore.getState().past).toHaveLength(0);
    expect(useDocumentStore.getState().future).toHaveLength(0);
    expect(useDocumentStore.getState().dirty).toBe(false);
    expect(useDocumentStore.getState().saveStatus).toBe("idle");
    expect(useDocumentStore.getState().lastRestoredAt).toBeDefined();

    useDocumentStore.getState().undo();
    expect(useDocumentStore.getState().doc.title).toBe("Saved local draft");
  });

  it("parses old documents with default balanced aspect-ratio settings", () => {
    const wire = serializeDocument(createSampleDocument());
    const legacyWire = {
      ...wire,
      version: "1.1",
      settings: {
        ...wire.settings,
        layoutAspectRatioPreset: undefined,
        customLayoutAspectRatioWidth: undefined,
        customLayoutAspectRatioHeight: undefined,
      },
    };

    const parsed = parseDocument(legacyWire);

    expect(parsed.doc?.settings.layoutAspectRatioPreset).toBe("16:9");
    expect(parsed.doc?.settings.customLayoutAspectRatioWidth).toBe(16);
    expect(parsed.doc?.settings.customLayoutAspectRatioHeight).toBe(9);
  });

  it("keeps external capability-list imports outline-only without auto layout", async () => {
    const parsed = parseDocument([
      { id: "root", name: "Imported Root", parent: null },
      { id: "domain", name: "Imported Domain", parent: "root" },
      { id: "group", name: "Imported Group", parent: "domain" },
      { id: "leaf-a", name: "Imported Leaf A", parent: "group" },
      { id: "leaf-b", name: "Imported Leaf B", parent: "group" },
    ]);
    expect(parsed.doc?.layout.preservePositions).toBe(false);

    await applyImportedDocument(parsed, "Import capability list");
    await new Promise((resolve) => setTimeout(resolve, 50));

    const doc = useDocumentStore.getState().doc;
    const root = doc.nodesById[childrenOf(doc, null)[0]!]!;
    expect(useDocumentStore.getState().past.at(-1)?.label).toBe(
      "Import capability list",
    );
    expect(root.isOnCanvas).toBe(false);
    expect(Object.values(doc.nodesById).every((node) => !node.isOnCanvas)).toBe(
      true,
    );
    expect(useDocumentStore.getState().isAutoLayoutRunning).toBe(false);
    expect(findParentContainmentViolations(doc)).toEqual([]);
  });

  it("applies a reviewed import as exactly one undo history entry", async () => {
    const imported = createSampleDocument();
    imported.title = "Reviewed import";
    imported.layout = {
      ...imported.layout,
      isUserArranged: false,
      preservePositions: false,
    };
    const parsed = parseDocument(serializeDocument(imported));

    const diagnostics = await applyImportedDocument(parsed, "Import file");

    const state = useDocumentStore.getState();
    expect(state.doc.title).toBe("Reviewed import");
    expect(state.past).toHaveLength(1);
    expect(state.past[0]?.label).toBe("Import file");
    expect(state.future).toHaveLength(0);
    expect(state.isAutoLayoutRunning).toBe(false);
    expect(state.lastDiagnostics).toBe(diagnostics);
    expect(state.past.map((entry) => entry.label)).not.toContain("Auto layout");
  });

  it("keeps the current document when an import parse has no document", async () => {
    const before = useDocumentStore.getState().doc;
    const parsed = parseDocumentJson("{");

    const diagnostics = await applyImportedDocument(parsed, "Import file");

    const state = useDocumentStore.getState();
    expect(state.doc).toBe(before);
    expect(state.past).toHaveLength(0);
    expect(state.lastDiagnostics).toBe(diagnostics);
    expect(
      state.lastDiagnostics.some(
        (diagnostic) => diagnostic.code === "json-invalid",
      ),
    ).toBe(true);
  });
});
