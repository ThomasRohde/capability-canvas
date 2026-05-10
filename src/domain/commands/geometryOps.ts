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
import { canAlign, canDistribute } from "../selection/rules";
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
        const allowed = canAlign(doc, nodeIds);
        if (!allowed.valid)
          return fail(
            doc,
            "invalid-selection",
            allowed.reason ?? "Invalid selection.",
          );
        const nodes = nodeIds.map((id) => doc.nodesById[id]!);
        const next = cloneDocument(doc);
        const target = alignTarget(nodes, direction);
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
          next.nodesById[node.id] = { ...node, ...patch, updatedAt: now() };
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
        const allowed = canDistribute(doc, nodeIds);
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
        for (const node of nodes) {
          next.nodesById[node.id] =
            axis === "horizontal"
              ? { ...node, x: cursor, updatedAt: now() }
              : { ...node, y: cursor, updatedAt: now() };
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
        const anchor = doc.nodesById[anchorId];
        if (!anchor)
          return fail(doc, "missing-anchor", "Anchor node no longer exists.");
        const next = cloneDocument(doc);
        for (const id of nodeIds) {
          const node = next.nodesById[id];
          if (!node || node.isLockedAsIs) continue;
          next.nodesById[id] = {
            ...node,
            w: axis === "height" ? node.w : anchor.w,
            h: axis === "width" ? node.h : anchor.h,
            updatedAt: now(),
          };
        }
        return ok(next);
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
