# Canvas Modeling UX Correctness Review

This note records the expected layout semantics for direct canvas modeling
actions. It is meant to keep behavior discoverable outside event handlers such
as `src/features/canvas/useCanvasNodeInteractions.ts`,
`src/features/commands/useEditorActions.ts`, and
`src/features/inspector/LayoutTab.tsx`.

## Terms

- **Automatic layout mode**: one of `adaptive`, `balanced`, `flow`, or
  `uniform`. Eligible nodes can be arranged by `layoutDocument()` in
  `src/domain/layout/engine.ts`.
- **Freeform layout mode**: `free`. Freeform preserves current positions and
  does not apply automatic arrangement.
- **Manual child positioning**: `isManualPositioningEnabled` on a parent. The
  selected parent's children keep direct canvas positions and are skipped by
  automatic layout.
- **Preserve/locked subtree**: `isLockedAsIs` on a node or active-view
  `lockedForView`. The subtree is skipped by automatic layout and resize
  controls are disabled, while deliberate movement remains allowed.

## Action Semantics Matrix

| Action | Automatic Layout Modes | Freeform Layout Mode | Manual Parent State | Preserve/Locked State |
| --- | --- | --- | --- | --- |
| Add root | Add a root at a deterministic canvas position. Later auto layout may arrange eligible roots. | Add a root at a deterministic canvas position and preserve it. | Not applicable because roots have no arranging parent. | A locked existing root is not changed by adding a different root. |
| Add child | Under an automatic parent, add the child and allow scoped automatic relayout for that parent. | Add the child at a deterministic position and preserve positions. | Under a Manual parent, preserve existing child coordinates and place the new child deterministically. | Under a locked parent, do not resize or relayout the locked subtree; place conservatively. |
| Drag/move | Moving a child under an automatic parent switches that direct parent to Manual in the same undo step. Moving a root has no Manual parent to switch. | Move the node and preserve positions without switching a parent solely for Freeform. | Existing Manual parents stay Manual; only selected root nodes define the affected arranging parent. | Locked nodes can be moved deliberately, but automatic layout still preserves locked subtrees. |
| Keyboard nudge | Same semantics as drag/move; the direct arranging parent becomes Manual when needed. | Nudge preserves positions without automatic arrangement. | Existing Manual state is preserved. | Locked nodes remain resize-protected. |
| Numeric X/Y move | Same semantics as drag/move when committed from the Layout tab. | Numeric movement preserves positions. | Existing Manual state is preserved. | Locked nodes can still change X/Y; W/H remain disabled. |
| Resize | Resize commits one transaction and may trigger scoped relayout only for eligible children. | Resize preserves current positions. | Manual parents preserve child positions while resizing. | Locked nodes cannot be resized through the UI. |
| Reparent by drag | Reparent the source hierarchy, preserve the drop position in the active view, and switch the destination parent to Manual when needed. | Reparent and preserve the visible drop position without automatic arrangement. | A Manual destination remains Manual without redundant conversion. | Text labels, locked targets, and cycle-creating targets remain invalid. |
| Align | Align valid sibling selections as one bulk geometry edit. | Align preserves the resulting positions. | Valid Manual sibling groups remain directly arranged. | Locked selected nodes are not resized; movement restrictions follow existing bulk rules. |
| Distribute | Distribute valid sibling selections as one bulk geometry edit. | Distribute preserves the resulting positions. | Valid Manual sibling groups remain directly arranged. | Preserve/locked resize semantics remain unchanged. |
| Same size | Match sizes for valid sibling selections and mark layout user-arranged. | Match sizes without automatic arrangement. | Manual child positions are not automatically rearranged. | Locked selected nodes are skipped by existing sizing rules. |
| Fit parent | Resize the selected parent to its current children without moving children. | Same behavior; no automatic arrangement. | Manual child positions are retained. | Locked parents cannot be resized. |
| Apply auto layout | Arrange eligible areas; Manual child groups and locked subtrees are preserved with diagnostics when partial. | No geometry changes; report `free-layout-preserved`. | Manual parents preserve their children. | Locked subtrees are skipped. |
| Change layout mode | Switching to an automatic mode may arrange eligible active-view nodes when requested. | Switching to Freeform preserves positions. | Manual parent flags continue to protect child positions. | Preserve/locked flags continue to protect subtrees. |
| Toggle Manual | Turns child positioning for the selected parent on or off in the active view. | Still meaningful because it controls future automatic modes. | Manual applies to children of the selected parent, not the selected node's own position. | Preserve remains a separate subtree lock. |
| Toggle Preserve | Toggles subtree preservation and resize lock for the selected node/subtree. | Freeform still preserves positions; Preserve remains explicit. | Manual child positioning and Preserve can coexist but mean different things. | Preserve skips the subtree during automatic layout and disables resize. |
| Collapse/expand in view | Changes active-view visibility/collapse state without deleting source model data. | Same behavior. | Manual flags remain stored in active-view node state. | Locked state remains stored in active-view node state. |
| Remove from active view | Hide visible nodes in the active view without deleting the source hierarchy. | Same behavior. | Manual flags are not used to restore hidden nodes. | Preserve flags are not used to restore hidden nodes. |
| Delete from model | Delete source model nodes and descendants through a source command. | Same behavior. | Manual active-view overrides for deleted nodes are removed by visual workspace reconciliation. | Preserve active-view overrides for deleted nodes are removed by visual workspace reconciliation. |

## Maintenance Notes

- Direct movement policy lives in `src/domain/layout/canvasLayoutPolicy.ts`.
- Geometry commits still use command transactions in `src/domain/commands/`.
- Pointermove and resize preview state must remain in
  `src/app/stores/transientStore.ts`; committed document changes happen on
  pointer-up or field/keyboard commit only.
- Visual-view behavior is intentional: visual commands operate on the resolved
  active view and write back active-view node state through
  `applyResolvedVisualDocument()`.
