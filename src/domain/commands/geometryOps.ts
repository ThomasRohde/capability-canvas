import { cloneDocument } from "../document/normalize";
import {
  canvasChildrenOf,
  isNodeOnCanvas,
  now,
  type CapabilityDocument,
  type CapabilityNode,
  type NodeId,
} from "../document/types";
import { boundsForBoxes, rectanglesOverlap } from "../layout/bounds";
import { snapLayoutSpacing } from "../layout/grid";
import {
  evaluateCanvasLayoutIntent,
  type CanvasLayoutAction,
} from "../layout/canvasLayoutPolicy";
import { canAlign, canDistribute } from "../selection/rules";
import { info } from "../validation/diagnostics";
import { descendantsOf } from "../validation/validate";
import { canBulkEditNodes } from "./selectionGuards";
import { command, fail, ok, transaction } from "./transaction";
import type {
  AlignDirection,
  DistributionAxis,
  SizeAxis,
  Transaction,
} from "./types";

export function updateNodeSizes(
  nodeIds: NodeId[],
  patch: { w?: number; h?: number },
): Transaction {
  return transaction(
    "Update selected sizes",
    [
      command("update-node-sizes", { nodeIds, patch }, "source", (doc) => {
        if (nodeIds.length === 0) return ok(doc);
        const allowed = canBulkEditNodes(doc, nodeIds);
        if (!allowed.valid)
          return fail(
            doc,
            "invalid-selection",
            allowed.reason ?? "Invalid selection.",
          );
        if (!Object.hasOwn(patch, "w") && !Object.hasOwn(patch, "h"))
          return ok(doc);
        if (
          (patch.w !== undefined &&
            (!Number.isFinite(patch.w) || patch.w <= 0)) ||
          (patch.h !== undefined && (!Number.isFinite(patch.h) || patch.h <= 0))
        ) {
          return fail(
            doc,
            "invalid-size",
            "Size values must be positive numbers.",
          );
        }

        const next = cloneDocument(doc);
        let changed = false;
        for (const nodeId of nodeIds) {
          const node = next.nodesById[nodeId];
          if (!node)
            return fail(
              doc,
              "missing-node",
              "The selected capability no longer exists.",
            );
          if (node.isLockedAsIs)
            return fail(
              doc,
              "locked-node",
              "Preserved capabilities cannot be resized.",
            );
          const childBounds = node.isManualPositioningEnabled
            ? null
            : boundsForNodes(next, canvasChildrenOf(next, nodeId));
          const minW = childBounds
            ? childBounds.x +
              childBounds.w -
              node.x +
              (node.layoutPreferences?.marginRight ??
                next.settings.containerPaddingRight)
            : 80;
          const minH = childBounds
            ? childBounds.y +
              childBounds.h -
              node.y +
              (node.layoutPreferences?.marginBottom ??
                next.settings.containerPaddingBottom)
            : 44;
          const w = Math.max(minW, patch.w ?? node.w);
          const h = Math.max(minH, patch.h ?? node.h);
          if (w === node.w && h === node.h) continue;
          next.nodesById[nodeId] = {
            ...node,
            w,
            h,
            updatedAt: now(),
          };
          changed = true;
        }
        return ok(
          changed
            ? {
                ...next,
                layout: { ...next.layout, isUserArranged: true },
              }
            : doc,
        );
      }),
    ],
    { source: "bulk" },
  );
}

export function moveNodes(
  nodeIds: NodeId[],
  dx: number,
  dy: number,
): Transaction {
  return transaction(
    "Move capability",
    [
      command("move-nodes", { nodeIds, dx, dy }, "visual", (doc) => {
        const next = cloneDocument(doc);
        const toMove = new Set<NodeId>();
        for (const nodeId of nodeIds) {
          if (!next.nodesById[nodeId]) continue;
          toMove.add(nodeId);
          for (const descendantId of descendantsOf(next, nodeId))
            toMove.add(descendantId);
        }
        for (const id of toMove) {
          const node = next.nodesById[id];
          if (!node) continue;
          next.nodesById[id] = {
            ...node,
            x: node.x + dx,
            y: node.y + dy,
            updatedAt: now(),
          };
        }
        return ok({
          ...next,
          layout: { ...next.layout, isUserArranged: true },
        });
      }),
    ],
    { source: "drag" },
  );
}

interface MoveNodesWithLayoutIntentOptions {
  action?: Extract<
    CanvasLayoutAction,
    "move" | "keyboard-nudge" | "numeric-position" | "reparent"
  >;
  targetParentId?: NodeId | null;
}

export function moveNodesWithLayoutIntent(
  nodeIds: NodeId[],
  dx: number,
  dy: number,
  options: MoveNodesWithLayoutIntentOptions = {},
): Transaction {
  const action = options.action ?? "move";
  return transaction(
    action === "reparent" ? "Reparent capability" : "Move capability",
    [
      command(
        "move-nodes-with-layout-intent",
        { nodeIds, dx, dy, action, targetParentId: options.targetParentId },
        "visual",
        (doc) => {
          const intent = evaluateCanvasLayoutIntent({
            doc,
            action,
            rootNodeIds: nodeIds,
            targetParentId: options.targetParentId,
          });
          if (!intent.allowed)
            return fail(
              doc,
              intent.diagnosticCode ?? "layout-intent-rejected",
              intent.message ?? "The layout action could not be applied.",
            );

          const next = cloneDocument(doc);
          const toMove = new Set<NodeId>();
          for (const nodeId of nodeIds) {
            if (!next.nodesById[nodeId]) continue;
            toMove.add(nodeId);
            for (const descendantId of descendantsOf(next, nodeId))
              toMove.add(descendantId);
          }

          let changed = false;
          if (dx !== 0 || dy !== 0) {
            for (const id of toMove) {
              const node = next.nodesById[id];
              if (!node) continue;
              next.nodesById[id] = {
                ...node,
                x: node.x + dx,
                y: node.y + dy,
                updatedAt: now(),
              };
              changed = true;
            }
          }

          for (const parentId of intent.manualParentIdsToEnable) {
            const parent = next.nodesById[parentId];
            if (!parent || parent.isManualPositioningEnabled) continue;
            if (expandParentToContainCanvasChildren(next, parentId)) {
              changed = true;
            }
            const expandedParent = next.nodesById[parentId] ?? parent;
            next.nodesById[parentId] = {
              ...expandedParent,
              isManualPositioningEnabled: true,
              updatedAt: now(),
            };
            changed = true;
          }

          if (!changed) return ok(doc);

          return {
            doc: {
              ...next,
              layout: { ...next.layout, isUserArranged: true },
            },
            diagnostics: intent.diagnosticCode
              ? intent.manualParentIdsToEnable.map((parentId) =>
                  info(
                    intent.diagnosticCode!,
                    intent.message ??
                      "Manual positioning was enabled to preserve placement.",
                    parentId,
                  ),
                )
              : [],
          };
        },
      ),
    ],
    { source: "drag" },
  );
}

export function resizeNode(nodeId: NodeId, w: number, h: number): Transaction {
  return transaction(
    "Resize capability",
    [
      command("resize-node", { nodeId, w, h }, "visual", (doc) => {
        const node = doc.nodesById[nodeId];
        if (!node)
          return fail(
            doc,
            "missing-node",
            "The selected capability no longer exists.",
          );
        if (node.isLockedAsIs)
          return fail(
            doc,
            "locked-node",
            "Locked capabilities cannot be resized.",
          );
        const childBounds = node.isManualPositioningEnabled
          ? null
          : boundsForNodes(doc, canvasChildrenOf(doc, nodeId));
        const minW = childBounds
          ? childBounds.x +
            childBounds.w -
            node.x +
            (node.layoutPreferences?.marginRight ??
              doc.settings.containerPaddingRight)
          : 80;
        const minH = childBounds
          ? childBounds.y +
            childBounds.h -
            node.y +
            (node.layoutPreferences?.marginBottom ??
              doc.settings.containerPaddingBottom)
          : 40;
        return updateOnly(doc, nodeId, {
          w: Math.max(w, minW),
          h: Math.max(h, minH),
        });
      }),
    ],
    {
      relayout: {
        scope: (beforeDoc, afterDoc) => {
          const node =
            afterDoc.nodesById[nodeId] ?? beforeDoc.nodesById[nodeId];
          if (!node) return [];
          if (canvasChildrenOf(afterDoc, nodeId).length === 0) return [];
          if (node.isManualPositioningEnabled) return [];
          return [nodeId];
        },
        force: true,
      },
    },
  );
}

export function alignNodes(
  nodeIds: NodeId[],
  direction: AlignDirection,
): Transaction {
  return transaction(
    `Align ${direction}`,
    [
      command("align-nodes", { nodeIds, direction }, "visual", (doc) => {
        const allowed = canAlign(doc, nodeIds, { hierarchy: "canvas" });
        if (!allowed.valid)
          return fail(
            doc,
            "invalid-selection",
            allowed.reason ?? "Invalid selection.",
          );
        const nodes = nodeIds.map((id) => doc.nodesById[id]!);
        const next = cloneDocument(doc);
        const target = alignTarget(nodes, direction);
        const movedNodeIds = new Set<NodeId>();
        for (const node of nodes) {
          const patch =
            direction === "left"
              ? { x: target }
              : direction === "center"
                ? { x: target - node.w / 2 }
                : direction === "right"
                  ? { x: target - node.w }
                  : direction === "top"
                    ? { y: target }
                    : direction === "middle"
                      ? { y: target - node.h / 2 }
                      : { y: target - node.h };
          const dx = (patch.x ?? node.x) - node.x;
          const dy = (patch.y ?? node.y) - node.y;
          translateSubtree(next, node.id, dx, dy, movedNodeIds);
        }
        return ok({
          ...next,
          layout: { ...next.layout, isUserArranged: true },
        });
      }),
    ],
    { source: "bulk" },
  );
}

export function distributeNodes(
  nodeIds: NodeId[],
  axis: DistributionAxis,
): Transaction {
  return transaction(
    `Distribute ${axis}`,
    [
      command("distribute-nodes", { nodeIds, axis }, "visual", (doc) => {
        const allowed = canDistribute(doc, nodeIds, { hierarchy: "canvas" });
        if (!allowed.valid)
          return fail(
            doc,
            "invalid-selection",
            allowed.reason ?? "Invalid selection.",
          );
        const nodes = nodeIds
          .map((id) => doc.nodesById[id]!)
          .sort((a, b) => (axis === "horizontal" ? a.x - b.x : a.y - b.y));
        const first = nodes[0]!;
        const last = nodes[nodes.length - 1]!;
        const totalSize = nodes.reduce(
          (sum, node) => sum + (axis === "horizontal" ? node.w : node.h),
          0,
        );
        const span =
          axis === "horizontal"
            ? last.x + last.w - first.x
            : last.y + last.h - first.y;
        const gap = (span - totalSize) / (nodes.length - 1);
        const next = cloneDocument(doc);
        let cursor = axis === "horizontal" ? first.x : first.y;
        const movedNodeIds = new Set<NodeId>();
        for (const node of nodes) {
          const dx = axis === "horizontal" ? cursor - node.x : 0;
          const dy = axis === "vertical" ? cursor - node.y : 0;
          translateSubtree(next, node.id, dx, dy, movedNodeIds);
          cursor += (axis === "horizontal" ? node.w : node.h) + gap;
        }
        return ok({
          ...next,
          layout: { ...next.layout, isUserArranged: true },
        });
      }),
    ],
    { source: "bulk" },
  );
}

export function sameSize(
  nodeIds: NodeId[],
  anchorId: NodeId,
  axis: SizeAxis = "both",
): Transaction {
  return transaction(
    "Same size",
    [
      command("same-size", { nodeIds, anchorId, axis }, "visual", (doc) => {
        if (nodeIds.length === 0) return ok(doc);
        const allowed = canBulkEditNodes(doc, nodeIds, {
          hierarchy: "canvas",
        });
        if (!allowed.valid)
          return fail(
            doc,
            "invalid-selection",
            allowed.reason ?? "Invalid selection.",
          );
        const anchor = doc.nodesById[anchorId];
        if (!anchor)
          return fail(doc, "missing-anchor", "Anchor node no longer exists.");
        const next = cloneDocument(doc);
        let changed = false;
        for (const id of nodeIds) {
          const node = next.nodesById[id];
          if (!node || node.isLockedAsIs) continue;
          const minSize = minimumSizeForNode(next, node);
          const w =
            axis === "height" ? node.w : Math.max(anchor.w, minSize.w);
          const h =
            axis === "width" ? node.h : Math.max(anchor.h, minSize.h);
          if (node.w === w && node.h === h) continue;
          next.nodesById[id] = {
            ...node,
            w,
            h,
            updatedAt: now(),
          };
          changed = true;
        }
        return ok(
          changed
            ? {
                ...next,
                layout: { ...next.layout, isUserArranged: true },
              }
            : doc,
        );
      }),
    ],
    { source: "bulk" },
  );
}

export function fitParentToChildren(nodeId: NodeId): Transaction {
  return transaction("Fit parent to children", [
    command("fit-parent-to-children", { nodeId }, "visual", (doc) => {
      const node = doc.nodesById[nodeId];
      if (!node)
        return fail(
          doc,
          "missing-node",
          "The selected capability no longer exists.",
        );
      if (node.isLockedAsIs)
        return fail(
          doc,
          "locked-node",
          "Locked capabilities cannot be resized.",
        );
      const bounds = boundsForNodes(doc, canvasChildrenOf(doc, nodeId));
      if (!bounds) return ok(doc);
      const margin = {
        top: snapLayoutSpacing(
          doc,
          (node.layoutPreferences?.marginTop ??
            doc.settings.containerPaddingTop) +
            doc.settings.containerTitleHeight,
        ),
        right: snapLayoutSpacing(
          doc,
          node.layoutPreferences?.marginRight ??
            doc.settings.containerPaddingRight,
        ),
        bottom: snapLayoutSpacing(
          doc,
          node.layoutPreferences?.marginBottom ??
            doc.settings.containerPaddingBottom,
        ),
        left: snapLayoutSpacing(
          doc,
          node.layoutPreferences?.marginLeft ??
            doc.settings.containerPaddingLeft,
        ),
      };
      const x = bounds.x - margin.left;
      const y = bounds.y - margin.top;
      return updateOnly(doc, nodeId, {
        x,
        y,
        w: bounds.x + bounds.w - x + margin.right,
        h: bounds.y + bounds.h - y + margin.bottom,
      });
    }),
  ]);
}

export function repairSiblingOverlaps(parentId: NodeId): Transaction {
  return transaction("Resolve sibling overlap", [
    command("repair-sibling-overlaps", { parentId }, "visual", (doc) => {
      const parent = doc.nodesById[parentId];
      if (!parent) return ok(doc);
      const childIds = canvasChildrenOf(doc, parentId);
      if (childIds.length < 2) return ok(doc);
      const next = cloneDocument(doc);
      const movable = childIds
        .map((id) => next.nodesById[id])
        .filter(
          (node): node is NonNullable<typeof node> =>
            !!node && !node.isLockedAsIs && !node.isManualPositioningEnabled,
        );
      if (movable.length < 2) return ok(doc);
      let changed = false;
      const placed: typeof movable = [];
      for (const node of [...movable].sort(
        (a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id),
      )) {
        const x = node.x;
        let y = node.y;
        let nudges = 0;
        while (
          placed.some((other) => rectanglesOverlap({ ...node, x, y }, other)) &&
          nudges < 64
        ) {
          y += doc.settings.childGapY;
          nudges += 1;
        }
        if (y !== node.y) {
          changed = true;
          next.nodesById[node.id] = { ...node, x, y, updatedAt: now() };
          placed.push(next.nodesById[node.id]!);
        } else {
          placed.push(node);
        }
      }
      if (!changed) return ok(doc);
      return ok(next);
    }),
  ]);
}

export function lockSubtree(nodeId: NodeId, locked: boolean): Transaction {
  return transaction(locked ? "Lock subtree" : "Unlock subtree", [
    command("lock-subtree", { nodeId, locked }, "visual", (doc) => {
      const next = cloneDocument(doc);
      for (const id of [nodeId, ...descendantsOf(next, nodeId)]) {
        const node = next.nodesById[id];
        if (node)
          next.nodesById[id] = {
            ...node,
            isLockedAsIs: locked,
            updatedAt: now(),
          };
      }
      return ok(next);
    }),
  ]);
}

export function lockSubtrees(nodeIds: NodeId[], locked: boolean): Transaction {
  return transaction(
    locked ? "Preserve selected layouts" : "Stop preserving selected layouts",
    [
      command("lock-subtrees", { nodeIds, locked }, "source", (doc) => {
        if (nodeIds.length === 0) return ok(doc);
        const allowed = canBulkEditNodes(doc, nodeIds);
        if (!allowed.valid)
          return fail(
            doc,
            "invalid-selection",
            allowed.reason ?? "Invalid selection.",
          );
        const next = cloneDocument(doc);
        let changed = false;
        const toLock = new Set<NodeId>();
        for (const nodeId of nodeIds) {
          toLock.add(nodeId);
          for (const descendantId of descendantsOf(next, nodeId))
            toLock.add(descendantId);
        }
        for (const id of toLock) {
          const node = next.nodesById[id];
          if (!node)
            return fail(
              doc,
              "missing-node",
              "The selected capability no longer exists.",
            );
          if (node.isLockedAsIs === locked) continue;
          next.nodesById[id] = {
            ...node,
            isLockedAsIs: locked,
            updatedAt: now(),
          };
          changed = true;
        }
        return ok(changed ? next : doc);
      }),
    ],
    { source: "bulk" },
  );
}

export function setManualPositioning(
  nodeId: NodeId,
  enabled: boolean,
): Transaction {
  return transaction("Set manual positioning", [
    command("set-manual-positioning", { nodeId, enabled }, "visual", (doc) => {
      const node = doc.nodesById[nodeId];
      if (!node)
        return fail(
          doc,
          "missing-node",
          "The selected capability no longer exists.",
        );
      const next = cloneDocument(doc);
      next.nodesById[nodeId] = {
        ...node,
        isManualPositioningEnabled: enabled,
        updatedAt: now(),
      };
      return ok(next);
    }),
  ]);
}

export function setManualPositioningForNodes(
  nodeIds: NodeId[],
  enabled: boolean,
): Transaction {
  return transaction(
    enabled
      ? "Enable selected manual positioning"
      : "Disable selected manual positioning",
    [
      command(
        "set-manual-positioning-for-nodes",
        { nodeIds, enabled },
        "source",
        (doc) => {
          if (nodeIds.length === 0) return ok(doc);
          const allowed = canBulkEditNodes(doc, nodeIds);
          if (!allowed.valid)
            return fail(
              doc,
              "invalid-selection",
              allowed.reason ?? "Invalid selection.",
            );
          const next = cloneDocument(doc);
          let changed = false;
          for (const nodeId of nodeIds) {
            const node = next.nodesById[nodeId];
            if (!node)
              return fail(
                doc,
                "missing-node",
                "The selected capability no longer exists.",
              );
            if (node.isManualPositioningEnabled === enabled) continue;
            next.nodesById[nodeId] = {
              ...node,
              isManualPositioningEnabled: enabled,
              updatedAt: now(),
            };
            changed = true;
          }
          return ok(changed ? next : doc);
        },
      ),
    ],
    { source: "bulk" },
  );
}

function updateOnly(
  doc: CapabilityDocument,
  nodeId: NodeId,
  patch: Partial<CapabilityNode>,
) {
  const next = cloneDocument(doc);
  const node = next.nodesById[nodeId];
  if (!node)
    return fail(
      doc,
      "missing-node",
      "The selected capability no longer exists.",
    );
  next.nodesById[nodeId] = { ...node, ...patch, updatedAt: now() };
  return ok(next);
}

function translateSubtree(
  doc: CapabilityDocument,
  nodeId: NodeId,
  dx: number,
  dy: number,
  movedNodeIds: Set<NodeId>,
) {
  for (const id of [nodeId, ...descendantsOf(doc, nodeId)]) {
    if (movedNodeIds.has(id)) continue;
    const node = doc.nodesById[id];
    if (!node) continue;
    doc.nodesById[id] = {
      ...node,
      x: node.x + dx,
      y: node.y + dy,
      updatedAt: now(),
    };
    movedNodeIds.add(id);
  }
}

function alignTarget(
  nodes: CapabilityNode[],
  direction: AlignDirection,
): number {
  const minX = Math.min(...nodes.map((node) => node.x));
  const maxX = Math.max(...nodes.map((node) => node.x + node.w));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxY = Math.max(...nodes.map((node) => node.y + node.h));
  if (direction === "left") return minX;
  if (direction === "center") return minX + (maxX - minX) / 2;
  if (direction === "right") return maxX;
  if (direction === "top") return minY;
  if (direction === "middle") return minY + (maxY - minY) / 2;
  return maxY;
}

function boundsForNodes(doc: CapabilityDocument, ids: NodeId[]) {
  const nodes = ids
    .map((id) => doc.nodesById[id])
    .filter((node): node is CapabilityNode => !!node && isNodeOnCanvas(node));
  return boundsForBoxes(nodes);
}

function expandParentToContainCanvasChildren(
  doc: CapabilityDocument,
  parentId: NodeId,
): boolean {
  const parent = doc.nodesById[parentId];
  if (!parent || parent.isLockedAsIs || !isNodeOnCanvas(parent)) return false;
  const childBounds = boundsForNodes(doc, canvasChildrenOf(doc, parentId));
  if (!childBounds) return false;

  const margin = containmentMargin(doc, parent);
  const x = Math.min(parent.x, childBounds.x - margin.left);
  const y = Math.min(parent.y, childBounds.y - margin.top);
  const right = Math.max(
    parent.x + parent.w,
    childBounds.x + childBounds.w + margin.right,
  );
  const bottom = Math.max(
    parent.y + parent.h,
    childBounds.y + childBounds.h + margin.bottom,
  );
  const w = right - x;
  const h = bottom - y;

  if (x === parent.x && y === parent.y && w === parent.w && h === parent.h) {
    return false;
  }
  doc.nodesById[parentId] = {
    ...parent,
    x,
    y,
    w,
    h,
    updatedAt: now(),
  };
  return true;
}

function containmentMargin(doc: CapabilityDocument, parent: CapabilityNode) {
  return {
    top:
      (parent.layoutPreferences?.marginTop ??
        doc.settings.containerPaddingTop) + doc.settings.containerTitleHeight,
    right:
      parent.layoutPreferences?.marginRight ??
      doc.settings.containerPaddingRight,
    bottom:
      parent.layoutPreferences?.marginBottom ??
      doc.settings.containerPaddingBottom,
    left:
      parent.layoutPreferences?.marginLeft ??
      doc.settings.containerPaddingLeft,
  };
}

function minimumSizeForNode(doc: CapabilityDocument, node: CapabilityNode) {
  const childBounds = node.isManualPositioningEnabled
    ? null
    : boundsForNodes(doc, canvasChildrenOf(doc, node.id));
  return {
    w: childBounds
      ? childBounds.x +
        childBounds.w -
        node.x +
        (node.layoutPreferences?.marginRight ??
          doc.settings.containerPaddingRight)
      : 80,
    h: childBounds
      ? childBounds.y +
        childBounds.h -
        node.y +
        (node.layoutPreferences?.marginBottom ??
          doc.settings.containerPaddingBottom)
      : 40,
  };
}
