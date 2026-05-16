import type { KeyboardEvent, RefObject } from "react";
import {
  isTextLabelNode,
  type CapabilityNode,
  type NodeId,
} from "../../domain/document/types";

export interface CanvasContextMenuState {
  nodeId: NodeId;
  x: number;
  y: number;
}

export function CanvasContextMenu({
  menu,
  menuRef,
  node,
  hasCanvasChildren,
  hasSourceChildren,
  isCollapsed,
  canEditSourceModel,
  sourceEditReason,
  onKeyDown,
  onInspect,
  onAddChild,
  onDuplicate,
  onCopyAiPrompt,
  onImportAiJson,
  onFitParent,
  onToggleCollapse,
  onRemoveFromView,
  onDeleteFromModel,
}: {
  menu: CanvasContextMenuState;
  menuRef: RefObject<HTMLDivElement | null>;
  node: CapabilityNode;
  hasCanvasChildren: boolean;
  hasSourceChildren: boolean;
  isCollapsed: boolean;
  canEditSourceModel: boolean;
  sourceEditReason?: string;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onInspect: (nodeId: NodeId) => void;
  onAddChild: (nodeId: NodeId) => void;
  onDuplicate: (nodeId: NodeId) => void;
  onCopyAiPrompt: (nodeId: NodeId) => void;
  onImportAiJson: (nodeId: NodeId) => void;
  onFitParent: (nodeId: NodeId) => void;
  onToggleCollapse: (nodeId: NodeId) => void;
  onRemoveFromView: (nodeId: NodeId) => void;
  onDeleteFromModel: (nodeId: NodeId) => void;
}) {
  return (
    <div
      ref={menuRef}
      className="cc-context-menu"
      role="menu"
      aria-label="Capability context menu"
      onKeyDown={onKeyDown}
      style={{
        left: menu.x,
        top: menu.y,
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => onInspect(menu.nodeId)}
      >
        Inspect
      </button>
      {!isTextLabelNode(node) && (
        <button
          type="button"
          role="menuitem"
          disabled={!canEditSourceModel}
          title={!canEditSourceModel ? sourceEditReason : undefined}
          onClick={() => onAddChild(menu.nodeId)}
        >
          Add child
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        disabled={!canEditSourceModel}
        title={!canEditSourceModel ? sourceEditReason : undefined}
        onClick={() => onDuplicate(menu.nodeId)}
      >
        Duplicate
      </button>
      {!isTextLabelNode(node) && (
        <button
          type="button"
          role="menuitem"
          onClick={() => onCopyAiPrompt(menu.nodeId)}
        >
          Copy AI prompt...
        </button>
      )}
      {!isTextLabelNode(node) && (
        <button
          type="button"
          role="menuitem"
          disabled={!canEditSourceModel}
          title={!canEditSourceModel ? sourceEditReason : undefined}
          onClick={() => onImportAiJson(menu.nodeId)}
        >
          Import AI JSON...
        </button>
      )}
      {hasCanvasChildren && (
        <button
          type="button"
          role="menuitem"
          onClick={() => onFitParent(menu.nodeId)}
        >
          Fit parent
        </button>
      )}
      {hasSourceChildren && (
        <button
          type="button"
          role="menuitem"
          onClick={() => onToggleCollapse(menu.nodeId)}
        >
          {isCollapsed ? "Expand in view" : "Collapse in view"}
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        onClick={() => onRemoveFromView(menu.nodeId)}
      >
        Remove from active view
      </button>
      <button
        type="button"
        role="menuitem"
        className="danger"
        disabled={!canEditSourceModel}
        title={!canEditSourceModel ? sourceEditReason : undefined}
        onClick={() => onDeleteFromModel(menu.nodeId)}
      >
        Delete from model
      </button>
    </div>
  );
}
