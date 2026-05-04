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
  addSubtreeToCanvas,
  deleteNodes,
  duplicateNodes,
  fitParentToChildren,
  removeSubtreeFromCanvas,
} from "../../domain/commands/operations";
import {
  canvasChildrenOf,
  childrenOf,
  isNodeOnCanvas,
  ROOT_PARENT_ID,
  subtreeNodeIds,
  type CapabilityDocument,
  type NodeId,
} from "../../domain/document/types";
import { canMultiSelect } from "../../domain/selection/rules";
import { useDocumentStore } from "../../app/stores/documentStore";
import { useUiStore } from "../../app/stores/uiStore";
import { CATEGORY_STYLES } from "../heatmap/resolveNodeFill";

export function Outline({ readonly = false }: { readonly?: boolean }) {
  const doc = useDocumentStore((state) => state.doc);
  const execute = useDocumentStore((state) => state.execute);
  const selected = useUiStore((state) => state.selectedNodeIds);
  const setSelection = useUiStore((state) => state.setSelection);
  const setOutlineOpen = useUiStore((state) => state.setOutlineOpen);
  const viewport = useUiStore((state) => state.viewport);
  const canvasSize = useUiStore((state) => state.canvasSize);
  const searchQuery = useUiStore((state) => state.searchQuery);
  const setSearchQuery = useUiStore((state) => state.setSearchQuery);
  const [menuNodeId, setMenuNodeId] = useState<NodeId | null>(null);
  const [filterToSelection, setFilterToSelection] = useState(false);

  const rootItemId = "outline-root";
  const canvasTargetCenter = useMemo(
    () => ({
      x: (canvasSize.w / 2 - viewport.x) / viewport.zoom,
      y: (canvasSize.h / 2 - viewport.y) / viewport.zoom,
    }),
    [canvasSize.h, canvasSize.w, viewport.x, viewport.y, viewport.zoom],
  );
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

  useEffect(() => {
    if (selected.length === 0 && filterToSelection) setFilterToSelection(false);
  }, [filterToSelection, selected.length]);

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
          className={`cc-icon-btn ${filterToSelection ? "active" : ""}`}
          type="button"
          aria-label={
            filterToSelection
              ? "Show all outline capabilities"
              : "Show selected outline path"
          }
          aria-pressed={filterToSelection}
          disabled={selected.length === 0}
          onClick={() => setFilterToSelection((enabled) => !enabled)}
        >
          <Filter />
        </button>
        {!readonly && (
          <button
            className="cc-icon-btn active"
            type="button"
            aria-label="Add root capability"
            onClick={() =>
              execute(addRoot("New capability", { isOnCanvas: false }))
            }
          >
            <Plus />
          </button>
        )}
      </div>
      <div {...tree.getContainerProps()} className="cc-outline-tree">
        {tree
          .getItems()
          .filter((item) => item.getId() !== rootItemId)
          .filter((item) => {
            const nodeId = item.getId();
            const query = searchQuery.trim().toLowerCase();
            const matchesSearch =
              query.length === 0 ||
              (doc.nodesById[nodeId]?.label.toLowerCase().includes(query) ??
                false);
            return (
              matchesSearch &&
              matchesOutlineSelectionFilter(
                doc,
                nodeId,
                selected,
                filterToSelection,
              )
            );
          })
          .map((item) => {
            const node = doc.nodesById[item.getId()];
            if (!node) return null;
            const active = selected.includes(node.id);
            const style = CATEGORY_STYLES[node.color];
            const itemProps = item.getProps();
            const subtreeIds = subtreeNodeIds(doc, node.id);
            const hasHiddenCanvasNodes = subtreeIds.some(
              (id) => !isNodeOnCanvas(doc.nodesById[id]),
            );
            const hasVisibleCanvasNodes = subtreeIds.some((id) =>
              isNodeOnCanvas(doc.nodesById[id]),
            );
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
                {!readonly && (
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
                )}
                {!readonly && menuNodeId === node.id && (
                  <OutlineActionsMenu
                    nodeId={node.id}
                    canAddChild={!node.isTextLabel && node.type !== "text"}
                    canAddToCanvas={hasHiddenCanvasNodes}
                    canRemoveFromCanvas={hasVisibleCanvasNodes}
                    canFitParent={
                      isNodeOnCanvas(node) &&
                      canvasChildrenOf(doc, node.id).length > 0
                    }
                    canvasTargetCenter={canvasTargetCenter}
                    onClose={() => setMenuNodeId(null)}
                  />
                )}
              </div>
            );
          })}
      </div>
      {!readonly && (
        <div className="cc-outline-footer">
          <button
            className="cc-btn cc-add-root"
            type="button"
            onClick={() =>
              execute(addRoot("New capability", { isOnCanvas: false }))
            }
          >
            <Plus /> Add root capability
          </button>
        </div>
      )}
    </aside>
  );
}

function matchesOutlineSelectionFilter(
  doc: CapabilityDocument,
  nodeId: NodeId,
  selected: NodeId[],
  enabled: boolean,
) {
  if (!enabled) return true;
  if (selected.includes(nodeId)) return true;
  return selected.some(
    (selectedId) =>
      isAncestorOf(doc, nodeId, selectedId) ||
      isAncestorOf(doc, selectedId, nodeId),
  );
}

function isAncestorOf(
  doc: CapabilityDocument,
  ancestorId: NodeId,
  nodeId: NodeId,
) {
  let current = doc.nodesById[nodeId];
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true;
    current = doc.nodesById[current.parentId];
  }
  return false;
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
  canAddToCanvas,
  canRemoveFromCanvas,
  canFitParent,
  canvasTargetCenter,
  onClose,
}: {
  nodeId: NodeId;
  canAddChild: boolean;
  canAddToCanvas: boolean;
  canRemoveFromCanvas: boolean;
  canFitParent: boolean;
  canvasTargetCenter: { x: number; y: number };
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
          onClick={() =>
            run(() =>
              execute(addChild(nodeId, "New capability", { isOnCanvas: false })),
            )
          }
        >
          Add child
        </button>
      )}
      {canAddToCanvas && (
        <button
          type="button"
          role="menuitem"
          onClick={() =>
            run(() => execute(addSubtreeToCanvas(nodeId, canvasTargetCenter)))
          }
        >
          Add subtree to canvas
        </button>
      )}
      {canRemoveFromCanvas && (
        <button
          type="button"
          role="menuitem"
          onClick={() => run(() => execute(removeSubtreeFromCanvas(nodeId)))}
        >
          Remove subtree from canvas
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
