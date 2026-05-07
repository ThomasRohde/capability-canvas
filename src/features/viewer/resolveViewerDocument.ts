import { cloneDocument } from "../../domain/document/normalize";
import type {
  CapabilityDocument,
  VisualViewId,
} from "../../domain/document/types";
import { materializeActiveViewMetadata } from "../../domain/visual/workspace";

export interface ViewerOverrides {
  activeViewId?: VisualViewId;
  heatmapEnabledByViewId?: Record<VisualViewId, boolean>;
}

export function resolveViewerDocument(
  doc: CapabilityDocument,
  overrides: ViewerOverrides,
): CapabilityDocument {
  const activeViewId =
    overrides.activeViewId && doc.visual.viewsById[overrides.activeViewId]
      ? overrides.activeViewId
      : doc.visual.activeViewId;
  const next = cloneDocument(doc);
  next.visual = {
    ...next.visual,
    activeViewId,
  };

  const heatmapEnabled = overrides.heatmapEnabledByViewId?.[activeViewId];
  if (typeof heatmapEnabled === "boolean") {
    const view = next.visual.viewsById[activeViewId];
    if (view) {
      next.visual.viewsById[activeViewId] = {
        ...view,
        heatmap: {
          ...view.heatmap,
          enabled: heatmapEnabled,
        },
      };
    }
  }

  return materializeActiveViewMetadata(next);
}
