import {
  CheckCircle2,
  Download,
  Info,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ImportReview } from "../../app/importReview";
import type { Diagnostic } from "../../domain/validation/diagnostics";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import { IconButton } from "../shared/IconButton";

interface ImportReviewDialogProps {
  review: ImportReview;
  dirty: boolean;
  onApply: () => Promise<void> | void;
  onCancel: () => void;
  onDownloadBackup: () => Promise<void> | void;
}

export function ImportReviewDialog({
  review,
  dirty,
  onApply,
  onCancel,
  onDownloadBackup,
}: ImportReviewDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [applyBusy, setApplyBusy] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [confirmDirty, setConfirmDirty] = useState(false);
  const busy = applyBusy || backupBusy;

  useEffect(() => {
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onCancel]);

  const requestApply = () => {
    if (!review.summary.canApply || applyBusy) return;
    if (dirty) {
      setConfirmDirty(true);
      return;
    }
    void applyImport();
  };

  const applyImport = async () => {
    if (!review.summary.canApply) return;
    setApplyBusy(true);
    try {
      await onApply();
    } finally {
      setApplyBusy(false);
    }
  };

  const downloadBackup = async () => {
    setBackupBusy(true);
    try {
      await onDownloadBackup();
    } finally {
      setBackupBusy(false);
    }
  };

  return (
    <>
      <div
        className="cc-modal-backdrop"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !busy) onCancel();
        }}
      >
        <section
          className="cc-modal cc-import-review-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cc-import-review-title"
        >
          <div className="cc-modal-head">
            <div>
              <div id="cc-import-review-title" className="cc-panel-title">
                Review import
              </div>
              <div className="cc-import-review-source">
                {review.sourceLabel}
                {review.file ? ` - ${review.file.name}` : ""}
              </div>
            </div>
            <IconButton
              icon={X}
              label="Close import review"
              disabled={busy}
              onClick={onCancel}
            />
          </div>

          <div className="cc-import-review-summary">
            <SummaryItem label="Title" value={review.summary.title} wide />
            <SummaryItem
              label="Capabilities"
              value={String(review.summary.nodeCount)}
            />
            <SummaryItem label="Views" value={String(review.summary.viewCount)} />
            <SummaryItem
              label="Diagnostics"
              value={String(review.summary.diagnosticsCount)}
            />
            <SummaryItem
              label="Repairs"
              value={String(review.summary.repairCount)}
            />
          </div>

          {review.summary.convertedInput && (
            <div className="cc-import-review-note">
              <Info size={16} />
              <span>External hierarchy JSON was converted to a document.</span>
            </div>
          )}

          {!review.summary.canApply && (
            <div className="cc-import-review-note invalid" role="alert">
              <TriangleAlert size={16} />
              <span>The selected content could not be parsed as a document.</span>
            </div>
          )}

          <div className="cc-import-review-diagnostics">
            {review.summary.diagnosticsCount === 0 ? (
              <div className="cc-status-empty">
                <CheckCircle2 size={16} />
                <span>No diagnostics</span>
              </div>
            ) : (
              <>
                <DiagnosticSection
                  title="Duplicate ID repairs"
                  diagnostics={review.groups.duplicateIds}
                />
                <DiagnosticSection
                  title="Parent repairs"
                  diagnostics={review.groups.parentRepairs}
                />
                <DiagnosticSection
                  title="Other repairs"
                  diagnostics={review.groups.repairs}
                />
                <DiagnosticSection
                  title="Warnings"
                  diagnostics={review.groups.warnings}
                />
                <DiagnosticSection
                  title="Validation errors"
                  diagnostics={review.groups.validationErrors}
                />
              </>
            )}
          </div>

          <div className="cc-modal-actions">
            <button
              ref={cancelRef}
              className="cc-btn"
              type="button"
              disabled={busy}
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              className="cc-btn"
              type="button"
              disabled={busy}
              onClick={() => void downloadBackup()}
            >
              <Download />
              {backupBusy ? "Downloading..." : "Download current backup"}
            </button>
            <button
              className="cc-btn cc-btn-primary"
              type="button"
              disabled={!review.summary.canApply || busy}
              onClick={requestApply}
            >
              <Upload />
              {applyBusy ? "Applying..." : "Apply import"}
            </button>
          </div>
        </section>
      </div>
      {confirmDirty && (
        <ConfirmDialog
          title="Replace unsaved document?"
          body="The current document has unsaved local changes. Download a backup or confirm that you want to replace it with the imported document."
          confirmLabel="Replace document"
          tone="danger"
          onCancel={() => setConfirmDirty(false)}
          onConfirm={() => {
            setConfirmDirty(false);
            void applyImport();
          }}
        />
      )}
    </>
  );
}

function SummaryItem({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={`cc-import-summary-item ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DiagnosticSection({
  title,
  diagnostics,
}: {
  title: string;
  diagnostics: Diagnostic[];
}) {
  if (diagnostics.length === 0) return null;
  return (
    <div className="cc-import-diagnostic-section">
      <div className="cc-section-title">{title}</div>
      <ul className="cc-diagnostic-list cc-import-diagnostic-list">
        {diagnostics.map((diagnostic, index) => (
          <li
            key={`${diagnostic.code}-${diagnostic.nodeId ?? "document"}-${index}`}
          >
            {diagnostic.severity === "info" ? (
              <Info size={15} />
            ) : (
              <TriangleAlert size={15} />
            )}
            <span>
              <strong>{diagnostic.code}</strong>
              <span>{diagnostic.message}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
