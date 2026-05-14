import {
  isHierarchyAncestorOf,
  ROOT_PARENT_ID,
  type CapabilityDocument,
  type LayoutMode,
  type NodeId,
} from "../document/types";
import { canvasSelectionParentId } from "../selection/rules";

export type CanvasLayoutAction =
  | "move"
  | "keyboard-nudge"
  | "numeric-position"
  | "reparent"
  | "add-child"
  | "resize"
  | "auto-layout";

export const MANUAL_POSITIONING_ENABLED_BY_MOVE =
  "manual-positioning-enabled-by-move";
export const MANUAL_POSITIONING_ENABLED_BY_REPARENT =
  "manual-positioning-enabled-by-reparent";
export const MANUAL_POSITIONING_NOTICE =
  "Parent switched to Manual so your placement is preserved.";

export interface CanvasLayoutIntentInput {
  doc: CapabilityDocument;
  action: CanvasLayoutAction;
  rootNodeIds: NodeId[];
  targetParentId?: NodeId | null;
  activeLayoutMode?: LayoutMode;
}

export interface CanvasLayoutIntentResult {
  allowed: boolean;
  manualParentIdsToEnable: NodeId[];
  diagnosticCode?: string;
  message?: string;
  notice?: string;
  skipAutoRelayout: boolean;
  requestAutoRelayout: boolean;
}

const AUTOMATIC_LAYOUT_MODES = new Set<LayoutMode>([
  "adaptive",
  "balanced",
  "flow",
  "uniform",
]);

export function isAutomaticLayoutMode(mode: LayoutMode): boolean {
  return AUTOMATIC_LAYOUT_MODES.has(mode);
}

export function evaluateCanvasLayoutIntent(
  input: CanvasLayoutIntentInput,
): CanvasLayoutIntentResult {
  const mode =
    input.activeLayoutMode ?? input.doc.settings.layoutMode ?? input.doc.layout.mode;
  if (input.action === "auto-layout") {
    return okIntent({
      skipAutoRelayout: mode === "free",
      requestAutoRelayout: mode !== "free",
    });
  }

  if (input.action === "add-child") {
    return evaluateAddChildIntent(input, mode);
  }

  if (input.action === "reparent") {
    const rejected = validateReparentTarget(input);
    if (rejected) return rejected;
    return okIntent({
      manualParentIdsToEnable: manualParentsForIds(
        input.doc,
        input.targetParentId === undefined ? [] : [input.targetParentId],
        mode,
      ),
      diagnosticCode: MANUAL_POSITIONING_ENABLED_BY_REPARENT,
    });
  }

  if (isDirectMoveAction(input.action)) {
    const rejected = validateMoveRoots(input);
    if (rejected) return rejected;
    const parentIds = input.rootNodeIds
      .map((nodeId) => {
        const node = input.doc.nodesById[nodeId];
        return node ? canvasSelectionParentId(input.doc, node) : null;
      })
      .filter((parentId): parentId is NodeId => !!parentId);
    return okIntent({
      manualParentIdsToEnable: manualParentsForIds(input.doc, parentIds, mode),
      diagnosticCode: MANUAL_POSITIONING_ENABLED_BY_MOVE,
      skipAutoRelayout: true,
    });
  }

  return okIntent({ skipAutoRelayout: mode === "free" });
}

function evaluateAddChildIntent(
  input: CanvasLayoutIntentInput,
  mode: LayoutMode,
): CanvasLayoutIntentResult {
  const parentId = input.targetParentId ?? input.rootNodeIds[0];
  if (!parentId) return okIntent({ skipAutoRelayout: mode === "free" });
  const parent = input.doc.nodesById[parentId];
  if (!parent) {
    return rejectIntent("missing-parent", "Select a valid parent.");
  }
  if (parent.isTextLabel || parent.type === "text") {
    return rejectIntent("text-label-parent", "Text labels cannot contain children.");
  }
  const shouldRelayout =
    isAutomaticLayoutMode(mode) &&
    !parent.isManualPositioningEnabled &&
    !parent.isLockedAsIs;
  return okIntent({
    skipAutoRelayout: !shouldRelayout,
    requestAutoRelayout: shouldRelayout,
  });
}

function validateMoveRoots(
  input: CanvasLayoutIntentInput,
): CanvasLayoutIntentResult | null {
  const parentKeys = new Set<string>();
  for (const nodeId of input.rootNodeIds) {
    const node = input.doc.nodesById[nodeId];
    if (!node) return rejectIntent("missing-node", "A selected node is missing.");
    parentKeys.add(canvasSelectionParentId(input.doc, node) ?? ROOT_PARENT_ID);
  }
  if (parentKeys.size > 1) {
    return rejectIntent(
      "invalid-selection",
      "Manual movement requires sibling capabilities.",
    );
  }
  return null;
}

function validateReparentTarget(
  input: CanvasLayoutIntentInput,
): CanvasLayoutIntentResult | null {
  const [nodeId] = input.rootNodeIds;
  if (!nodeId || !input.doc.nodesById[nodeId]) {
    return rejectIntent("missing-node", "The selected capability no longer exists.");
  }
  const targetParentId = input.targetParentId ?? null;
  if (targetParentId === null) return null;
  const target = input.doc.nodesById[targetParentId];
  if (!target) {
    return rejectIntent("missing-parent", "Drop target no longer exists.");
  }
  if (target.isTextLabel || target.type === "text") {
    return rejectIntent("text-label-parent", "Text labels cannot contain children.");
  }
  if (target.isLockedAsIs) {
    return rejectIntent("locked-parent", "Drop target is locked.");
  }
  if (isHierarchyAncestorOf(input.doc, nodeId, targetParentId)) {
    return rejectIntent("cycle", "A node cannot be moved into its descendant.");
  }
  return null;
}

function manualParentsForIds(
  doc: CapabilityDocument,
  parentIds: Array<NodeId | null>,
  mode: LayoutMode,
): NodeId[] {
  if (!isAutomaticLayoutMode(mode)) return [];
  const manualParentIds: NodeId[] = [];
  const seen = new Set<NodeId>();
  for (const parentId of parentIds) {
    if (!parentId || seen.has(parentId)) continue;
    const parent = doc.nodesById[parentId];
    if (
      !parent ||
      parent.isManualPositioningEnabled ||
      parent.isLockedAsIs
    ) {
      continue;
    }
    seen.add(parentId);
    manualParentIds.push(parentId);
  }
  return manualParentIds;
}

function isDirectMoveAction(action: CanvasLayoutAction): boolean {
  return (
    action === "move" ||
    action === "keyboard-nudge" ||
    action === "numeric-position"
  );
}

function okIntent(
  partial: Partial<CanvasLayoutIntentResult> = {},
): CanvasLayoutIntentResult {
  const manualParentIdsToEnable = partial.manualParentIdsToEnable ?? [];
  const diagnosticCode =
    manualParentIdsToEnable.length > 0 ? partial.diagnosticCode : undefined;
  return {
    allowed: true,
    manualParentIdsToEnable,
    diagnosticCode,
    message: diagnosticCode ? MANUAL_POSITIONING_NOTICE : undefined,
    notice: diagnosticCode ? MANUAL_POSITIONING_NOTICE : undefined,
    skipAutoRelayout: partial.skipAutoRelayout ?? false,
    requestAutoRelayout: partial.requestAutoRelayout ?? false,
  };
}

function rejectIntent(code: string, message: string): CanvasLayoutIntentResult {
  return {
    allowed: false,
    manualParentIdsToEnable: [],
    diagnosticCode: code,
    message,
    skipAutoRelayout: true,
    requestAutoRelayout: false,
  };
}
