import type { CapabilityNode } from "../../domain/document/types";
import { Breadcrumb, FragmentRow } from "./InspectorMeta";

export function ViewerDetails({ node }: { node: CapabilityNode }) {
  return (
    <>
      <Breadcrumb node={node} />
      <h2 style={{ margin: 0, fontSize: 18 }}>{node.label}</h2>
      <dl className="cc-meta-list">
        <dt>Score</dt>
        <dd>{node.heatmapValue?.toFixed(2) ?? "No value"}</dd>
        <dt>Type</dt>
        <dd>{node.type}</dd>
        <dt>ID</dt>
        <dd>{String(node.metadata.id ?? node.id)}</dd>
        <dt>Status</dt>
        <dd>{String(node.metadata.status ?? "Active")}</dd>
      </dl>
      <div className="cc-field">
        <span className="cc-section-title">Description</span>
        <p style={{ margin: 0, color: "var(--cc-slate-700)", lineHeight: 1.5 }}>
          {node.description ?? "No description provided."}
        </p>
      </div>
      <div className="cc-field">
        <span className="cc-section-title">Metadata</span>
        <dl className="cc-meta-list">
          {Object.entries(node.metadata).map(([key, value]) => (
            <FragmentRow key={key} label={key} value={String(value)} />
          ))}
        </dl>
      </div>
    </>
  );
}
