import {
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignHorizontalSpaceBetween,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalSpaceBetween,
  Copy,
  EyeOff,
  MoreHorizontal,
  Scaling,
  StretchHorizontal,
  StretchVertical,
  Trash2,
} from "lucide-react";
import { useRef, useState } from "react";
import {
  alignNodes,
  distributeNodes,
  duplicateNodes,
  removeNodesFromCanvas,
  sameSize,
} from "../../domain/commands/operations";
import type { NodeId } from "../../domain/document/types";
import {
  AUTOMATIC_LAYOUT_GEOMETRY_LOCKED_MESSAGE,
  SOURCE_LOCKED_SEMANTIC_EDIT_MESSAGE,
  isAutomaticLayoutMode,
  isSourceModelEditable,
} from "../../domain/layout/canvasLayoutPolicy";
import {
  canAlign,
  canDistribute,
  canMultiSelect,
} from "../../domain/selection/rules";
import { useActiveVisualState } from "../../app/activeVisualState";
import { useDocumentStore } from "../../app/stores/documentStore";
import { useUiStore } from "../../app/stores/uiStore";
import { IconButton } from "../shared/IconButton";
import { useDismissableLayer, useMenuKeyboardNavigation } from "../shared/a11y";
import { useModelDeleteConfirmation } from "../shared/useModelDeleteConfirmation";
import { BulkColorPicker } from "./BulkColorPicker";
import { filterSelectionAfterViewRemoval } from "./selectors";

export function BulkToolbar({ selected }: { selected: NodeId[] }) {
  const doc = useDocumentStore((state) => state.doc);
  const { visualDocument: viewDoc } = useActiveVisualState({ doc });
  const execute = useDocumentStore((state) => state.execute);
  const setSelection = useUiStore((state) => state.setSelection);
  const { requestDeleteFromModel, deleteFromModelDialog } =
    useModelDeleteConfirmation(doc);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const moreTriggerRef = useRef<HTMLButtonElement>(null);
  const selectionOptions = { hierarchy: "canvas" } as const;
  const bulkAllowed = canMultiSelect(viewDoc, selected, selectionOptions);
  const alignAllowed = canAlign(viewDoc, selected, selectionOptions);
  const distributeAllowed = canDistribute(viewDoc, selected, selectionOptions);
  const sameSizeAllowed = bulkAllowed;
  const directGeometryBlocked = isAutomaticLayoutMode(viewDoc.settings.layoutMode);
  const directGeometryReason = directGeometryBlocked
    ? AUTOMATIC_LAYOUT_GEOMETRY_LOCKED_MESSAGE
    : undefined;
  const sourceEditable = isSourceModelEditable(doc);
  const sourceLockReason =
    doc.access?.reason || SOURCE_LOCKED_SEMANTIC_EDIT_MESSAGE;
  const anchor = selected[0];
  const anchorNode = anchor ? viewDoc.nodesById[anchor] : undefined;

  const {
    closeAndRestoreFocus: closeBulkMenuAndRestoreFocus,
    handleMenuKeyDown: handleBulkMenuKeyDown,
  } = useMenuKeyboardNavigation({
    open: moreOpen,
    menuRef: moreRef,
    triggerRef: moreTriggerRef,
    onClose: () => setMoreOpen(false),
  });

  useDismissableLayer({
    open: moreOpen,
    refs: [moreRef],
    onDismiss: (reason) => {
      if (reason === "escape") closeBulkMenuAndRestoreFocus();
      else setMoreOpen(false);
    },
  });

  return (
    <div className="cc-bulk-toolbar">
      <span className="count">{selected.length} selected</span>
      <span className="reference">
        Reference: {anchorNode?.label ?? "first selected"}
      </span>
      <span className="cc-toolbar-separator" />
      <IconButton
        icon={AlignHorizontalJustifyStart}
        label="Align left"
        tooltip={directGeometryReason ?? alignAllowed.reason}
        disabled={directGeometryBlocked || !alignAllowed.valid}
        onClick={() => execute(alignNodes(selected, "left"))}
      />
      <IconButton
        icon={AlignHorizontalJustifyCenter}
        label="Align center"
        tooltip={directGeometryReason ?? alignAllowed.reason}
        disabled={directGeometryBlocked || !alignAllowed.valid}
        onClick={() => execute(alignNodes(selected, "center"))}
      />
      <IconButton
        icon={AlignHorizontalJustifyEnd}
        label="Align right"
        tooltip={directGeometryReason ?? alignAllowed.reason}
        disabled={directGeometryBlocked || !alignAllowed.valid}
        onClick={() => execute(alignNodes(selected, "right"))}
      />
      <span className="cc-toolbar-separator" />
      <IconButton
        icon={AlignVerticalJustifyStart}
        label="Align top"
        tooltip={directGeometryReason ?? alignAllowed.reason}
        disabled={directGeometryBlocked || !alignAllowed.valid}
        onClick={() => execute(alignNodes(selected, "top"))}
      />
      <IconButton
        icon={AlignVerticalJustifyCenter}
        label="Align middle"
        tooltip={directGeometryReason ?? alignAllowed.reason}
        disabled={directGeometryBlocked || !alignAllowed.valid}
        onClick={() => execute(alignNodes(selected, "middle"))}
      />
      <IconButton
        icon={AlignVerticalJustifyEnd}
        label="Align bottom"
        tooltip={directGeometryReason ?? alignAllowed.reason}
        disabled={directGeometryBlocked || !alignAllowed.valid}
        onClick={() => execute(alignNodes(selected, "bottom"))}
      />
      <span className="cc-toolbar-separator" />
      <IconButton
        icon={AlignHorizontalSpaceBetween}
        label="Distribute horizontal"
        tooltip={directGeometryReason ?? distributeAllowed.reason}
        disabled={directGeometryBlocked || !distributeAllowed.valid}
        onClick={() => execute(distributeNodes(selected, "horizontal"))}
      />
      <IconButton
        icon={AlignVerticalSpaceBetween}
        label="Distribute vertical"
        tooltip={directGeometryReason ?? distributeAllowed.reason}
        disabled={directGeometryBlocked || !distributeAllowed.valid}
        onClick={() => execute(distributeNodes(selected, "vertical"))}
      />
      <span className="cc-toolbar-separator" />
      <IconButton
        icon={StretchHorizontal}
        label="Match width to first selected"
        tooltip={directGeometryReason ?? sameSizeAllowed.reason}
        disabled={directGeometryBlocked || !sameSizeAllowed.valid || !anchor}
        onClick={() => anchor && execute(sameSize(selected, anchor, "width"))}
      />
      <IconButton
        icon={StretchVertical}
        label="Match height to first selected"
        tooltip={directGeometryReason ?? sameSizeAllowed.reason}
        disabled={directGeometryBlocked || !sameSizeAllowed.valid || !anchor}
        onClick={() => anchor && execute(sameSize(selected, anchor, "height"))}
      />
      <IconButton
        icon={Scaling}
        label="Match size to first selected"
        tooltip={directGeometryReason ?? sameSizeAllowed.reason}
        disabled={directGeometryBlocked || !sameSizeAllowed.valid || !anchor}
        onClick={() => anchor && execute(sameSize(selected, anchor))}
      />
      <span className="cc-toolbar-separator" />
      <BulkColorPicker
        selected={selected}
        disabled={!bulkAllowed.valid || !sourceEditable}
        reason={!sourceEditable ? sourceLockReason : bulkAllowed.reason}
      />
      <span className="cc-toolbar-separator" />
      <IconButton
        icon={EyeOff}
        label="Remove from active view"
        onClick={() => {
          const diagnostics = execute(removeNodesFromCanvas(selected));
          if (diagnostics.some((diagnostic) => diagnostic.severity === "error"))
            return;
          setSelection(
            filterSelectionAfterViewRemoval(viewDoc, selected, selected),
          );
        }}
      />
      <div
        ref={moreRef}
        className="cc-bulk-more"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <IconButton
          ref={moreTriggerRef}
          icon={MoreHorizontal}
          label="More bulk actions"
          active={moreOpen}
          onClick={() => setMoreOpen((open) => !open)}
        />
        {moreOpen && (
          <div
            className="cc-bulk-more-menu"
            role="menu"
            aria-label="Bulk actions"
            onKeyDown={handleBulkMenuKeyDown}
          >
            <button
              type="button"
              role="menuitem"
              disabled={!sourceEditable}
              title={!sourceEditable ? sourceLockReason : undefined}
              onClick={() => {
                if (!sourceEditable) return;
                execute(duplicateNodes(selected));
                setMoreOpen(false);
              }}
            >
              <Copy aria-hidden="true" />
              <span>Duplicate</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="danger"
              disabled={!sourceEditable}
              title={!sourceEditable ? sourceLockReason : undefined}
              onClick={() => {
                if (!sourceEditable) return;
                requestDeleteFromModel(selected);
                setMoreOpen(false);
              }}
            >
              <Trash2 aria-hidden="true" />
              <span>Delete from model</span>
            </button>
          </div>
        )}
      </div>
      {deleteFromModelDialog}
    </div>
  );
}
