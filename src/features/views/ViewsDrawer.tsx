import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  LayoutTemplate,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createVisualView,
  deleteVisualView,
  duplicateVisualView,
  renameVisualView,
  reorderVisualViews,
  resetVisualViewLayout,
  resetVisualViewVisibility,
  resetVisualViewFromTemplate,
  setDefaultVisualView,
} from "../../domain/commands/operations";
import type {
  CapabilityDocument,
  NodeId,
  VisualView,
  VisualViewId,
} from "../../domain/document/types";
import {
  buildSafeChildrenByParentId,
  ROOT_PARENT_ID,
} from "../../domain/document/types";
import {
  BUILT_IN_VIEW_TEMPLATES,
  templateById,
  type VisualTemplateId,
} from "../../domain/visual/templates";
import { resolveVisualDocument } from "../../domain/visual/workspace";
import {
  summarizeVisualView,
  type VisualViewSummary,
} from "../../domain/visual/viewSummary";
import { useDocumentStore } from "../../app/stores/documentStore";
import { useUiStore } from "../../app/stores/uiStore";
import { CommitTextInput } from "../shared/CommitTextInput";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import { IconButton } from "../shared/IconButton";

interface ConfirmRequest {
  title: string;
  body: string;
  confirmLabel: string;
  tone?: "default" | "danger";
  onConfirm: () => void;
}

const VIEW_ROW_MENU_GAP = 6;
const VIEW_ROW_MENU_PADDING = 8;
const VIEW_ROW_MENU_MAX_HEIGHT = 320;

export function ViewsDrawer() {
  const doc = useDocumentStore((state) => state.doc);
  const execute = useDocumentStore((state) => state.execute);
  const setActiveVisualView = useDocumentStore(
    (state) => state.setActiveVisualView,
  );
  const open = useUiStore((state) => state.activeDrawer === "views");
  const setActiveDrawer = useUiStore((state) => state.setActiveDrawer);
  const viewport = useUiStore((state) => state.viewport);
  const setViewport = useUiStore((state) => state.setViewport);
  const selected = useUiStore((state) => state.selectedNodeIds);
  const setSelection = useUiStore((state) => state.setSelection);
  const showSelectionNotice = useUiStore(
    (state) => state.showSelectionNotice,
  );
  const [createName, setCreateName] = useState("");
  const [templateId, setTemplateId] =
    useState<VisualTemplateId>("full-model-default@1");
  const [createRootId, setCreateRootId] = useState<NodeId>("");
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(
    null,
  );
  const orderedViews = doc.visual.viewOrder
    .map((viewId) => doc.visual.viewsById[viewId])
    .filter(Boolean);
  const hasMultipleViews = orderedViews.length > 1;
  const activeView = doc.visual.viewsById[doc.visual.activeViewId];
  const selectedTemplate = templateById(templateId);
  const rootTargets = useMemo(() => orderedRootTargets(doc), [doc]);
  const defaultDeepDiveRootId =
    rootIdForTemplate(doc, "domain-deep-dive@1", selected) ??
    rootTargets[0]?.id ??
    "";

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (document.querySelector(".cc-view-row-menu")) return;
      if (event.key === "Escape") setActiveDrawer(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, setActiveDrawer]);

  useEffect(() => {
    if (templateId !== "domain-deep-dive@1") return;
    if (createRootId && doc.nodesById[createRootId]) return;
    setCreateRootId(defaultDeepDiveRootId);
  }, [createRootId, defaultDeepDiveRootId, doc.nodesById, templateId]);

  if (!open) return null;

  const syncUiForView = (nextDoc: CapabilityDocument, viewId: VisualViewId) => {
    const nextView = nextDoc.visual.viewsById[viewId];
    if (nextView?.viewport) setViewport(nextView.viewport);
    const resolved = resolveVisualDocument(nextDoc, viewId);
    const nextSelection = selected.filter(
      (nodeId) => resolved.nodesById[nodeId]?.isOnCanvas,
    );
    if (nextSelection.length !== selected.length) {
      setSelection(nextSelection);
      showSelectionNotice(
        "Selection adjusted because selected capabilities are hidden in this view.",
      );
    }
  };

  const switchToView = (viewId: string) => {
    setActiveVisualView(viewId, { previousViewport: viewport });
    const nextDoc = useDocumentStore.getState().doc;
    syncUiForView(nextDoc, viewId);
  };

  const createAndSwitch = () => {
    const rootId =
      templateId === "domain-deep-dive@1"
        ? createRootId || defaultDeepDiveRootId
        : undefined;
    execute(
      createVisualView({
        name: normalizeCreateName(createName, selectedTemplate.name),
        templateId,
        rootId,
      }),
    );
    const nextDoc = useDocumentStore.getState().doc;
    syncUiForView(nextDoc, nextDoc.visual.activeViewId);
    setCreateName("");
  };

  const moveView = (viewId: string, direction: -1 | 1) => {
    const index = doc.visual.viewOrder.indexOf(viewId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= doc.visual.viewOrder.length)
      return;
    const order = [...doc.visual.viewOrder];
    const [item] = order.splice(index, 1);
    if (!item) return;
    order.splice(nextIndex, 0, item);
    execute(reorderVisualViews(order));
  };

  return (
    <aside className="cc-views-drawer" aria-label="Views">
      <div className="cc-export-head">
        <div className="cc-panel-title">Views</div>
        <IconButton
          icon={X}
          label="Close views"
          onClick={() => setActiveDrawer(null)}
        />
      </div>
      <div className="cc-export-body">
        <section className="cc-settings-section">
          <div className="cc-section-heading">
            <Eye size={16} />
            <span>Active View</span>
          </div>
          <div className="cc-active-view-card">
            <div className="cc-active-view-summary">
              <strong>{activeView?.name}</strong>
              {activeView ? (
                <p className="cc-view-description">
                  {descriptionForView(activeView, doc)}
                </p>
              ) : null}
            </div>
            <span className="cc-active-view-count">
              {orderedViews.length} view{orderedViews.length === 1 ? "" : "s"}
            </span>
          </div>
        </section>

        <section className="cc-settings-section">
          <div className="cc-section-heading">
            <Plus size={16} />
            <span>Create View</span>
          </div>
          <div className="cc-view-create-form">
            <label className="cc-field">
              <span>View name</span>
              <input
                className="cc-input"
                aria-label="New view name"
                value={createName}
                placeholder={selectedTemplate.name}
                onChange={(event) => setCreateName(event.target.value)}
              />
            </label>
            <label className="cc-field">
              <span>Template</span>
              <select
                className="cc-select"
                aria-label="View template"
                value={templateId}
                onChange={(event) =>
                  setTemplateId(event.target.value as VisualTemplateId)
                }
              >
                {BUILT_IN_VIEW_TEMPLATES.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
            {templateId === "domain-deep-dive@1" && (
              <label className="cc-field cc-view-root-field">
                <span>Root target</span>
                <select
                  className="cc-select"
                  aria-label="Deep-dive root target"
                  value={createRootId || defaultDeepDiveRootId}
                  onChange={(event) => setCreateRootId(event.target.value)}
                >
                  {rootTargets.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.path}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="cc-view-create-footer">
            <p className="cc-view-template-description">
              {createDescriptionPreview(
                selectedTemplate.description,
                templateId,
                doc,
                createRootId || defaultDeepDiveRootId,
              )}
            </p>
            <button
              className="cc-btn cc-btn-primary cc-view-create-action"
              type="button"
              disabled={
                templateId === "domain-deep-dive@1" &&
                rootTargets.length === 0
              }
              onClick={createAndSwitch}
            >
              <Plus /> Create and switch
            </button>
          </div>
        </section>

        <section className="cc-settings-section cc-view-manage-section">
          <div className="cc-section-heading">
            <Eye size={16} />
            <span>Manage Views</span>
          </div>
          <div className="cc-view-list">
            {orderedViews.map((view, index) => (
              <ViewRow
                key={view.id}
                doc={doc}
                execute={execute}
                hasMultipleViews={hasMultipleViews}
                index={index}
                isDefault={view.id === doc.visual.defaultViewId}
                isActive={view.id === doc.visual.activeViewId}
                moveView={moveView}
                orderedViewsLength={orderedViews.length}
                setConfirmRequest={setConfirmRequest}
                syncUiForActiveView={() => {
                  const nextDoc = useDocumentStore.getState().doc;
                  syncUiForView(nextDoc, nextDoc.visual.activeViewId);
                }}
                switchToView={switchToView}
                summary={summarizeVisualView(doc, view.id)}
                view={view}
              />
            ))}
          </div>
        </section>
      </div>
      {confirmRequest && (
        <ConfirmDialog
          title={confirmRequest.title}
          body={confirmRequest.body}
          confirmLabel={confirmRequest.confirmLabel}
          tone={confirmRequest.tone}
          onCancel={() => setConfirmRequest(null)}
          onConfirm={() => {
            const action = confirmRequest.onConfirm;
            setConfirmRequest(null);
            action();
          }}
        />
      )}
    </aside>
  );
}

function ViewRow({
  doc,
  execute,
  hasMultipleViews,
  index,
  isActive,
  isDefault,
  moveView,
  orderedViewsLength,
  setConfirmRequest,
  syncUiForActiveView,
  switchToView,
  summary,
  view,
}: {
  doc: CapabilityDocument;
  execute: ReturnType<typeof useDocumentStore.getState>["execute"];
  hasMultipleViews: boolean;
  index: number;
  isActive: boolean;
  isDefault: boolean;
  moveView: (viewId: string, direction: -1 | 1) => void;
  orderedViewsLength: number;
  setConfirmRequest: (request: ConfirmRequest) => void;
  syncUiForActiveView: () => void;
  switchToView: (viewId: string) => void;
  summary: VisualViewSummary | null;
  view: VisualView;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    right: number;
    maxHeight: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuAnchorRef = useRef<HTMLDivElement>(null);
  const viewTemplateId = summary?.templateId ?? templateIdForView(view);
  const templateName = summary?.templateName ?? templateById(viewTemplateId).name;
  const fullChanged = summary?.fullChanged ?? false;
  const layoutChanged = summary?.layoutChanged ?? false;

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        menuRef.current?.contains(event.target)
      )
        return;
      setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    const closeOnResize = () => setMenuOpen(false);
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", closeOnResize);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", closeOnResize);
    };
  }, [menuOpen]);

  const toggleMenu = () => {
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }
    const rect = menuAnchorRef.current?.getBoundingClientRect();
    if (!rect) {
      setMenuPosition({
        top: VIEW_ROW_MENU_PADDING,
        right: VIEW_ROW_MENU_PADDING,
        maxHeight: Math.max(
          1,
          Math.min(
            VIEW_ROW_MENU_MAX_HEIGHT,
            window.innerHeight - VIEW_ROW_MENU_PADDING * 2,
          ),
        ),
      });
      setMenuOpen(true);
      return;
    }
    const availableBelow = Math.max(
      0,
      window.innerHeight -
        rect.bottom -
        VIEW_ROW_MENU_GAP -
        VIEW_ROW_MENU_PADDING,
    );
    const availableAbove = Math.max(
      0,
      rect.top - VIEW_ROW_MENU_GAP - VIEW_ROW_MENU_PADDING,
    );
    const openAbove =
      availableBelow < VIEW_ROW_MENU_MAX_HEIGHT &&
      availableAbove > availableBelow;
    const availableHeight = openAbove ? availableAbove : availableBelow;
    const maxHeight = Math.max(
      1,
      Math.min(VIEW_ROW_MENU_MAX_HEIGHT, availableHeight),
    );

    setMenuPosition(
      {
        top: openAbove
          ? Math.max(
              VIEW_ROW_MENU_PADDING,
              rect.top - VIEW_ROW_MENU_GAP - maxHeight,
            )
          : rect.bottom + VIEW_ROW_MENU_GAP,
        right: Math.max(VIEW_ROW_MENU_PADDING, window.innerWidth - rect.right),
        maxHeight,
      },
    );
    setMenuOpen(true);
  };

  const duplicateView = () => {
    execute(duplicateVisualView(view.id));
    syncUiForActiveView();
    setMenuOpen(false);
  };

  const confirmAndSync = (request: Omit<ConfirmRequest, "onConfirm"> & {
    onConfirm: () => void;
  }) => {
    setMenuOpen(false);
    setConfirmRequest({
      ...request,
      onConfirm: () => {
        request.onConfirm();
        syncUiForActiveView();
      },
    });
  };

  return (
    <div className={`cc-view-row ${isActive ? "active" : ""}`}>
      <button
        className="cc-view-use"
        type="button"
        aria-label={`Use ${view.name}`}
        aria-current={isActive ? "true" : undefined}
        onClick={() => switchToView(view.id)}
      >
        <Eye />
      </button>
      <div className="cc-view-details">
        <CommitTextInput
          className="cc-input"
          aria-label={`Name for ${view.name}`}
          value={view.name}
          normalize={normalizeViewName}
          onCommit={(name) => execute(renameVisualView(view.id, name))}
        />
        <div className="cc-view-meta" aria-label={`Summary for ${view.name}`}>
          {isActive && <span className="cc-view-badge active">Active</span>}
          {isDefault && <span className="cc-view-badge">Default</span>}
          <span>{templateName}</span>
          <span>{summary?.visibleNodeCount ?? 0} visible</span>
          <span>{viewChangeLabel(fullChanged, layoutChanged)}</span>
          <span>{formatUpdatedAt(summary?.updatedAt ?? view.updatedAt)}</span>
        </div>
        <p className="cc-view-description">{descriptionForView(view, doc)}</p>
      </div>
      <div className="cc-view-row-actions">
        <IconButton
          icon={Copy}
          label={`Duplicate visual state for ${view.name}`}
          tooltip="Duplicate visual state only"
          onClick={duplicateView}
        />
        <div ref={menuRef} className="cc-view-row-menu-wrap">
          <div ref={menuAnchorRef}>
            <IconButton
              icon={MoreHorizontal}
              label={`View actions for ${view.name}`}
              active={menuOpen}
              onClick={toggleMenu}
            />
          </div>
          {menuOpen && menuPosition && (
            <div
              className="cc-view-row-menu"
              role="menu"
              aria-label={`Actions for ${view.name}`}
              style={{
                top: menuPosition.top,
                right: menuPosition.right,
                maxHeight: menuPosition.maxHeight,
              }}
            >
              <button
                type="button"
                role="menuitem"
                disabled={index === 0}
                onClick={() => {
                  moveView(view.id, -1);
                  setMenuOpen(false);
                }}
              >
                <ArrowUp /> <span>Move up</span>
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={index === orderedViewsLength - 1}
                onClick={() => {
                  moveView(view.id, 1);
                  setMenuOpen(false);
                }}
              >
                <ArrowDown /> <span>Move down</span>
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={isDefault}
                onClick={() => {
                  execute(setDefaultVisualView(view.id));
                  setMenuOpen(false);
                }}
              >
                <Star /> <span>Set as default</span>
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!layoutChanged}
                onClick={() =>
                  confirmAndSync({
                    title: "Reset layout",
                    body: `Reset layout for "${view.name}"? This discards positions, sizes, layout mode, and layout preservation for this view. Visibility, collapse state, heatmap, export settings, and the view name are preserved.`,
                    confirmLabel: "Reset layout",
                    onConfirm: () => execute(resetVisualViewLayout(view.id)),
                  })
                }
              >
                <RotateCcw /> <span>Reset layout</span>
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!fullChanged}
                onClick={() =>
                  confirmAndSync({
                    title: "Reset visibility and collapse",
                    body: `Reset visibility and collapse state for "${view.name}" from the ${templateName} template? Layout positions, heatmap settings, export settings, and the source model are preserved.`,
                    confirmLabel: "Reset visibility",
                    onConfirm: () => execute(resetVisualViewVisibility(view.id)),
                  })
                }
              >
                <Eye /> <span>Reset visibility/collapse</span>
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!fullChanged}
                onClick={() =>
                  confirmAndSync({
                    title: "Reset from template",
                    body: `Reset "${view.name}" to the ${templateName} template? This discards layout, visibility, collapse state, heatmap view settings, and export view settings for this view. The source model and the view name are preserved.`,
                    confirmLabel: "Reset view",
                    onConfirm: () =>
                      execute(resetVisualViewFromTemplate(view.id, viewTemplateId)),
                  })
                }
              >
                <LayoutTemplate /> <span>Reset from template</span>
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!hasMultipleViews}
                title={
                  hasMultipleViews
                    ? undefined
                    : "At least one visual view is required."
                }
                onClick={() =>
                  confirmAndSync({
                    title: "Delete view",
                    body: `Delete visual view "${view.name}"? The source model and capabilities are not deleted. Undo can restore the view.`,
                    confirmLabel: "Delete view",
                    tone: "danger",
                    onConfirm: () => execute(deleteVisualView(view.id)),
                  })
                }
              >
                <Trash2 /> <span>Delete view</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function normalizeViewName(value: string) {
  return value.trim() || "Untitled view";
}

function normalizeCreateName(value: string, fallback: string) {
  return value.trim() || fallback;
}

function createDescriptionPreview(
  description: string,
  templateId: VisualTemplateId,
  doc: CapabilityDocument,
  rootId: NodeId,
): string {
  if (templateId !== "domain-deep-dive@1") return description;
  const target = doc.nodesById[rootId];
  return target ? `${description} Target: ${target.label}.` : description;
}

function viewChangeLabel(fullChanged: boolean, layoutChanged: boolean): string {
  if (!fullChanged) return "Unchanged";
  return layoutChanged ? "Layout changed" : "View changed";
}

function formatUpdatedAt(updatedAt: number): string {
  const ageMs = Math.max(0, Date.now() - updatedAt);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (ageMs < minute) return "Updated just now";
  if (ageMs < hour) return `Updated ${Math.floor(ageMs / minute)}m ago`;
  if (ageMs < day) return `Updated ${Math.floor(ageMs / hour)}h ago`;
  return `Updated ${new Date(updatedAt).toISOString().slice(0, 10)}`;
}

function templateIdForView(view: VisualView): VisualTemplateId {
  return isBuiltInTemplateId(view.templateId)
    ? view.templateId
    : "full-model-default@1";
}

function descriptionForView(view: VisualView, doc?: CapabilityDocument): string {
  const viewTemplateId = templateIdForView(view);
  const description = isBuiltInTemplateId(view.templateId)
    ? templateById(viewTemplateId).description
    : view.description || templateById(viewTemplateId).description;
  if (viewTemplateId !== "domain-deep-dive@1" || !doc) return description;
  const target = view.templateContext?.rootId
    ? doc.nodesById[view.templateContext.rootId]
    : undefined;
  return target ? `${description} Target: ${target.label}.` : description;
}

function rootIdForTemplate(
  doc: CapabilityDocument,
  templateId: VisualTemplateId,
  selectedNodeIds: NodeId[],
): NodeId | undefined {
  if (templateId !== "domain-deep-dive@1") return undefined;
  return selectedNodeIds.find((nodeId) => {
    const node = doc.nodesById[nodeId];
    return node && !node.isTextLabel && node.type !== "text";
  });
}

function orderedRootTargets(doc: CapabilityDocument): Array<{
  id: NodeId;
  path: string;
}> {
  const safeChildren = buildSafeChildrenByParentId(doc).childrenByParentId;
  const out: Array<{ id: NodeId; path: string }> = [];
  const emitted = new Set<NodeId>();

  const visit = (parentId: NodeId, path: string[]) => {
    for (const childId of safeChildren[parentId] ?? []) {
      if (emitted.has(childId)) continue;
      emitted.add(childId);
      const node = doc.nodesById[childId];
      if (!node) continue;
      const nextPath = [...path, node.label];
      if (!node.isTextLabel && node.type !== "text") {
        out.push({ id: childId, path: nextPath.join(" > ") });
      }
      visit(childId, nextPath);
    }
  };

  visit(ROOT_PARENT_ID, []);
  for (const nodeId of Object.keys(doc.nodesById).sort()) {
    if (emitted.has(nodeId)) continue;
    const node = doc.nodesById[nodeId];
    if (!node || node.isTextLabel || node.type === "text") continue;
    out.push({ id: nodeId, path: node.label });
  }
  return out;
}

function isBuiltInTemplateId(value: unknown): value is VisualTemplateId {
  return (
    typeof value === "string" &&
    BUILT_IN_VIEW_TEMPLATES.some((template) => template.id === value)
  );
}
