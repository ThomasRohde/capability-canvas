# Interaction Contracts

These contracts describe behavior users should recognize in a modern implementation. They are not prescriptions for components, hooks, or state libraries.

## Canvas

The canvas is the primary workspace.

Required behavior:

- Pan by direct pointer interaction and/or a modifier gesture.
- Zoom in and out around a meaningful focal point.
- Fit the viewport to all visible diagram content.
- Support large coordinate spaces without forcing content into a fixed page.
- Show a grid when enabled.
- Keep text and controls legible across common zoom levels.
- Prevent accidental browser text selection during drag-like operations.

Helpful behavior:

- Minimap or overview navigation for large diagrams.
- Keyboard shortcut for fit view.
- Search and jump to matching nodes.

## Node Rendering

Regular nodes render as labeled containers. Parent nodes make their containment role visually clear. Leaf nodes should be compact and readable. Text labels render as annotation-like text without implying containment.

Rendering should respect:

- hierarchy depth and z-order,
- selected and multi-selected states,
- drag/resize/hierarchy-drag states,
- locked/manual layout indicators,
- heatmap color overrides,
- global font and border settings,
- readable text contrast.

Memoization and virtualization are implementation details, but visual state changes must never get stuck because rendering skipped a relevant prop or state dependency.

## Creating And Editing

Required workflows:

- Add a root node.
- Add a child under the current selection.
- Edit a node label quickly from the canvas.
- Edit richer properties from an inspector or equivalent panel.
- Update color and appearance.
- Add or edit description text.
- Toggle or configure text label behavior if text labels are supported.

Creation should choose sensible defaults, including color, dimensions, and initial placement.

## Automatic And Manual Layout

Users must be able to rely on automatic layout for normal hierarchy building. They must also be able to preserve deliberate manual arrangements.

Required behavior:

- Automatic layout arranges children inside parents with margins.
- Parent size can grow to contain children.
- Layout updates propagate through descendants when needed.
- Manual positioning can be enabled for a parent.
- Locking a node preserves its exact layout. Locking a parent should protect the intended subtree.
- Import and restore flows should avoid unexpected relayout when layout metadata asks for preservation.
- Any automatic layout recalculation should be undoable or reversible through a clear affordance.

## Drag, Resize, And Reparent

Dragging a node should move it where the current mode allows. Dragging a parent should keep descendants visually synchronized.

Required behavior:

- Moves are constrained enough to avoid corrupting parent-child containment.
- Reparenting validates target nodes and prevents cycles.
- Text labels cannot become parents.
- Locked nodes and locked target parents reject invalid operations.
- Resize operations respect minimum sizes needed for children.
- Drag feedback should be immediate even on large diagrams.

## Selection And Bulk Operations

Required behavior:

- Single-click or equivalent selects one node.
- Modifier-click or drag selection can create multi-selections within the selection rules.
- Multi-selection shows clear visual feedback and count/context.
- Alignment supports left, center, right, top, middle, and bottom.
- Distribution supports horizontal and vertical equal spacing.
- Same-size operation copies size from an anchor node or another clearly communicated reference.
- Bulk delete, color update, copy, duplicate, and movement operate transactionally.
- Invalid bulk actions should be disabled or explain why they are unavailable.

## Sidebar, Inspector, And Outline

The exact layout can change, but the app should provide:

- Global settings for grid, layout, dimensions, fonts, border style, and layout algorithm.
- Selection-aware properties for the active node or multi-selection.
- A hierarchy outline/tree that supports selecting and navigating nodes.
- Search for diagrams with many nodes.
- Modal or panel workflows for export, import, help, heatmap, and destructive confirmations.

Operational tools should favor dense, scan-friendly UI over large marketing-style sections.

## Heatmap

Heatmap is a color overlay driven by per-node numeric values.

Required behavior:

- Enable or disable heatmap visualization globally.
- Assign a value between 0 and 1 to individual nodes.
- Import values from CSV or equivalent tabular input.
- Choose a palette and fallback color for nodes without values.
- Show or hide a legend.
- Preserve heatmap values and settings in JSON export/import.
- Apply heatmap colors consistently to visual exports.

## Persistence And Recovery

Required behavior:

- Persist user settings locally.
- Auto-save the working diagram locally.
- Avoid saving corrupted intermediate states during import, drag, resize, or restore operations.
- Restore saved work on reload when appropriate.
- Provide a way to clear saved data.
- Validate imported and restored data before applying it.

## Import, Export, And Viewer

Required import/export formats:

- JSON with full round-trip data.
- SVG or another vector visual export.
- HTML or another shareable web visual export.
- PowerPoint-compatible output.

Strongly preferred compatibility exports:

- Draw.io/diagrams.net.
- ArchiMate Tool format.

Viewer mode:

- Load a JSON diagram from a URL.
- Render it read-only with pan, zoom, fit, and heatmap fidelity.
- Offer a path to import the loaded diagram into the editor.

## Keyboard And Accessibility

Required behavior:

- Keyboard shortcuts for common actions such as delete, undo, redo, copy, paste, and help.
- Arrow-key movement for selected nodes where movement is allowed.
- Escape should cancel transient UI or active interactions where practical.
- Visible focus and accessible labels for controls.
- Sufficient color contrast, including when heatmap colors are active.

## Acceptance Smoke Tests

A modern implementation should pass these high-level checks:

- Create a three-level hierarchy, export JSON, import it, and preserve structure and layout.
- Enable manual positioning for a parent, move children, save, reload, and preserve positions.
- Lock a subtree, change global fixed dimensions, and confirm locked sizes remain stable.
- Multi-select sibling leaves, align them, distribute them, undo, and redo.
- Load a diagram with heatmap state in viewer mode and see the expected colors and legend.
- Open a diagram with around 1,000 nodes and pan/zoom/select without obvious lag.
