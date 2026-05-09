import type {
  Bounds,
  CapabilityDocument,
  LayoutAspectRatioTarget,
  LayoutMode,
  NodeId,
} from '../document/types';
import type { Diagnostic } from '../validation/diagnostics';

export interface LayoutRequest {
  doc: CapabilityDocument;
  mode?: LayoutMode;
  affectedNodeIds?: NodeId[];
  force?: boolean;
  targetAspectRatio?: LayoutAspectRatioTarget;
}

export interface LayoutPatch extends Bounds {
  id: NodeId;
}

export interface LayoutResult {
  patches: LayoutPatch[];
  diagnostics: Diagnostic[];
  aspectRatioFrame?: Bounds;
  aspectRatioTarget?: LayoutAspectRatioTarget;
}
