# Domain Model

## Conceptual Model

A diagram is a rooted forest of nodes. Each node has geometry, presentation properties, optional metadata, and at most one parent. Parent-child containment is the primary semantic relationship.

The implementation can store this as arrays, maps, normalized tables, immutable records, CRDT documents, or another structure. The observable behavior must preserve the invariants below.

## Diagram

A diagram contains:

- A versioned file/schema identifier.
- Nodes.
- Global settings for layout and appearance.
- Optional heatmap state.
- Optional viewport or UI state if the implementation chooses to persist it.
- Layout metadata that explains whether positions should be preserved.
- A timestamp or equivalent metadata useful for export/debugging.

## Node

Required node fields:

- `id`: stable unique string.
- `parentId`: optional id of the parent node.
- `label`: display name.
- `x`, `y`: position in diagram coordinates.
- `w`, `h`: positive dimensions in diagram coordinates.
- `type`: one of root, parent, leaf, or text label.
- `color`: visual fill or equivalent style token.

Important optional fields:

- `description`: richer explanatory text.
- `metadata`: extensible structured data.
- `layoutPreferences`: local preferences used by automatic layout.
- `isManualPositioningEnabled`: children of this node can be positioned directly by the user.
- `isLockedAsIs`: preserve this node's size and placement across layout recalculation.
- `isTextLabel`: text-only item that behaves differently from regular domain nodes.
- Text label styling such as font family, size, weight, and alignment.
- `heatmapValue`: numeric value in the inclusive range 0 to 1.

Implementations may rename internal fields, but the product should expose a stable, versioned document format at import/export boundaries.

## Node Types

- Root: top-level container with no parent.
- Parent: node with children. A root can also have children, but root describes its top-level role.
- Leaf: terminal domain node.
- Text label: annotation-like text item. It should not act as a parent.

Node type can be explicit or derived internally. Exported data should be explicit enough for integrations and future migrations to interpret.

## Invariants

The app must maintain these invariants:

- Every node id is unique.
- A node has zero or one parent.
- A parent id, when present, references a node in the same document.
- The hierarchy is acyclic.
- Root nodes have no parent.
- Text labels cannot have children.
- Width and height are finite positive values.
- Coordinates and dimensions are finite numbers.
- Deleted parent nodes also remove or intentionally re-home descendants. The operation must not leave orphans.
- Automatic layout must not move locked nodes unless the user explicitly unlocks them or chooses a destructive repair.
- Manual child positions under manual parents must round-trip through save/export/import.
- Heatmap values must be undefined or in the range 0 to 1.

## Layout Semantics

Layout is a deterministic transformation from:

- the hierarchy,
- node dimensions,
- global settings,
- local layout preferences,
- manual/locked flags,
- and selected algorithm rules

to positions and parent dimensions.

Required behavior:

- Children should fit visually within parents with margins.
- Parents should be able to grow to contain children.
- Leaf nodes can follow fixed width/height settings unless locked.
- Manual positioning can be enabled per parent.
- Locked nodes preserve exact dimensions and placement.
- Imported diagrams that request position preservation should open without unwanted relayout.
- The same input should produce the same automatic layout result.

Algorithm names are not sacred. The product should provide layout modes that preserve these user-facing intents:

- predictable uniform layout for many similar children,
- readable flow layout for hierarchy,
- adaptive compact layout for mixed child sizes.

## Selection Rules

Single selection can target any valid node.

Multi-selection is constrained:

- All selected regular nodes must share the same parent.
- Root nodes can multi-select only with other roots.
- Text labels are excluded from multi-selection unless a future implementation designs a safe dedicated label workflow.
- Alignment requires at least two selected nodes.
- Distribution requires at least three selected nodes.
- Bulk movement of children requires the common parent to allow manual positioning. Root nodes can be moved together.

## Core Operations

Implementations should expose equivalent behavior for:

- Add root.
- Add child to a selected node.
- Add text label if the feature is included.
- Edit label.
- Edit description.
- Edit color and style.
- Set or clear heatmap value.
- Delete node or selection.
- Copy, paste, and duplicate nodes while preserving descendants.
- Reparent a node, with cycle and text-label validation.
- Move nodes manually where allowed.
- Resize nodes where allowed.
- Fit parent to children.
- Lock and unlock layout for a subtree.
- Align selected siblings.
- Distribute selected siblings.
- Make selected siblings the same size.
- Undo and redo model-changing operations.

Operations should be transactional from the user's perspective. A failed operation should leave the diagram in a valid prior state.

## Document Format

Capability Canvas should define a versioned JSON document format. A compact greenfield shape could look like this:

```json
{
  "schema": "capability-canvas.document",
  "version": "1.0",
  "nodes": [],
  "settings": {},
  "layout": {
    "mode": "adaptive",
    "isUserArranged": false,
    "preservePositions": true,
    "boundingBox": { "w": 0, "h": 0 }
  },
  "heatmap": {},
  "timestamp": 0
}
```

The exact field names can evolve during design, but the chosen format should be documented, validated, and migration-ready from the first implementation.

Validation requirements:

- Reject or repair malformed data with clear user feedback.
- Report duplicate ids, missing parents, invalid dimensions, invalid versions, and invalid heatmap values.
- Preserve unknown metadata fields where practical.
