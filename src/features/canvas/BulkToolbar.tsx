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
  const bulkAllowed = canMultiSelect(viewDoc, selected);
  const alignAllowed = canAlign(viewDoc, selected);
  const distributeAllowed = canDistribute(viewDoc, selected);
  const sameSizeAllowed = bulkAllowed;
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
        tooltip={alignAllowed.reason}
        disabled={!alignAllowed.valid}
        onClick={() => execute(alignNodes(selected, "left"))}
      />
      <IconButton
        icon={AlignHorizontalJustifyCenter}
        label="Align center"
        tooltip={alignAllowed.reason}
        disabled={!alignAllowed.valid}
        onClick={() => execute(alignNodes(selected, "center"))}
      />
      <IconButton
        icon={AlignHorizontalJustifyEnd}
        label="Align right"
        tooltip={alignAllowed.reason}
        disabled={!alignAllowed.valid}
        onClick={() => execute(alignNodes(selected, "right"))}
      />
      <span className="cc-toolbar-separator" />
      <IconButton
        icon={AlignVerticalJustifyStart}
        label="Align top"
        tooltip={alignAllowed.reason}
        disabled={!alignAllowed.valid}
        onClick={() => execute(alignNodes(selected, "top"))}
      />
      <IconButton
        icon={AlignVerticalJustifyCenter}
        label="Align middle"
        tooltip={alignAllowed.reason}
        disabled={!alignAllowed.valid}
        onClick={() => execute(alignNodes(selected, "middle"))}
      />
      <IconButton
        icon={AlignVerticalJustifyEnd}
        label="Align bottom"
        tooltip={alignAllowed.reason}
        disabled={!alignAllowed.valid}
        onClick={() => execute(alignNodes(selected, "bottom"))}
      />
      <span className="cc-toolbar-separator" />
      <IconButton
        icon={AlignHorizontalSpaceBetween}
        label="Distribute horizontal"
        tooltip={distributeAllowed.reason}
        disabled={!distributeAllowed.valid}
        onClick={() => execute(distributeNodes(selected, "horizontal"))}
      />
      <IconButton
        icon={AlignVerticalSpaceBetween}
        label="Distribute vertical"
        tooltip={distributeAllowed.reason}
        disabled={!distributeAllowed.valid}
        onClick={() => execute(distributeNodes(selected, "vertical"))}
      />
      <span className="cc-toolbar-separator" />
      <IconButton
        icon={StretchHorizontal}
        label="Match width to first selected"
        tooltip={sameSizeAllowed.reason}
        disabled={!sameSizeAllowed.valid || !anchor}
        onClick={() => anchor && execute(sameSize(selected, anchor, "width"))}
      />
      <IconButton
        icon={StretchVertical}
        label="Match height to first selected"
        tooltip={sameSizeAllowed.reason}
        disabled={!sameSizeAllowed.valid || !anchor}
        onClick={() => anchor && execute(sameSize(selected, anchor, "height"))}
      />
      <IconButton
        icon={Scaling}
        label="Match size to first selected"
        tooltip={sameSizeAllowed.reason}
        disabled={!sameSizeAllowed.valid || !anchor}
        onClick={() => anchor && execute(sameSize(selected, anchor))}
      />
      <span className="cc-toolbar-separator" />
      <BulkColorPicker
        selected={selected}
        disabled={!bulkAllowed.valid}
        reason={bulkAllowed.reason}
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
              onClick={() => {
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
              onClick={() => {
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
