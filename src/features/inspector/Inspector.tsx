import { X } from "lucide-react";
import type { CapabilityDocument } from "../../domain/document/types";
import { useActiveVisualState } from "../../app/activeVisualState";
import { useDocumentStore } from "../../app/stores/documentStore";
import { useUiStore } from "../../app/stores/uiStore";
import { BulkInspector } from "./BulkInspector";
import { DataTab } from "./DataTab";
import { LayoutTab } from "./LayoutTab";
import { PropertiesTab } from "./PropertiesTab";
import { ViewerDetails } from "./ViewerDetails";

const INSPECTOR_TABS = ["inspector", "layout", "data"] as const;

export function Inspector({
  readonly = false,
  displayDoc,
}: {
  readonly?: boolean;
  displayDoc?: CapabilityDocument;
}) {
  const storeDoc = useDocumentStore((state) => state.doc);
  const doc = displayDoc ?? storeDoc;
  const { visualDocument: viewDoc, activeView } = useActiveVisualState({ doc });
  const selected = useUiStore((state) => state.selectedNodeIds);
  const setInspectorOpen = useUiStore((state) => state.setInspectorOpen);
  const tab = useUiStore((state) => state.inspectorTab);
  const setTab = useUiStore((state) => state.setInspectorTab);
  const sourceNode = selected.length === 1 ? doc.nodesById[selected[0]!] : null;
  const viewNode =
    selected.length === 1 ? viewDoc.nodesById[selected[0]!] : null;

  return (
    <aside className="cc-inspector">
      <div className="cc-inspector-header">
        <div className="cc-panel-title">
          {readonly ? "Details" : "Inspector"}
        </div>
        <button
          className="cc-icon-btn"
          type="button"
          aria-label="Collapse inspector"
          onClick={() => setInspectorOpen(false)}
        >
          <X />
        </button>
      </div>
      {!readonly && (
        <div className="cc-tabs">
          {INSPECTOR_TABS.map((item) => (
            <button
              key={item}
              type="button"
              className={`cc-tab ${tab === item ? "on" : ""}`}
              onClick={() => setTab(item)}
            >
              {item === "inspector"
                ? "Inspector"
                : item === "layout"
                  ? "Layout"
                  : "Data"}
            </button>
          ))}
        </div>
      )}
      <div className="cc-inspector-body">
        {selected.length > 1 && readonly && (
          <MultiSelectionSummary count={selected.length} />
        )}
        {selected.length > 1 && !readonly && (
          <BulkInspector
            doc={doc}
            viewDoc={viewDoc}
            selected={selected}
            tab={tab}
          />
        )}
        {selected.length === 0 && <EmptyInspector />}
        {viewNode && readonly && <ViewerDetails node={viewNode} />}
        {sourceNode && !readonly && tab === "inspector" && viewNode && (
          <PropertiesTab
            node={sourceNode}
            viewNode={viewNode}
            activeViewState={activeView.nodeStatesById[sourceNode.id]}
          />
        )}
        {viewNode && !readonly && tab === "layout" && (
          <LayoutTab node={viewNode} viewDoc={viewDoc} />
        )}
        {sourceNode && !readonly && tab === "data" && (
          <DataTab node={sourceNode} />
        )}
      </div>
    </aside>
  );
}

function EmptyInspector() {
  return (
    <div className="cc-info-card">
      Select a capability to edit its properties.
    </div>
  );
}

function MultiSelectionSummary({ count }: { count: number }) {
  return (
    <div className="cc-info-card">
      {count} selected. Use the floating toolbar or top toolbar for bulk layout
      operations.
    </div>
  );
}
