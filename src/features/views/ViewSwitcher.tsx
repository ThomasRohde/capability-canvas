import {
  ChevronDown,
  Eye,
  Star,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { resolveVisualDocument } from "../../domain/visual/workspace";
import type { VisualViewId } from "../../domain/document/types";
import { summarizeVisualView } from "../../domain/visual/viewSummary";
import { useDocumentStore } from "../../app/stores/documentStore";
import { useUiStore } from "../../app/stores/uiStore";
import { useMenuKeyboardNavigation } from "../shared/a11y";

interface ViewSwitcherProps {
  readonly?: boolean;
  activeViewId?: VisualViewId;
  onReadonlyViewChange?: (viewId: VisualViewId) => void;
}

export function ViewSwitcher({
  readonly = false,
  activeViewId,
  onReadonlyViewChange,
}: ViewSwitcherProps) {
  const doc = useDocumentStore((state) => state.doc);
  const setActiveVisualView = useDocumentStore(
    (state) => state.setActiveVisualView,
  );
  const viewport = useUiStore((state) => state.viewport);
  const setViewport = useUiStore((state) => state.setViewport);
  const selected = useUiStore((state) => state.selectedNodeIds);
  const setSelection = useUiStore((state) => state.setSelection);
  const showSelectionNotice = useUiStore(
    (state) => state.showSelectionNotice,
  );
  const activeDrawer = useUiStore((state) => state.activeDrawer);
  const setActiveDrawer = useUiStore((state) => state.setActiveDrawer);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const effectiveActiveViewId = activeViewId ?? doc.visual.activeViewId;
  const activeView = doc.visual.viewsById[effectiveActiveViewId];
  const activeSummary = summarizeVisualView(doc, effectiveActiveViewId);
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
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const { handleMenuKeyDown } = useMenuKeyboardNavigation({
    open,
    menuRef,
    triggerRef,
    onClose: () => setOpen(false),
  });

  const switchToView = (viewId: string) => {
    if (readonly && onReadonlyViewChange) {
      onReadonlyViewChange(viewId);
      setOpen(false);
      return;
    }
    if (readonly) {
      setOpen(false);
      return;
    }
    setActiveVisualView(viewId, { previousViewport: viewport });
    const nextDoc = useDocumentStore.getState().doc;
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
    setOpen(false);
  };

  if (!activeView) return null;

  return (
    <div ref={rootRef} className="cc-view-switcher">
      <button
        ref={triggerRef}
        className="cc-view-trigger"
        type="button"
        aria-label={readonly ? "Switch visual view" : "Open active view"}
        aria-expanded={readonly ? open : activeDrawer === "views"}
        onClick={() => {
          if (readonly) setOpen((value) => !value);
          else setActiveDrawer(activeDrawer === "views" ? null : "views");
        }}
      >
        <Eye />
        <span className="cc-view-trigger-text">
          <span className="cc-view-trigger-name">{activeView.name}</span>
          {activeSummary && (
            <span className="cc-view-trigger-meta">
              {activeSummary.templateName} - {activeSummary.visibleNodeCount} visible
            </span>
          )}
        </span>
        {readonly ? <ChevronDown /> : null}
      </button>
      {readonly && open && (
        <div
          ref={menuRef}
          className="cc-view-menu"
          role="menu"
          aria-label="Visual views"
          onKeyDown={handleMenuKeyDown}
        >
          {orderedViews.map((view) => (
            <button
              key={view.id}
              type="button"
              role="menuitem"
              aria-current={
                view.id === effectiveActiveViewId ? "true" : undefined
              }
              className={view.id === effectiveActiveViewId ? "on" : ""}
              onClick={() => switchToView(view.id)}
            >
              <span>{view.name}</span>
              {view.id === doc.visual.defaultViewId && <Star size={13} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
