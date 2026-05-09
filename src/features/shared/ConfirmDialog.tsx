import { useRef } from "react";
import { useFocusTrap } from "./a11y";

interface ConfirmDialogProps {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useFocusTrap({
    active: true,
    containerRef: dialogRef,
    initialFocusRef: cancelRef,
    onEscape: onCancel,
  });

  return (
    <div
      className="cc-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        ref={dialogRef}
        className="cc-modal cc-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cc-confirm-title"
        aria-describedby="cc-confirm-body"
      >
        <div className="cc-modal-head">
          <div id="cc-confirm-title" className="cc-panel-title">
            {title}
          </div>
        </div>
        <p id="cc-confirm-body" className="cc-confirm-body">
          {body}
        </p>
        <div className="cc-modal-actions">
          <button
            ref={cancelRef}
            className="cc-btn"
            type="button"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            className={`cc-btn ${tone === "danger" ? "cc-btn-danger" : "cc-btn-primary"}`}
            type="button"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
