import {
  ChevronDown,
  Copy,
  Eye,
  GripVertical,
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
  resetVisualView,
  resetVisualViewFromTemplate,
  setDefaultVisualView,
} from "../../domain/commands/operations";
import {
  BUILT_IN_VIEW_TEMPLATES,
  type VisualTemplateId,
} from "../../domain/visual/templates";
import { resolveVisualDocument } from "../../domain/visual/workspace";
import { useDocumentStore } from "../../app/stores/documentStore";
import { useUiStore } from "../../app/stores/uiStore";
import { IconButton } from "../shared/IconButton";

export function ViewSwitcher({ readonly = false }: { readonly?: boolean }) {
  const doc = useDocumentStore((state) => state.doc);
  const execute = useDocumentStore((state) => state.execute);
  const setActiveVisualView = useDocumentStore(
    (state) => state.setActiveVisualView,
  );
  const viewport = useUiStore((state) => state.viewport);
  const setViewport = useUiStore((state) => state.setViewport);
  const selected = useUiStore((state) => state.selectedNodeIds);
  const setSelection = useUiStore((state) => state.setSelection);
  const [open, setOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const activeView = doc.visual.viewsById[doc.visual.activeViewId];
  const orderedViews = doc.visual.viewOrder
    .map((viewId) => doc.visual.viewsById[viewId])
    .filter(Boolean);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        rootRef.current?.contains(event.target)
      )
        return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

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
    setOpen(false);
  };

  if (!activeView) return null;

  return (
    <div ref={rootRef} className="cc-view-switcher">
      <button
        className="cc-view-trigger"
        type="button"
        aria-label="Switch visual view"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Eye />
        <span>{activeView.name}</span>
        <ChevronDown />
      </button>
      {!readonly && (
        <button
          className="cc-btn cc-view-create"
          type="button"
          aria-label="Create visual view"
          title="Create visual view"
          onClick={() => execute(createVisualView({ name: "New view" }))}
        >
          <Plus /> New view
        </button>
      )}
      {open && (
        <div className="cc-view-menu" role="menu" aria-label="Visual views">
          {orderedViews.map((view) => (
            <button
              key={view.id}
              type="button"
              role="menuitem"
              aria-current={
                view.id === doc.visual.activeViewId ? "true" : undefined
              }
              className={view.id === doc.visual.activeViewId ? "on" : ""}
              onClick={() => switchToView(view.id)}
            >
              <span>{view.name}</span>
              {view.id === doc.visual.defaultViewId && <Star size={13} />}
            </button>
          ))}
          {!readonly && (
            <>
              <span className="cc-menu-separator" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  execute(createVisualView({ templateId: "full-model-default@1" }));
                  setOpen(false);
                }}
              >
                <Plus /> New view
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  execute(duplicateVisualView(doc.visual.activeViewId));
                  setOpen(false);
                }}
              >
                <Copy /> Duplicate view
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  setManagerOpen(true);
                }}
              >
                <GripVertical /> Manage views
              </button>
            </>
          )}
        </div>
      )}
      {managerOpen && (
        <ViewManagerDialog onClose={() => setManagerOpen(false)} />
      )}
    </div>
  );
}

function ViewManagerDialog({ onClose }: { onClose: () => void }) {
  const doc = useDocumentStore((state) => state.doc);
  const execute = useDocumentStore((state) => state.execute);
  const activeView = doc.visual.viewsById[doc.visual.activeViewId];
  const [templateId, setTemplateId] =
    useState<VisualTemplateId>("full-model-default@1");
  const dialogRef = useRef<HTMLElement>(null);
  const orderedViews = doc.visual.viewOrder
    .map((viewId) => doc.visual.viewsById[viewId])
    .filter(Boolean);
  const hasMultipleViews = orderedViews.length > 1;
  const activeViewHasChanges = useMemo(
    () => activeView && Object.keys(activeView.nodeStatesById).length > 0,
    [activeView],
  );

  useEffect(() => {
    const firstInput = dialogRef.current?.querySelector("input, button, select");
    if (firstInput instanceof HTMLElement) firstInput.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

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
    <div
      className="cc-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="cc-modal cc-view-manager"
        role="dialog"
        aria-label="Manage visual views"
      >
        <div className="cc-modal-head">
          <div className="cc-panel-title">Manage views</div>
          <IconButton icon={X} label="Close view manager" onClick={onClose} />
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
            <Plus /> New from template
          </button>
        </div>
        <div className="cc-view-list">
          {orderedViews.map((view, index) => (
            <div className="cc-view-row" key={view.id}>
              <input
                className="cc-input"
                aria-label={`Name for ${view.name}`}
                value={view.name}
                onChange={(event) =>
                  execute(renameVisualView(view.id, event.target.value))
                }
              />
              <button
                className="cc-icon-btn"
                type="button"
                aria-label={`Move ${view.name} up`}
                disabled={index === 0}
                onClick={() => moveView(view.id, -1)}
              >
                Up
              </button>
              <button
                className="cc-icon-btn"
                type="button"
                aria-label={`Move ${view.name} down`}
                disabled={index === orderedViews.length - 1}
                onClick={() => moveView(view.id, 1)}
              >
                Down
              </button>
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
                    activeViewHasChanges &&
                    !window.confirm(`Reset "${view.name}" to source defaults?`)
                  )
                    return;
                  execute(resetVisualView(view.id));
                }}
              />
              <button
                className="cc-btn"
                type="button"
                onClick={() =>
                  execute(resetVisualViewFromTemplate(view.id, templateId))
                }
              >
                Template
              </button>
              <IconButton
                icon={Trash2}
                label={`Delete ${view.name}`}
                disabled={!hasMultipleViews}
                onClick={() => {
                  if (
                    !window.confirm(`Delete visual view "${view.name}"?`)
                  )
                    return;
                  execute(deleteVisualView(view.id));
                }}
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
