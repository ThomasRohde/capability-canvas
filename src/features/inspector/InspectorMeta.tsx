import {
  isNodeOnCanvas,
  type CapabilityNode,
  type VisualNodeState,
} from "../../domain/document/types";
import { useDocumentStore } from "../../app/stores/documentStore";
import { capabilityPathLabels } from "./inspectorUtils";

export function Breadcrumb({ node }: { node: CapabilityNode }) {
  const doc = useDocumentStore((state) => state.doc);
  const labels = capabilityPathLabels(doc, node);
  return (
    <div style={{ color: "var(--cc-brand-700)", fontSize: 12 }}>
      {labels.join(" > ")}
    </div>
  );
}

export function SourceViewStatus({
  node,
  viewNode,
  activeViewState,
}: {
  node: CapabilityNode;
  viewNode: CapabilityNode;
  activeViewState?: VisualNodeState;
}) {
  const doc = useDocumentStore((state) => state.doc);
  const sourceId =
    typeof node.metadata.id === "string" || typeof node.metadata.id === "number"
      ? String(node.metadata.id)
      : null;
  const layoutState = viewNode.isLockedAsIs
    ? "Preserved from auto layout"
    : viewNode.isManualPositioningEnabled
      ? "Manual active view layout"
      : "Auto layout";

  return (
    <div className="cc-field">
      <span className="cc-section-title">Source model and active view</span>
      <dl className="cc-meta-list">
        <FragmentRow
          label="Model path"
          value={capabilityPathLabels(doc, node).join(" > ")}
        />
        <FragmentRow
          label="Visibility"
          value={
            isNodeOnCanvas(viewNode)
              ? "Visible in active view"
              : "Hidden in active view"
          }
        />
        <FragmentRow
          label="Collapse"
          value={
            activeViewState?.isCollapsed
              ? "Collapsed in active view"
              : "Expanded in active view"
          }
        />
        <FragmentRow label="Layout" value={layoutState} />
        {sourceId && <FragmentRow label="Source ID" value={sourceId} />}
      </dl>
    </div>
  );
}

export function FragmentRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}
