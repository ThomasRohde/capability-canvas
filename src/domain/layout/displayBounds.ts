import type { Bounds, CapabilityDocument, VisualView } from "../document/types";

export function layoutDisplayBounds(doc: CapabilityDocument): Bounds {
  return doc.layout.aspectRatioFrame ?? doc.layout.boundingBox;
}

export function visualLayoutDisplayBounds(
  view: VisualView,
): Bounds | undefined {
  return view.layout.aspectRatioFrame ?? view.layout.boundingBox;
}
