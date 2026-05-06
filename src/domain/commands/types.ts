import type {
  CapabilityDocument,
  NodeId,
  VisualViewId,
} from "../document/types";
import type { Diagnostic } from "../validation/diagnostics";

export type RelayoutScope =
  | NodeId[]
  | "document"
  | ((beforeDoc: CapabilityDocument, afterDoc: CapabilityDocument) => NodeId[]);

export interface Command<TArgs = unknown> {
  type: string;
  args: TArgs;
  apply(doc: CapabilityDocument): CommandResult;
}

export interface CommandResult {
  doc: CapabilityDocument;
  diagnostics: Diagnostic[];
}

export interface Transaction {
  label: string;
  commands: Command[];
  meta?: {
    source?: "drag" | "bulk" | "edit" | "import" | "layout";
    relayout?: { scope: RelayoutScope; force?: boolean; viewId?: VisualViewId };
  };
}

export interface HistoryEntry {
  label: string;
  before: CapabilityDocument;
  after: CapabilityDocument;
  relayout?: { scope: RelayoutScope; force: boolean; viewId?: VisualViewId };
}

export type AlignDirection =
  | "left"
  | "center"
  | "right"
  | "top"
  | "middle"
  | "bottom";
export type DistributionAxis = "horizontal" | "vertical";
export type SizeAxis = "both" | "width" | "height";

export interface ClipboardPayload {
  rootIds: NodeId[];
  nodes: Record<NodeId, unknown>;
}
