import {
  ArrowDown,
  ArrowUp,
  Eye,
  LayoutTemplate,
  MoreHorizontal,
  RotateCcw,
  Star,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { IconButton } from "../shared/IconButton";
import { useMenuKeyboardNavigation } from "../shared/a11y";
import type { ConfirmRequest } from "./viewDrawerTypes";

const VIEW_ROW_MENU_GAP = 6;
const VIEW_ROW_MENU_PADDING = 8;
const VIEW_ROW_MENU_MAX_HEIGHT = 320;

type ConfirmRequestInput = Omit<ConfirmRequest, "onConfirm"> & {
  onConfirm: () => void;
};

interface ViewRowMenuProps {
  fullChanged: boolean;
  hasMultipleViews: boolean;
  index: number;
  isDefault: boolean;
  layoutChanged: boolean;
  orderedViewsLength: number;
  templateName: string;
  viewName: string;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
  onRequestConfirm: (request: ConfirmRequestInput) => void;
  onResetFromTemplate: () => void;
  onResetLayout: () => void;
  onResetVisibility: () => void;
  onSetDefault: () => void;
}

export function ViewRowMenu({
  fullChanged,
  hasMultipleViews,
  index,
  isDefault,
  layoutChanged,
  orderedViewsLength,
  templateName,
  viewName,
  onDelete,
  onMove,
  onRequestConfirm,
  onResetFromTemplate,
  onResetLayout,
  onResetVisibility,
  onSetDefault,
}: ViewRowMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    right: number;
    maxHeight: number;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuAnchorRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        rootRef.current?.contains(event.target)
      )
        return;
      setMenuOpen(false);
    };
    const closeOnResize = () => setMenuOpen(false);
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", closeOnResize);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", closeOnResize);
    };
  }, [menuOpen]);

  const { handleMenuKeyDown } = useMenuKeyboardNavigation({
    open: menuOpen,
    menuRef,
    triggerRef: menuButtonRef,
    onClose: () => setMenuOpen(false),
  });

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

    setMenuPosition({
      top: openAbove
        ? Math.max(
            VIEW_ROW_MENU_PADDING,
            rect.top - VIEW_ROW_MENU_GAP - maxHeight,
          )
        : rect.bottom + VIEW_ROW_MENU_GAP,
      right: Math.max(VIEW_ROW_MENU_PADDING, window.innerWidth - rect.right),
      maxHeight,
    });
    setMenuOpen(true);
  };

  const confirmAndClose = (request: ConfirmRequestInput) => {
    setMenuOpen(false);
    onRequestConfirm(request);
  };

  return (
    <div ref={rootRef} className="cc-view-row-menu-wrap">
      <div ref={menuAnchorRef}>
        <IconButton
          ref={menuButtonRef}
          icon={MoreHorizontal}
          label={`View actions for ${viewName}`}
          active={menuOpen}
          onClick={toggleMenu}
        />
      </div>
      {menuOpen && menuPosition && (
        <div
          ref={menuRef}
          className="cc-view-row-menu"
          role="menu"
          aria-label={`Actions for ${viewName}`}
          onKeyDown={handleMenuKeyDown}
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
              onMove(-1);
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
              onMove(1);
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
              onSetDefault();
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
              confirmAndClose({
                title: "Reset layout",
                body: `Reset layout for "${viewName}"? This discards positions, sizes, layout mode, and layout preservation for this view. Visibility, collapse state, heatmap, export settings, and the view name are preserved.`,
                confirmLabel: "Reset layout",
                onConfirm: onResetLayout,
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
              confirmAndClose({
                title: "Reset visibility and collapse",
                body: `Reset visibility and collapse state for "${viewName}" from the ${templateName} template? Layout positions, heatmap settings, export settings, and the source model are preserved.`,
                confirmLabel: "Reset visibility",
                onConfirm: onResetVisibility,
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
              confirmAndClose({
                title: "Reset from template",
                body: `Reset "${viewName}" to the ${templateName} template? This discards layout, visibility, collapse state, heatmap view settings, and export view settings for this view. The source model and the view name are preserved.`,
                confirmLabel: "Reset view",
                onConfirm: onResetFromTemplate,
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
              confirmAndClose({
                title: "Delete view",
                body: `Delete visual view "${viewName}"? The source model and capabilities are not deleted. Undo can restore the view.`,
                confirmLabel: "Delete view",
                tone: "danger",
                onConfirm: onDelete,
              })
            }
          >
            <Trash2 /> <span>Delete view</span>
          </button>
        </div>
      )}
    </div>
  );
}
