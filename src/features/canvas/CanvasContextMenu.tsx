import type { KeyboardEvent, RefObject } from "react";
import type { CapabilityNode, NodeId } from "../../domain/document/types";

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
  onKeyDown,
  onInspect,
  onAddChild,
  onDuplicate,
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
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onInspect: (nodeId: NodeId) => void;
  onAddChild: (nodeId: NodeId) => void;
  onDuplicate: (nodeId: NodeId) => void;
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
      {!node.isTextLabel && node.type !== "text" && (
        <button
          type="button"
          role="menuitem"
          onClick={() => onAddChild(menu.nodeId)}
        >
          Add child
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        onClick={() => onDuplicate(menu.nodeId)}
      >
        Duplicate
      </button>
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
        onClick={() => onDeleteFromModel(menu.nodeId)}
      >
        Delete from model
      </button>
    </div>
  );
}
