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
  resetVisualView,
  resetVisualViewFromTemplate,
  setDefaultVisualView,
} from "../../domain/commands/operations";
import type { VisualView } from "../../domain/document/types";
import {
  BUILT_IN_VIEW_TEMPLATES,
  templateById,
  type VisualTemplateId,
} from "../../domain/visual/templates";
import { resolveVisualDocument } from "../../domain/visual/workspace";
import { useDocumentStore } from "../../app/stores/documentStore";
import { useUiStore } from "../../app/stores/uiStore";
import { IconButton } from "../shared/IconButton";

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
  const orderedViews = doc.visual.viewOrder
    .map((viewId) => doc.visual.viewsById[viewId])
    .filter(Boolean);
  const hasMultipleViews = orderedViews.length > 1;

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
            <strong>{doc.visual.viewsById[doc.visual.activeViewId]?.name}</strong>
            <span>
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
              onClick={() => execute(createVisualView({ templateId }))}
            >
              <Plus /> Create
            </button>
          </div>
        </section>

        <section className="cc-settings-section">
          <div className="cc-section-heading">
            <Eye size={16} />
            <span>Manage Views</span>
          </div>
          <div className="cc-view-list">
            {orderedViews.map((view, index) => (
              <div
                className={`cc-view-row ${view.id === doc.visual.activeViewId ? "active" : ""}`}
                key={view.id}
              >
                <button
                  className="cc-view-use"
                  type="button"
                  aria-label={`Use ${view.name}`}
                  aria-current={
                    view.id === doc.visual.activeViewId ? "true" : undefined
                  }
                  onClick={() => switchToView(view.id)}
                >
                  <Eye />
                </button>
                <input
                  className="cc-input"
                  aria-label={`Name for ${view.name}`}
                  value={view.name}
                  onChange={(event) =>
                    execute(renameVisualView(view.id, event.target.value))
                  }
                />
                <IconButton
                  icon={ArrowUp}
                  label={`Move ${view.name} up`}
                  disabled={index === 0}
                  onClick={() => moveView(view.id, -1)}
                />
                <IconButton
                  icon={ArrowDown}
                  label={`Move ${view.name} down`}
                  disabled={index === orderedViews.length - 1}
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
                  active={view.id === doc.visual.defaultViewId}
                  onClick={() => execute(setDefaultVisualView(view.id))}
                />
                <IconButton
                  icon={RotateCcw}
                  label={`Reset ${view.name}`}
                  onClick={() => {
                    if (
                      viewHasChanges(view) &&
                      !window.confirm(`Reset "${view.name}" to source defaults?`)
                    )
                      return;
                    execute(resetVisualView(view.id));
                  }}
                />
                <IconButton
                  icon={LayoutTemplate}
                  label={`Reset ${view.name} to ${templateNameForView(view)} template`}
                  onClick={() => {
                    const viewTemplateId = templateIdForView(view);
                    if (
                      viewHasChanges(view) &&
                      !window.confirm(
                        `Reset "${view.name}" to the ${templateById(viewTemplateId).name} template?`,
                      )
                    )
                      return;
                    execute(resetVisualViewFromTemplate(view.id, viewTemplateId));
                  }}
                />
                <IconButton
                  icon={Trash2}
                  label={`Delete ${view.name}`}
                  disabled={!hasMultipleViews}
                  onClick={() => {
                    if (!window.confirm(`Delete visual view "${view.name}"?`))
                      return;
                    execute(deleteVisualView(view.id));
                  }}
                />
              </div>
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}

function viewHasChanges(view: VisualView) {
  return Object.keys(view.nodeStatesById).length > 0;
}

function templateIdForView(view: VisualView): VisualTemplateId {
  return isBuiltInTemplateId(view.templateId)
    ? view.templateId
    : "full-model-default@1";
}

function templateNameForView(view: VisualView): string {
  return templateById(templateIdForView(view)).name;
}

function isBuiltInTemplateId(value: unknown): value is VisualTemplateId {
  return (
    typeof value === "string" &&
    BUILT_IN_VIEW_TEMPLATES.some((template) => template.id === value)
  );
}
