import { Eye, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { reorderVisualViews } from "../../domain/commands/operations";
import { summarizeVisualView } from "../../domain/visual/viewSummary";
import {
  switchActiveVisualView,
  syncUiForVisualView,
  useActiveVisualState,
} from "../../app/activeVisualState";
import { useDocumentStore } from "../../app/stores/documentStore";
import { useUiStore } from "../../app/stores/uiStore";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import { IconButton } from "../shared/IconButton";
import { useFocusReturn } from "../shared/a11y";
import { CreateViewForm } from "./CreateViewForm";
import { ViewRow } from "./ViewRow";
import {
  descriptionForView,
  orderedVisualViews,
} from "./viewDrawerModel";
import type { ConfirmRequest } from "./viewDrawerTypes";

export function ViewsDrawer() {
  const doc = useDocumentStore((state) => state.doc);
  const execute = useDocumentStore((state) => state.execute);
  const { activeView } = useActiveVisualState({ doc });
  const open = useUiStore((state) => state.activeDrawer === "views");
  const setActiveDrawer = useUiStore((state) => state.setActiveDrawer);
  const selected = useUiStore((state) => state.selectedNodeIds);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(
    null,
  );
  const orderedViews = orderedVisualViews(doc);
  const hasMultipleViews = orderedViews.length > 1;
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (document.querySelector("[aria-modal='true']")) return;
      if (document.querySelector(".cc-view-row-menu")) return;
      if (event.key === "Escape") setActiveDrawer(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, setActiveDrawer]);

  useFocusReturn({ active: open, initialFocusRef: closeRef });

  if (!open) return null;

  const syncUiForActiveView = () => {
    syncUiForVisualView(useDocumentStore.getState().doc);
  };

  const switchToView = (viewId: string) => {
    switchActiveVisualView(viewId);
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
          ref={closeRef}
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
          <CreateViewForm
            doc={doc}
            execute={execute}
            selectedNodeIds={selected}
            onCreated={syncUiForActiveView}
          />
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
                isActive={view.id === activeView.id}
                moveView={moveView}
                orderedViewsLength={orderedViews.length}
                setConfirmRequest={setConfirmRequest}
                syncUiForActiveView={syncUiForActiveView}
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
