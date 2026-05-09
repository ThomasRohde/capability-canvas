import { ChevronDown, Eye, Star } from "lucide-react";
import { useRef, useState } from "react";
import type { VisualViewId } from "../../domain/document/types";
import { summarizeVisualView } from "../../domain/visual/viewSummary";
import {
  switchActiveVisualView,
  useActiveVisualState,
} from "../../app/activeVisualState";
import { useUiStore } from "../../app/stores/uiStore";
import { useDismissableLayer, useMenuKeyboardNavigation } from "../shared/a11y";

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
  const {
    sourceDocument: doc,
    activeView,
    activeViewId: effectiveActiveViewId,
  } = useActiveVisualState({ viewId: activeViewId });
  const activeDrawer = useUiStore((state) => state.activeDrawer);
  const setActiveDrawer = useUiStore((state) => state.setActiveDrawer);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const activeSummary = summarizeVisualView(doc, effectiveActiveViewId);
  const orderedViews = doc.visual.viewOrder
    .map((viewId) => doc.visual.viewsById[viewId])
    .filter(Boolean);

  const { closeAndRestoreFocus, handleMenuKeyDown } = useMenuKeyboardNavigation(
    {
      open,
      menuRef,
      triggerRef,
      onClose: () => setOpen(false),
    },
  );

  useDismissableLayer({
    open,
    refs: [rootRef],
    onDismiss: (reason) => {
      if (reason === "escape") closeAndRestoreFocus();
      else setOpen(false);
    },
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
    switchActiveVisualView(viewId);
    setOpen(false);
  };

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
              {activeSummary.templateName} - {activeSummary.visibleNodeCount}{" "}
              visible
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
