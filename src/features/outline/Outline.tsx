import {
  hotkeysCoreFeature,
  selectionFeature,
  syncDataLoaderFeature,
} from "@headless-tree/core";
import { useTree } from "@headless-tree/react";
import {
  ChevronsRight,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Filter,
  MoreHorizontal,
  Plus,
  Search,
} from "lucide-react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  addChild,
  addRoot,
  addSubtreeToCanvas,
  deleteNodes,
  duplicateNodes,
  fitParentToChildren,
  removeSubtreeFromCanvas,
  updateVisualNodeState,
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
import { resolveVisualDocument } from "../../domain/visual/workspace";
import { useDocumentStore } from "../../app/stores/documentStore";
import {
  MAX_OUTLINE_WIDTH,
  MIN_OUTLINE_WIDTH,
  clampOutlineWidth,
  useUiStore,
} from "../../app/stores/uiStore";
import { CATEGORY_STYLES } from "../heatmap/resolveNodeFill";

export function Outline({ readonly = false }: { readonly?: boolean }) {
  const doc = useDocumentStore((state) => state.doc);
  const viewDoc = useMemo(() => resolveVisualDocument(doc), [doc]);
  const execute = useDocumentStore((state) => state.execute);
  const selected = useUiStore((state) => state.selectedNodeIds);
  const setSelection = useUiStore((state) => state.setSelection);
  const setOutlineOpen = useUiStore((state) => state.setOutlineOpen);
  const outlineWidth = useUiStore((state) => state.outlineWidth);
  const setOutlineWidth = useUiStore((state) => state.setOutlineWidth);
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

  const startOutlineResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== undefined) return;
    event.preventDefault();
    event.stopPropagation();
    const workspace = event.currentTarget.closest(
      ".cc-workspace",
    ) as HTMLElement | null;
    const startClientX = event.clientX;
    const startWidth = outlineWidth;
    let nextWidth = startWidth;
    document.body.classList.add("cc-is-resizing-outline");

    const onMove = (move: PointerEvent) => {
      nextWidth = clampOutlineWidth(startWidth + move.clientX - startClientX);
      workspace?.style.setProperty("--cc-outline-width", `${nextWidth}px`);
    };

    const onEnd = () => {
      document.body.classList.remove("cc-is-resizing-outline");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      setOutlineWidth(nextWidth);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
  };

  const resizeOutlineFromKeyboard = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    const step = event.shiftKey ? 48 : 16;
    const keyWidths: Record<string, number> = {
      ArrowLeft: outlineWidth - step,
      ArrowRight: outlineWidth + step,
      Home: MIN_OUTLINE_WIDTH,
      End: MAX_OUTLINE_WIDTH,
    };
    if (!(event.key in keyWidths)) return;
    event.preventDefault();
    setOutlineWidth(keyWidths[event.key]!);
  };

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
            const viewNode = viewDoc.nodesById[node.id];
            const style = CATEGORY_STYLES[viewNode?.color ?? node.color];
            const itemProps = item.getProps();
            const subtreeIds = subtreeNodeIds(doc, node.id);
            const hasHiddenCanvasNodes = subtreeIds.some(
              (id) => !isNodeOnCanvas(viewDoc.nodesById[id]),
            );
            const hasVisibleCanvasNodes = subtreeIds.some((id) =>
              isNodeOnCanvas(viewDoc.nodesById[id]),
            );
            const activeViewState =
              doc.visual.viewsById[doc.visual.activeViewId]?.nodeStatesById[
                node.id
              ];
            const visibleInView = isNodeOnCanvas(viewNode);
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
                <span
                  className={`cc-tree-visibility ${visibleInView ? "visible" : "hidden"}`}
                  title={
                    visibleInView
                      ? "Visible in active view"
                      : "Hidden in active view"
                  }
                >
                  {visibleInView ? (
                    <Eye aria-label="Visible in active view" />
                  ) : (
                    <EyeOff aria-label="Hidden in active view" />
                  )}
                </span>
                {activeViewState?.isCollapsed && (
                  <span
                    className="cc-tree-visibility collapsed"
                    title="Collapsed in active view"
                  >
                    <ChevronsRight aria-label="Collapsed in active view" />
                  </span>
                )}
                {viewDoc.heatmap.enabled && node.heatmapValue !== undefined && (
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
                    viewId={doc.visual.activeViewId}
                    canAddChild={!node.isTextLabel && node.type !== "text"}
                    canAddToCanvas={hasHiddenCanvasNodes}
                    canRemoveFromCanvas={hasVisibleCanvasNodes}
                    isCollapsed={!!activeViewState?.isCollapsed}
                    canFitParent={
                      isNodeOnCanvas(viewDoc.nodesById[node.id]) &&
                      canvasChildrenOf(viewDoc, node.id).length > 0
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
      <div
        className="cc-outline-resize-handle"
        role="separator"
        aria-label="Resize outline"
        aria-orientation="vertical"
        aria-valuemin={MIN_OUTLINE_WIDTH}
        aria-valuemax={MAX_OUTLINE_WIDTH}
        aria-valuenow={outlineWidth}
        tabIndex={0}
        onPointerDown={startOutlineResize}
        onKeyDown={resizeOutlineFromKeyboard}
      />
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
  viewId,
  canAddChild,
  canAddToCanvas,
  canRemoveFromCanvas,
  isCollapsed,
  canFitParent,
  canvasTargetCenter,
  onClose,
}: {
  nodeId: NodeId;
  viewId: string;
  canAddChild: boolean;
  canAddToCanvas: boolean;
  canRemoveFromCanvas: boolean;
  isCollapsed: boolean;
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
              execute(
                addChild(nodeId, "New capability", { isOnCanvas: false }),
              ),
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
        onClick={() =>
          run(() =>
            execute(
              updateVisualNodeState(viewId, nodeId, {
                isCollapsed: !isCollapsed,
              }),
            ),
          )
        }
      >
        {isCollapsed ? "Expand in view" : "Collapse in view"}
      </button>
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
