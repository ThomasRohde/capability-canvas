import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  LayoutTemplate,
  Plus,
  RotateCcw,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  createVisualView,
  deleteVisualView,
  duplicateVisualView,
  renameVisualView,
  reorderVisualViews,
  resetVisualViewLayout,
  resetVisualViewFromTemplate,
  setDefaultVisualView,
} from "../../domain/commands/operations";
import type {
  CapabilityDocument,
  NodeId,
  VisualView,
} from "../../domain/document/types";
import {
  BUILT_IN_VIEW_TEMPLATES,
  templateById,
  type VisualTemplateId,
} from "../../domain/visual/templates";
import { resolveVisualDocument } from "../../domain/visual/workspace";
import { viewChangeSummary } from "../../domain/visual/viewChanges";
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
  const [templateId, setTemplateId] =
    useState<VisualTemplateId>("full-model-default@1");
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(
    null,
  );
  const orderedViews = doc.visual.viewOrder
    .map((viewId) => doc.visual.viewsById[viewId])
    .filter(Boolean);
  const hasMultipleViews = orderedViews.length > 1;
  const activeView = doc.visual.viewsById[doc.visual.activeViewId];
  const selectedTemplate = templateById(templateId);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveDrawer(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, setActiveDrawer]);

  if (!open) return null;

  const switchToView = (viewId: string) => {
    setActiveVisualView(viewId, { previousViewport: viewport });
    const nextDoc = useDocumentStore.getState().doc;
    const nextView = nextDoc.visual.viewsById[viewId];
    if (nextView?.viewport) setViewport(nextView.viewport);
    const resolved = resolveVisualDocument(nextDoc, viewId);
    const nextSelection = selected.filter(
      (nodeId) => resolved.nodesById[nodeId]?.isOnCanvas,
    );
    if (nextSelection.length !== selected.length) setSelection(nextSelection);
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
          <div className="cc-view-template-row">
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
            <button
              className="cc-btn cc-btn-primary"
              type="button"
              onClick={() =>
                execute(
                  createVisualView({
                    templateId,
                    rootId: rootIdForTemplate(doc, templateId, selected),
                  }),
                )
              }
            >
              <Plus /> Create
            </button>
          </div>
          <p className="cc-view-template-description">
            {selectedTemplate.description}
          </p>
        </section>

        <section className="cc-settings-section">
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
                switchToView={switchToView}
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
  switchToView,
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
  switchToView: (viewId: string) => void;
  view: VisualView;
}) {
  const changes = viewChangeSummary(doc, view.id);
  const viewTemplateId = templateIdForView(view);
  const templateName = templateById(viewTemplateId).name;

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
        <p className="cc-view-description">{descriptionForView(view, doc)}</p>
      </div>
      <IconButton
        icon={ArrowUp}
        label={`Move ${view.name} up`}
        disabled={index === 0}
        onClick={() => moveView(view.id, -1)}
      />
      <IconButton
        icon={ArrowDown}
        label={`Move ${view.name} down`}
        disabled={index === orderedViewsLength - 1}
        onClick={() => moveView(view.id, 1)}
      />
      <IconButton
        icon={Copy}
        label={`Duplicate ${view.name}`}
        onClick={() => execute(duplicateVisualView(view.id))}
      />
      <IconButton
        icon={Star}
        label={`Set ${view.name} as default view`}
        active={isDefault}
        onClick={() => execute(setDefaultVisualView(view.id))}
      />
      <IconButton
        icon={RotateCcw}
        label={`Reset layout for ${view.name}`}
        disabled={!changes?.layoutChanged}
        onClick={() => {
          setConfirmRequest({
            title: "Reset layout",
            body: `Reset layout for "${view.name}"? This discards positions, sizes, layout mode, and layout preservation for this view. Visibility, collapse state, heatmap, export settings, and the view name are preserved.`,
            confirmLabel: "Reset layout",
            onConfirm: () => execute(resetVisualViewLayout(view.id)),
          });
        }}
      />
      <IconButton
        icon={LayoutTemplate}
        label={`Reset ${view.name} to ${templateName} template`}
        disabled={!changes?.fullChanged}
        onClick={() => {
          setConfirmRequest({
            title: "Reset from template",
            body: `Reset "${view.name}" to the ${templateName} template? This discards layout, visibility, collapse state, heatmap view settings, and export view settings for this view. The view name is preserved.`,
            confirmLabel: "Reset view",
            onConfirm: () =>
              execute(resetVisualViewFromTemplate(view.id, viewTemplateId)),
          });
        }}
      />
      <IconButton
        icon={Trash2}
        label={`Delete ${view.name}`}
        disabled={!hasMultipleViews}
        onClick={() => {
          setConfirmRequest({
            title: "Delete view",
            body: `Delete visual view "${view.name}"? This cannot be undone from the Views drawer.`,
            confirmLabel: "Delete",
            tone: "danger",
            onConfirm: () => execute(deleteVisualView(view.id)),
          });
        }}
      />
    </div>
  );
}

function normalizeViewName(value: string) {
  return value.trim() || "Untitled view";
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
    return node && !node.isTextLabel;
  });
}

function isBuiltInTemplateId(value: unknown): value is VisualTemplateId {
  return (
    typeof value === "string" &&
    BUILT_IN_VIEW_TEMPLATES.some((template) => template.id === value)
  );
}
