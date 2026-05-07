import { describe, expect, it } from "vitest";
import { createSampleDocument } from "../../domain/fixtures/sample";
import { serializeDocument } from "../../domain/document/serialize";
import { resolveViewerDocument } from "./resolveViewerDocument";

describe("resolveViewerDocument", () => {
  it("applies viewer-only heatmap overrides without mutating the source document", () => {
    const doc = createSampleDocument();
    const activeViewId = doc.visual.activeViewId;
    const before = serializeDocument(doc);

    const resolved = resolveViewerDocument(doc, {
      heatmapEnabledByViewId: {
        [activeViewId]: true,
      },
    });

    expect(resolved.heatmap.enabled).toBe(true);
    expect(resolved.visual.viewsById[activeViewId]!.heatmap.enabled).toBe(true);
    expect(resolved.timestamp).toBe(doc.timestamp);
    expect(serializeDocument(doc)).toEqual(before);
  });
});
