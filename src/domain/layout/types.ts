import type { Bounds, CapabilityDocument, LayoutMode, NodeId } from '../document/types';
import type { Diagnostic } from '../validation/diagnostics';

export interface LayoutRequest {
  doc: CapabilityDocument;
  mode?: LayoutMode;
  affectedNodeIds?: NodeId[];
  force?: boolean;
}

export interface LayoutPatch extends Bounds {
  id: NodeId;
}

export interface LayoutResult {
  patches: LayoutPatch[];
  diagnostics: Diagnostic[];
}

