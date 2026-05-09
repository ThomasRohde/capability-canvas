import { Copy, Eye } from "lucide-react";
import {
  deleteVisualView,
  duplicateVisualView,
  renameVisualView,
  resetVisualViewFromTemplate,
  resetVisualViewLayout,
  resetVisualViewVisibility,
  setDefaultVisualView,
} from "../../domain/commands/operations";
import type {
  CapabilityDocument,
  VisualView,
} from "../../domain/document/types";
import { templateById } from "../../domain/visual/templates";
import type { VisualViewSummary } from "../../domain/visual/viewSummary";
import { CommitTextInput } from "../shared/CommitTextInput";
import { IconButton } from "../shared/IconButton";
import {
  descriptionForView,
  formatUpdatedAt,
  normalizeViewName,
  templateIdForView,
  viewChangeLabel,
} from "./viewDrawerModel";
import type {
  ConfirmRequest,
  ExecuteTransaction,
} from "./viewDrawerTypes";
import { ViewRowMenu } from "./ViewRowMenu";

interface ViewRowProps {
  doc: CapabilityDocument;
  execute: ExecuteTransaction;
  hasMultipleViews: boolean;
  index: number;
  isActive: boolean;
  isDefault: boolean;
  moveView: (viewId: string, direction: -1 | 1) => void;
  orderedViewsLength: number;
  setConfirmRequest: (request: ConfirmRequest) => void;
  syncUiForActiveView: () => void;
  switchToView: (viewId: string) => void;
  summary: VisualViewSummary | null;
  view: VisualView;
}

type ConfirmRequestInput = Omit<ConfirmRequest, "onConfirm"> & {
  onConfirm: () => void;
};

export function ViewRow({
  doc,
  execute,
  hasMultipleViews,
  index,
  isActive,
  isDefault,
  moveView,
  orderedViewsLength,
  setConfirmRequest,
  syncUiForActiveView,
  switchToView,
  summary,
  view,
}: ViewRowProps) {
  const viewTemplateId = summary?.templateId ?? templateIdForView(view);
  const templateName = summary?.templateName ?? templateById(viewTemplateId).name;
  const fullChanged = summary?.fullChanged ?? false;
  const layoutChanged = summary?.layoutChanged ?? false;

  const duplicateView = () => {
    execute(duplicateVisualView(view.id));
    syncUiForActiveView();
  };

  const confirmAndSync = (request: ConfirmRequestInput) => {
    setConfirmRequest({
      ...request,
      onConfirm: () => {
        request.onConfirm();
        syncUiForActiveView();
      },
    });
  };

  return (
    <div className={`cc-view-row ${isActive ? "active" : ""}`}>
      <button
        className="cc-view-use"
        type="button"
        aria-label={`Use ${view.name}`}
        aria-current={isActive ? "true" : undefined}
        onClick={() => switchToView(view.id)}
      >
        <Eye />
      </button>
      <div className="cc-view-details">
        <CommitTextInput
          className="cc-input"
          aria-label={`Name for ${view.name}`}
          value={view.name}
          normalize={normalizeViewName}
          onCommit={(name) => execute(renameVisualView(view.id, name))}
        />
        <div className="cc-view-meta" aria-label={`Summary for ${view.name}`}>
          {isActive && <span className="cc-view-badge active">Active</span>}
          {isDefault && <span className="cc-view-badge">Default</span>}
          <span>{templateName}</span>
          <span>{summary?.visibleNodeCount ?? 0} visible</span>
          <span>{viewChangeLabel(fullChanged, layoutChanged)}</span>
          <span>{formatUpdatedAt(summary?.updatedAt ?? view.updatedAt)}</span>
        </div>
        <p className="cc-view-description">{descriptionForView(view, doc)}</p>
      </div>
      <div className="cc-view-row-actions">
        <IconButton
          icon={Copy}
          label={`Duplicate visual state for ${view.name}`}
          tooltip="Duplicate visual state only"
          onClick={duplicateView}
        />
        <ViewRowMenu
          fullChanged={fullChanged}
          hasMultipleViews={hasMultipleViews}
          index={index}
          isDefault={isDefault}
          layoutChanged={layoutChanged}
          orderedViewsLength={orderedViewsLength}
          templateName={templateName}
          viewName={view.name}
          onDelete={() => execute(deleteVisualView(view.id))}
          onMove={(direction) => moveView(view.id, direction)}
          onRequestConfirm={confirmAndSync}
          onResetFromTemplate={() =>
            execute(resetVisualViewFromTemplate(view.id, viewTemplateId))
          }
          onResetLayout={() => execute(resetVisualViewLayout(view.id))}
          onResetVisibility={() => execute(resetVisualViewVisibility(view.id))}
          onSetDefault={() => execute(setDefaultVisualView(view.id))}
        />
      </div>
    </div>
  );
}
