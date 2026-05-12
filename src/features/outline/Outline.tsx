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
  RefObject,
  ReactNode,
  KeyboardEventHandler,
} from "react";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  addChild,
  addRoot,
  addSubtreeToCanvas,
  duplicateNodes,
  fitParentToChildren,
  removeSubtreeFromCanvas,
  updateVisualNodeState,
} from "../../domain/commands/operations";
import {
  buildSafeChildrenByParentId,
  canvasChildrenOf,
  isHierarchyAncestorOf,
  isNodeOnCanvas,
  ROOT_PARENT_ID,
  subtreeNodeIds,
  type CapabilityDocument,
  type NodeId,
} from "../../domain/document/types";
import { resolveToggleSelection } from "../../domain/selection/rules";
import {
  searchOutline,
  type OutlineSearchMatch,
} from "../../domain/search/outlineSearch";
import {
  getActiveViewNodeContexts,
  type ActiveViewNodeContext,
} from "../../domain/visual/viewStatus";
import { useActiveVisualState } from "../../app/activeVisualState";
import { useDocumentStore } from "../../app/stores/documentStore";
import {
  MAX_OUTLINE_WIDTH,
  MIN_OUTLINE_WIDTH,
  clampOutlineWidth,
  type ViewportState,
  useUiStore,
} from "../../app/stores/uiStore";
import { focusNodeInViewport } from "../canvas/viewport";
import {
  categoryStyle,
  swatchBackgroundForFill,
} from "../heatmap/resolveNodeFill";
import { useDismissableLayer, useMenuKeyboardNavigation } from "../shared/a11y";
import { useModelDeleteConfirmation } from "../shared/useModelDeleteConfirmation";

export function Outline({
  readonly = false,
  displayDoc,
  onViewportChange,
}: {
  readonly?: boolean;
  displayDoc?: CapabilityDocument;
  onViewportChange?: (viewport: ViewportState) => void;
}) {
  const storeDoc = useDocumentStore((state) => state.doc);
  const doc = displayDoc ?? storeDoc;
  const {
    visualDocument: viewDoc,
    activeView,
    activeViewId,
  } = useActiveVisualState({ doc });
  const execute = useDocumentStore((state) => state.execute);
  const setActiveViewViewport = useDocumentStore(
    (state) => state.setActiveViewViewport,
  );
  const selected = useUiStore((state) => state.selectedNodeIds);
  const setSelection = useUiStore((state) => state.setSelection);
  const setOutlineOpen = useUiStore((state) => state.setOutlineOpen);
  const outlineWidth = useUiStore((state) => state.outlineWidth);
  const setOutlineWidth = useUiStore((state) => state.setOutlineWidth);
  const viewport = useUiStore((state) => state.viewport);
  const setViewport = useUiStore((state) => state.setViewport);
  const canvasSize = useUiStore((state) => state.canvasSize);
  const searchQuery = useUiStore((state) => state.searchQuery);
  const setSearchQuery = useUiStore((state) => state.setSearchQuery);
  const [menuNodeId, setMenuNodeId] = useState<NodeId | null>(null);
  const [filterToSelection, setFilterToSelection] = useState(false);
  const searchCursorIndexRef = useRef(-1);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLElement | null>(null);
  const { requestDeleteFromModel, deleteFromModelDialog } =
    useModelDeleteConfirmation(doc);
  const safeChildrenByParentId = useMemo(
    () => buildSafeChildrenByParentId(doc).childrenByParentId,
    [doc],
  );
  const searchResult = useMemo(
    () => searchOutline(doc, searchQuery),
    [doc, searchQuery],
  );
  const searchActive = searchResult.normalizedQuery.length > 0;
  const searchMatchIds = useMemo(
    () => new Set(searchResult.matchingNodeIds),
    [searchResult.matchingNodeIds],
  );
  const activeViewContexts = useMemo(
    () => getActiveViewNodeContexts(doc, activeViewId),
    [activeViewId, doc],
  );

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
      Object.keys(doc.nodesById).filter(
        (id) => (safeChildrenByParentId[id] ?? []).length > 0,
      ),
    [doc.nodesById, safeChildrenByParentId],
  );
  const knownFolderIds = useRef(new Set(folderIds));
  const [expandedItems, setExpandedItems] = useState(folderIds);
  const structureSignature = useMemo(
    () =>
      Object.entries(safeChildrenByParentId)
        .map(([parentId, childIds]) => `${parentId}:${childIds.join(",")}`)
        .sort()
        .join("|"),
    [safeChildrenByParentId],
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

  useEffect(() => {
    searchCursorIndexRef.current = -1;
  }, [searchResult.normalizedQuery]);

  useEffect(() => {
    if (!searchActive || searchResult.ancestorNodeIds.size === 0) return;
    setExpandedItems((previous) => {
      const next = [...previous];
      for (const nodeId of searchResult.ancestorNodeIds) {
        if ((safeChildrenByParentId[nodeId] ?? []).length === 0) continue;
        if (!next.includes(nodeId)) next.push(nodeId);
      }
      return arraysEqual(previous, next) ? previous : next;
    });
  }, [safeChildrenByParentId, searchActive, searchResult.ancestorNodeIds]);

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
      return id === rootItemId || (safeChildrenByParentId[id] ?? []).length > 0;
    },
    dataLoader: {
      getItem: (itemId) => itemId,
      getChildren: (itemId) =>
        itemId === rootItemId
          ? (safeChildrenByParentId[ROOT_PARENT_ID] ?? [])
          : (safeChildrenByParentId[itemId] ?? []),
    },
    features: [syncDataLoaderFeature, selectionFeature, hotkeysCoreFeature],
  });

  useEffect(() => {
    tree.rebuildTree();
  }, [structureSignature, tree]);

  useEffect(() => {
    if (selected.length === 0 && filterToSelection) setFilterToSelection(false);
  }, [filterToSelection, selected.length]);

  const {
    closeAndRestoreFocus: closeOutlineMenuAndRestoreFocus,
    handleMenuKeyDown: handleOutlineMenuKeyDown,
  } = useMenuKeyboardNavigation({
    open: menuNodeId !== null,
    menuRef,
    triggerRef: menuTriggerRef,
    onClose: () => setMenuNodeId(null),
  });

  useDismissableLayer({
    open: menuNodeId !== null,
    refs: [menuRef, menuTriggerRef],
    onDismiss: (reason) => {
      if (reason === "escape") closeOutlineMenuAndRestoreFocus();
      else setMenuNodeId(null);
    },
  });

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

  const focusNode = useCallback(
    (nodeId: NodeId) => {
      const node = viewDoc.nodesById[nodeId];
      if (!node || !isNodeOnCanvas(node)) return;
      const nextViewport = focusNodeInViewport(node, viewport, canvasSize);
      setViewport(nextViewport);
      if (onViewportChange) {
        onViewportChange(nextViewport);
      } else if (!readonly) {
        setActiveViewViewport(nextViewport);
      }
    },
    [
      canvasSize,
      onViewportChange,
      readonly,
      setActiveViewViewport,
      setViewport,
      viewDoc.nodesById,
      viewport,
    ],
  );

  const selectNode = useCallback(
    (nodeId: NodeId, shouldToggle: boolean) => {
      if (shouldToggle) {
        toggleOutlineSelection(doc, nodeId);
        return;
      }
      setSelection([nodeId]);
      focusNode(nodeId);
    },
    [doc, focusNode, setSelection],
  );

  const jumpSearchResult = useCallback(
    (direction: 1 | -1) => {
      if (searchResult.matchingNodeIds.length === 0) return;
      const length = searchResult.matchingNodeIds.length;
      const current = searchCursorIndexRef.current;
      const nextIndex =
        current < 0
          ? direction === 1
            ? 0
            : length - 1
          : (current + direction + length) % length;
      searchCursorIndexRef.current = nextIndex;
      const nodeId = searchResult.matchingNodeIds[nextIndex];
      if (nodeId) {
        setSelection([nodeId]);
        focusNode(nodeId);
      }
    },
    [focusNode, searchResult.matchingNodeIds, setSelection],
  );

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
            onKeyDown={(event) => {
              if (event.key === "Escape" && searchQuery.length > 0) {
                event.preventDefault();
                setSearchQuery("");
                return;
              }
              if (event.key === "Enter" && searchActive) {
                event.preventDefault();
                jumpSearchResult(event.shiftKey ? -1 : 1);
              }
            }}
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
            const matchesSearch =
              !searchActive || searchResult.visibleNodeIds.has(nodeId);
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
            const style = categoryStyle(
              viewNode?.color ?? node.color,
              viewDoc.settings.colorPalette,
            );
            const itemProps = item.getProps();
            const subtreeIds = subtreeNodeIds(doc, node.id);
            const hasHiddenCanvasNodes = subtreeIds.some(
              (id) => !isNodeOnCanvas(viewDoc.nodesById[id]),
            );
            const hasVisibleCanvasNodes = subtreeIds.some((id) =>
              isNodeOnCanvas(viewDoc.nodesById[id]),
            );
            const activeViewState = activeView.nodeStatesById[node.id];
            const viewContext = activeViewContexts[node.id];
            const visibleInView = viewContext?.visibility === "visible";
            const collapsedAncestor = viewContext?.collapsedAncestorId
              ? doc.nodesById[viewContext.collapsedAncestorId]
              : undefined;
            const searchMatches = searchResult.matchesByNodeId[node.id] ?? [];
            const isSearchMatch = searchMatchIds.has(node.id);
            return (
              <div
                {...itemProps}
                key={node.id}
                className={`cc-tree-row ${active ? "active" : ""} ${
                  isSearchMatch ? "search-match" : ""
                } ${searchActive && !isSearchMatch ? "search-context" : ""}`}
                aria-label={outlineRowAriaLabel(
                  node.label,
                  active,
                  viewDoc.heatmap.enabled,
                  node.heatmapValue,
                  visibilityLabel(viewContext, collapsedAncestor?.label),
                )}
                aria-selected={active}
                style={{
                  paddingLeft: `${8 + item.getItemMeta().level * 14}px`,
                }}
                onClick={(event) => {
                  itemProps.onClick?.(event);
                  selectNode(
                    node.id,
                    event.ctrlKey || event.metaKey || event.shiftKey,
                  );
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
                  style={{
                    color: style.isTransparent
                      ? "var(--cc-slate-400)"
                      : style.border,
                    background: swatchBackgroundForFill(style),
                    borderColor: style.isTransparent
                      ? "var(--cc-slate-400)"
                      : style.border,
                  }}
                />
                <span className="cc-tree-text">
                  <span className="cc-tree-label">
                    <HighlightedText
                      text={node.label}
                      matches={searchMatches.filter(
                        (match) => match.field === "label",
                      )}
                    />
                  </span>
                  {searchActive && isSearchMatch && (
                    <>
                      <span className="cc-tree-path">
                        {formatSearchPath(
                          searchResult.pathLabelsByNodeId[node.id],
                        )}
                      </span>
                      <SearchHitSummary matches={searchMatches} />
                    </>
                  )}
                </span>
                <span
                  className={`cc-tree-visibility ${visibilityClass(viewContext)}`}
                  title={visibilityLabel(viewContext, collapsedAncestor?.label)}
                >
                  {visibleInView ? (
                    <Eye aria-label="Visible in active view" />
                  ) : (
                    <EyeOff aria-label={visibilityLabel(viewContext)} />
                  )}
                </span>
                {viewContext?.isCollapsed && (
                  <span
                    className="cc-tree-visibility collapsed"
                    title="Collapsed in active view"
                  >
                    <ChevronsRight aria-label="Collapsed in active view" />
                  </span>
                )}
                {searchActive && isSearchMatch && !readonly && (
                  <SearchResultAction
                    nodeId={node.id}
                    nodeLabel={node.label}
                    viewId={activeViewId}
                    viewContext={viewContext}
                    collapsedAncestorLabel={collapsedAncestor?.label}
                    canvasTargetCenter={canvasTargetCenter}
                    onAfterAction={() => setSelection([node.id])}
                  />
                )}
                {viewDoc.heatmap.enabled &&
                  viewDoc.heatmap.showValuePills &&
                  node.heatmapValue !== undefined && (
                    <span
                      className="cc-tree-score"
                      aria-label={`Heatmap score ${node.heatmapValue.toFixed(2)}`}
                    >
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
                      menuTriggerRef.current = event.currentTarget;
                      setMenuNodeId(menuNodeId === node.id ? null : node.id);
                    }}
                  >
                    <MoreHorizontal size={14} />
                  </button>
                )}
                {!readonly && menuNodeId === node.id && (
                  <OutlineActionsMenu
                    nodeId={node.id}
                    viewId={activeViewId}
                    canAddChild={!node.isTextLabel && node.type !== "text"}
                    canAddToCanvas={hasHiddenCanvasNodes}
                    canRemoveFromCanvas={hasVisibleCanvasNodes}
                    isCollapsed={!!activeViewState?.isCollapsed}
                    canFitParent={
                      isNodeOnCanvas(viewDoc.nodesById[node.id]) &&
                      canvasChildrenOf(viewDoc, node.id).length > 0
                    }
                    canvasTargetCenter={canvasTargetCenter}
                    menuRef={menuRef}
                    onMenuKeyDown={handleOutlineMenuKeyDown}
                    requestDeleteFromModel={requestDeleteFromModel}
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
      {deleteFromModelDialog}
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
      isHierarchyAncestorOf(doc, nodeId, selectedId) ||
      isHierarchyAncestorOf(doc, selectedId, nodeId),
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
  const resolution = resolveToggleSelection(doc, ui.selectedNodeIds, nodeId);
  ui.setSelection(resolution.nodeIds);
  if (resolution.reason) ui.showSelectionNotice(resolution.reason);
}

function formatSearchPath(pathLabels: string[] | undefined): string {
  const parentLabels = pathLabels?.slice(0, -1) ?? [];
  return parentLabels.length > 0 ? parentLabels.join(" > ") : "Top level";
}

function SearchHitSummary({ matches }: { matches: OutlineSearchMatch[] }) {
  const match =
    matches.find((item) => item.field !== "label") ?? matches[0] ?? null;
  if (!match || match.field === "label") return null;
  const label =
    match.field === "id"
      ? "ID"
      : match.field === "description"
        ? "Description"
        : "Metadata";
  return (
    <span className="cc-tree-search-hit">
      {label}: <HighlightedText text={match.value} matches={[match]} />
    </span>
  );
}

function HighlightedText({
  text,
  matches,
}: {
  text: string;
  matches: OutlineSearchMatch[];
}) {
  if (matches.length === 0) return <>{text}</>;
  const ranges = mergeRanges(
    matches
      .map((match) => match.range)
      .filter((range) => range.start >= 0 && range.end <= text.length),
  );
  if (ranges.length === 0) return <>{text}</>;

  const parts: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    if (range.start > cursor) {
      parts.push(
        <Fragment key={`text-${index}`}>
          {text.slice(cursor, range.start)}
        </Fragment>,
      );
    }
    parts.push(
      <mark className="cc-search-highlight" key={`mark-${index}`}>
        {text.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  });
  if (cursor < text.length) {
    parts.push(<Fragment key="tail">{text.slice(cursor)}</Fragment>);
  }
  return <>{parts}</>;
}

function mergeRanges(ranges: Array<{ start: number; end: number }>) {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Array<{ start: number; end: number }> = [];
  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (!previous || range.start > previous.end) {
      merged.push({ ...range });
      continue;
    }
    previous.end = Math.max(previous.end, range.end);
  }
  return merged;
}

function visibilityClass(context: ActiveViewNodeContext | undefined): string {
  if (context?.visibility === "visible") return "visible";
  if (context?.visibility === "outside-active-view") return "outside";
  return "hidden";
}

function visibilityLabel(
  context: ActiveViewNodeContext | undefined,
  collapsedAncestorLabel?: string,
): string {
  if (context?.visibility === "visible") return "Visible in active view";
  if (context?.collapsedAncestorId) {
    return collapsedAncestorLabel
      ? `Hidden by collapsed ${collapsedAncestorLabel}`
      : "Hidden by collapsed ancestor";
  }
  if (context?.visibility === "outside-active-view")
    return "Outside active view";
  return "Hidden in active view";
}

function outlineRowAriaLabel(
  label: string,
  selected: boolean,
  heatmapEnabled: boolean,
  heatmapValue: number | undefined,
  visibility: string,
): string {
  const score = heatmapEnabled
    ? heatmapValue === undefined
      ? "No score"
      : `Score ${heatmapValue.toFixed(2)}`
    : null;
  return [label, selected ? "selected" : "not selected", visibility, score]
    .filter(Boolean)
    .join(", ");
}

function SearchResultAction({
  nodeId,
  nodeLabel,
  viewId,
  viewContext,
  collapsedAncestorLabel,
  canvasTargetCenter,
  onAfterAction,
}: {
  nodeId: NodeId;
  nodeLabel: string;
  viewId: string;
  viewContext: ActiveViewNodeContext | undefined;
  collapsedAncestorLabel?: string;
  canvasTargetCenter: { x: number; y: number };
  onAfterAction: () => void;
}) {
  const execute = useDocumentStore((state) => state.execute);
  if (!viewContext || viewContext.visibility === "visible") return null;
  if (viewContext.collapsedAncestorId) {
    return (
      <button
        className="cc-tree-result-action"
        type="button"
        aria-label={`Expand ${
          collapsedAncestorLabel ?? "collapsed ancestor"
        } in active view to show ${nodeLabel}`}
        onClick={(event) => {
          event.stopPropagation();
          execute(
            updateVisualNodeState(viewId, viewContext.collapsedAncestorId!, {
              isCollapsed: false,
            }),
          );
          onAfterAction();
        }}
      >
        Expand in active view
      </button>
    );
  }
  return (
    <button
      className="cc-tree-result-action"
      type="button"
      aria-label={`Add ${nodeLabel} to active view`}
      onClick={(event) => {
        event.stopPropagation();
        execute(addSubtreeToCanvas(nodeId, canvasTargetCenter));
        onAfterAction();
      }}
    >
      Add to active view
    </button>
  );
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
  menuRef,
  onMenuKeyDown,
  requestDeleteFromModel,
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
  menuRef: RefObject<HTMLDivElement | null>;
  onMenuKeyDown: KeyboardEventHandler<HTMLDivElement>;
  requestDeleteFromModel: (nodeIds: NodeId[]) => void;
  onClose: () => void;
}) {
  const execute = useDocumentStore((state) => state.execute);
  const run = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="cc-outline-menu"
      role="menu"
      aria-label="Capability actions"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={onMenuKeyDown}
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
          Add subtree to active view
        </button>
      )}
      {canRemoveFromCanvas && (
        <button
          type="button"
          role="menuitem"
          onClick={() => run(() => execute(removeSubtreeFromCanvas(nodeId)))}
        >
          Remove subtree from active view
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
        onClick={() => run(() => requestDeleteFromModel([nodeId]))}
      >
        Delete from model
      </button>
    </div>
  );
}
