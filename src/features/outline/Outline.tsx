import {
  hotkeysCoreFeature,
  selectionFeature,
  syncDataLoaderFeature,
} from "@headless-tree/core";
import { useTree } from "@headless-tree/react";
import {
  ChevronDown,
  ChevronRight,
  Filter,
  MoreHorizontal,
  Plus,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  addChild,
  addRoot,
  deleteNodes,
  duplicateNodes,
  fitParentToChildren,
} from "../../domain/commands/operations";
import {
  childrenOf,
  ROOT_PARENT_ID,
  type CapabilityDocument,
  type NodeId,
} from "../../domain/document/types";
import { canMultiSelect } from "../../domain/selection/rules";
import { useDocumentStore } from "../../app/stores/documentStore";
import { useUiStore } from "../../app/stores/uiStore";
import { CATEGORY_STYLES } from "../heatmap/resolveNodeFill";

export function Outline() {
  const doc = useDocumentStore((state) => state.doc);
  const execute = useDocumentStore((state) => state.execute);
  const selected = useUiStore((state) => state.selectedNodeIds);
  const setSelection = useUiStore((state) => state.setSelection);
  const setOutlineOpen = useUiStore((state) => state.setOutlineOpen);
  const searchQuery = useUiStore((state) => state.searchQuery);
  const setSearchQuery = useUiStore((state) => state.setSearchQuery);
  const [menuNodeId, setMenuNodeId] = useState<NodeId | null>(null);

  const rootItemId = "outline-root";
  const folderIds = useMemo(
    () =>
      Object.keys(doc.nodesById).filter((id) => childrenOf(doc, id).length > 0),
    [doc],
  );
  const knownFolderIds = useRef(new Set(folderIds));
  const [expandedItems, setExpandedItems] = useState(folderIds);
  const structureSignature = useMemo(
    () =>
      Object.entries(doc.childrenByParentId)
        .map(([parentId, childIds]) => `${parentId}:${childIds.join(",")}`)
        .sort()
        .join("|"),
    [doc.childrenByParentId],
  );

  useEffect(() => {
    const currentFolderIds = new Set(folderIds);
    const newlyFolderIds = folderIds.filter(
      (id) => !knownFolderIds.current.has(id),
    );
    knownFolderIds.current = currentFolderIds;
    setExpandedItems((previous) => {
      const next = previous.filter((id) => currentFolderIds.has(id));
      for (const id of newlyFolderIds) {
        if (!next.includes(id)) next.push(id);
      }
      return arraysEqual(previous, next) ? previous : next;
    });
  }, [folderIds]);

  const tree = useTree<string>({
    rootItemId,
    state: { expandedItems },
    setExpandedItems,
    indent: 14,
    getItemName: (item) => {
      const id = item.getId();
      return id === rootItemId ? "Root" : (doc.nodesById[id]?.label ?? id);
    },
    isItemFolder: (item) => {
      const id = item.getId();
      return id === rootItemId || childrenOf(doc, id).length > 0;
    },
    dataLoader: {
      getItem: (itemId) => itemId,
      getChildren: (itemId) =>
        itemId === rootItemId
          ? (doc.childrenByParentId[ROOT_PARENT_ID] ?? [])
          : childrenOf(doc, itemId),
    },
    features: [syncDataLoaderFeature, selectionFeature, hotkeysCoreFeature],
  });

  useEffect(() => {
    tree.rebuildTree();
  }, [structureSignature, tree]);

  return (
    <aside className="cc-outline">
      <div className="cc-outline-header">
        <div className="cc-panel-title">Outline</div>
        <button
          className="cc-icon-btn"
          type="button"
          aria-label="Collapse outline"
          onClick={() => setOutlineOpen(false)}
        >
          <ChevronDown />
        </button>
      </div>
      <div className="cc-outline-search">
        <div style={{ position: "relative", flex: 1 }}>
          <Search
            size={14}
            style={{
              position: "absolute",
              left: 9,
              top: 9,
              color: "var(--cc-slate-400)",
            }}
          />
          <input
            className="cc-input"
            style={{ paddingLeft: 28 }}
            placeholder="Search outline"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>
        <button
          className="cc-icon-btn"
          type="button"
          aria-label="Filter outline"
        >
          <Filter />
        </button>
        <button
          className="cc-icon-btn active"
          type="button"
          aria-label="Add root capability"
          onClick={() => execute(addRoot())}
        >
          <Plus />
        </button>
      </div>
      <div {...tree.getContainerProps()} className="cc-outline-tree">
        {tree
          .getItems()
          .filter((item) => item.getId() !== rootItemId)
          .filter((item) => {
            const query = searchQuery.trim().toLowerCase();
            return (
              query.length === 0 ||
              (doc.nodesById[item.getId()]?.label
                .toLowerCase()
                .includes(query) ??
                false)
            );
          })
          .map((item) => {
            const node = doc.nodesById[item.getId()];
            if (!node) return null;
            const active = selected.includes(node.id);
            const style = CATEGORY_STYLES[node.color];
            const itemProps = item.getProps();
            return (
              <div
                {...itemProps}
                key={node.id}
                className={`cc-tree-row ${active ? "active" : ""}`}
                style={{
                  paddingLeft: `${8 + item.getItemMeta().level * 14}px`,
                }}
                onClick={(event) => {
                  itemProps.onClick?.(event);
                  if (event.ctrlKey || event.metaKey || event.shiftKey) {
                    toggleOutlineSelection(doc, node.id);
                  } else {
                    setSelection([node.id]);
                  }
                }}
              >
                {item.isFolder() ? (
                  item.isExpanded() ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )
                ) : (
                  <span style={{ width: 14 }} />
                )}
                <span
                  className="cc-tree-swatch"
                  style={{ color: style.border, background: style.background }}
                />
                <span className="cc-tree-label">{node.label}</span>
                {doc.heatmap.enabled && node.heatmapValue !== undefined && (
                  <span className="cc-tree-score">
                    {node.heatmapValue.toFixed(2)}
                  </span>
                )}
                <button
                  className="cc-tree-actions"
                  type="button"
                  aria-label={`Actions for ${node.label}`}
                  aria-haspopup="menu"
                  aria-expanded={menuNodeId === node.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    setMenuNodeId(menuNodeId === node.id ? null : node.id);
                  }}
                >
                  <MoreHorizontal size={14} />
                </button>
                {menuNodeId === node.id && (
                  <OutlineActionsMenu
                    nodeId={node.id}
                    canAddChild={!node.isTextLabel && node.type !== "text"}
                    canFitParent={childrenOf(doc, node.id).length > 0}
                    onClose={() => setMenuNodeId(null)}
                  />
                )}
              </div>
            );
          })}
      </div>
      <div className="cc-outline-footer">
        <button
          className="cc-btn cc-add-root"
          type="button"
          onClick={() => execute(addRoot())}
        >
          <Plus /> Add root capability
        </button>
      </div>
    </aside>
  );
}

function arraysEqual(first: string[], second: string[]) {
  return (
    first.length === second.length &&
    first.every((value, index) => value === second[index])
  );
}

function toggleOutlineSelection(doc: CapabilityDocument, nodeId: NodeId) {
  const ui = useUiStore.getState();
  const current = ui.selectedNodeIds;
  const candidate = current.includes(nodeId)
    ? current.filter((id) => id !== nodeId)
    : [...current, nodeId];
  if (candidate.length <= 1 || canMultiSelect(doc, candidate).valid) {
    ui.setSelection(candidate);
    return;
  }
  ui.setSelection([nodeId]);
}

function OutlineActionsMenu({
  nodeId,
  canAddChild,
  canFitParent,
  onClose,
}: {
  nodeId: NodeId;
  canAddChild: boolean;
  canFitParent: boolean;
  onClose: () => void;
}) {
  const execute = useDocumentStore((state) => state.execute);
  const run = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <div
      className="cc-outline-menu"
      role="menu"
      aria-label="Capability actions"
      onClick={(event) => event.stopPropagation()}
    >
      {canAddChild && (
        <button
          type="button"
          role="menuitem"
          onClick={() => run(() => execute(addChild(nodeId)))}
        >
          Add child
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        onClick={() => run(() => execute(duplicateNodes([nodeId])))}
      >
        Duplicate
      </button>
      {canFitParent && (
        <button
          type="button"
          role="menuitem"
          onClick={() => run(() => execute(fitParentToChildren(nodeId)))}
        >
          Fit parent
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        className="danger"
        onClick={() => run(() => execute(deleteNodes([nodeId])))}
      >
        Delete
      </button>
    </div>
  );
}
