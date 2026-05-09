import { Palette } from "lucide-react";
import { useRef, useState } from "react";
import { updateNodeColors } from "../../domain/commands/operations";
import type { CapabilityColor, NodeId } from "../../domain/document/types";
import { useActiveVisualState } from "../../app/activeVisualState";
import { useDocumentStore } from "../../app/stores/documentStore";
import { CAPABILITY_COLORS, CATEGORY_STYLES } from "../heatmap/resolveNodeFill";
import { useDismissableLayer, useMenuKeyboardNavigation } from "../shared/a11y";

export function BulkColorPicker({
  selected,
  disabled = false,
  reason,
}: {
  selected: NodeId[];
  disabled?: boolean;
  reason?: string;
}) {
  const doc = useDocumentStore((state) => state.doc);
  const { visualDocument: viewDoc } = useActiveVisualState({ doc });
  const execute = useDocumentStore((state) => state.execute);
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectedNodes = selected
    .map((nodeId) => viewDoc.nodesById[nodeId])
    .filter(Boolean);
  const selectedColors = new Set(selectedNodes.map((node) => node.color));
  const activeColor =
    selectedColors.size === 1 ? selectedNodes[0]?.color : undefined;
  const activeStyle = activeColor ? CATEGORY_STYLES[activeColor] : undefined;
  const previewStyle = activeStyle
    ? {
        background: activeStyle.background,
        borderColor: activeStyle.border,
      }
    : {
        background:
          "conic-gradient(#10b981 0 25%, #0ea5e9 0 50%, #f59e0b 0 75%, #8b5cf6 0)",
        borderColor: "var(--cc-slate-300)",
      };

  const {
    closeAndRestoreFocus: closeColorMenuAndRestoreFocus,
    handleMenuKeyDown: handleColorMenuKeyDown,
  } = useMenuKeyboardNavigation({
    open,
    menuRef: popoverRef,
    triggerRef,
    onClose: () => setOpen(false),
    itemSelector: "button:not([disabled])",
  });

  useDismissableLayer({
    open,
    refs: [pickerRef],
    onDismiss: (reason) => {
      if (reason === "escape") closeColorMenuAndRestoreFocus();
      else setOpen(false);
    },
  });

  const applyColor = (color: CapabilityColor) => {
    if (disabled) return;
    execute(updateNodeColors(selected, color));
    setOpen(false);
  };

  return (
    <div
      ref={pickerRef}
      className="cc-bulk-color-picker"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`cc-icon-btn ${open ? "active" : ""}`}
        aria-label="Change selected color"
        aria-haspopup="menu"
        aria-expanded={open}
        title={reason ?? "Change selected color"}
        disabled={disabled}
        onClick={() => !disabled && setOpen((current) => !current)}
      >
        <Palette aria-hidden="true" />
        <span className="cc-bulk-color-preview" style={previewStyle} />
      </button>
      {open && (
        <div
          ref={popoverRef}
          className="cc-bulk-color-popover"
          role="menu"
          aria-label="Color picker"
          onKeyDown={handleColorMenuKeyDown}
        >
          {CAPABILITY_COLORS.map((color) => {
            const style = CATEGORY_STYLES[color];
            return (
              <button
                key={color}
                type="button"
                aria-label={`Set selected color ${color}`}
                aria-pressed={activeColor === color}
                className={`cc-bulk-color-swatch ${activeColor === color ? "on" : ""}`}
                title={`Set selected color ${color}`}
                style={{
                  color: style.border,
                  background: style.background,
                }}
                onClick={() => applyColor(color)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
