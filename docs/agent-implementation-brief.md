# Agent Implementation Brief

## Mission

Build Capability Canvas as a greenfield product for hierarchical capability modeling. Preserve the product and domain contracts while choosing the best architecture for maintainability, performance, and user experience.

Use these docs as the product specification and choose implementation patterns that serve the product directly.

## Freedom To Improve

Agents may choose:

- Rendering backend: DOM, SVG, canvas, WebGL, or a hybrid.
- State model: reducer, command store, Zustand, Redux Toolkit, Jotai, signal stores, local-first document model, or another approach.
- Component structure and routing.
- Styling system and design tokens.
- Layout engine internals.
- Test framework additions.
- Data normalization and indexing strategy.
- Persistence implementation details.

The implementation should be shaped by the domain contracts, not by framework-specific habits.

## Hard Constraints

- Preserve local-first operation.
- Define and import a stable versioned JSON document format.
- Export a complete round-trip JSON document.
- Maintain valid hierarchy invariants at all times.
- Preserve manual and locked layouts through save/load.
- Keep heatmap data and visual exports consistent.
- Support read-only URL/viewer workflows.
- Keep the app usable with roughly 1,000 nodes.
- Provide undo/redo for model-changing operations.

## Recommended Architecture Direction

This section is guidance, not a mandate.

A cleaner modern approach is likely to separate the system into layers:

1. Domain core
   - Pure operations for hierarchy edits, validation, layout input/output, selection rules, and import/export normalization.
   - No React imports.
   - Unit-test heavily.

2. Document store
   - Owns the current diagram, command history, persistence, and migrations.
   - Prefer normalized node maps plus ordered child lists, with selectors for render order and subtree queries.
   - Treat drag/resize preview state separately from committed document state.

3. Layout engine
   - Deterministic algorithms behind a small interface.
   - Explicit handling for automatic, manual, locked, and imported layouts.
   - Output patches or a new layout snapshot rather than mutating UI state directly.

4. Interaction controller
   - Translates pointer, keyboard, and command events into domain operations.
   - Manages transient interaction states such as drag preview, resize preview, selection box, and reparent hover.

5. Rendering layer
   - Renders derived view models, not raw mutable domain state.
   - Can virtualize or batch render large diagrams.
   - Keeps visual state dependencies explicit.

6. Import/export adapters
   - Convert between internal data and external formats.
   - Keep format, migration, and validation concerns isolated.

## Data Strategy

Prefer a canonical internal model optimized for correctness:

- `nodesById` for direct lookup.
- `childrenByParentId` for ordered hierarchy traversal.
- Derived indexes for depth, descendants, render order, bounds, and selection membership.
- A command history that stores compact patches or snapshots based on operation size.

Keep document serialization at the boundary. Do not force the internal model to match exported JSON if a normalized model is clearer.

## Layout Strategy

Good layout behavior matters more than preserving current algorithms exactly.

Suggested approach:

- Define a layout request object containing nodes, hierarchy, settings, locked/manual flags, and affected subtree ids.
- Return a layout result with geometry patches and diagnostics.
- Make layout deterministic and testable without the browser.
- Use incremental layout where possible: editing one subtree should not recalculate unrelated roots unless needed.
- Preserve positions for imported/manual/locked areas unless the user explicitly asks for relayout.

## Interaction Strategy

Separate preview from commit:

- During drag/resize, render temporary transforms or preview geometry.
- Commit one transaction on pointer up.
- Auto-save only committed, validated document states.
- Group bulk operations into single undo history entries.

This avoids expensive full-state churn during high-frequency pointer events and makes undo behavior predictable.

## Implementation Sequence

A sensible implementation sequence:

1. Define the internal document model, JSON import/export adapter, and validators.
2. Implement pure hierarchy operations and selection rules with tests.
3. Implement a simple deterministic layout engine with locked/manual preservation.
4. Build the canvas renderer and basic editor shell.
5. Add pan, zoom, fit view, selection, and inspector editing.
6. Add drag, resize, reparenting, and command history.
7. Add persistence and recovery.
8. Add heatmap, export formats, and viewer mode.
9. Add large-diagram indexing, virtualization, or render batching if performance requires it.
10. Run round-trip checks against generated fixtures and representative hand-authored documents.

## Quality Gates

Before calling an implementation slice complete:

- Unit tests cover hierarchy invariants, import/export, selection rules, and layout preservation.
- Component or integration tests cover primary user workflows.
- A large diagram smoke test covers pan, zoom, fit, render, and selection.
- JSON round-trip preserves ids, parent relationships, geometry, settings, heatmap state, and layout metadata.
- Lint, typecheck, and production build pass.
- Accessibility basics are checked for keyboard access, labels, focus, and contrast.

## Common Failure Modes

Watch for:

- Layout recalculation overwriting manual or imported positions.
- Reparenting creating cycles or orphaned descendants.
- Selection rules allowing mixed-parent bulk operations.
- Drag preview mutating persistent state too often.
- Memoized renderers ignoring visual interaction state.
- Heatmap colors applying in editor but not export or viewer.
- Autosave storing half-imported or transient drag state.
- File migrations dropping unknown metadata that users expected to keep.

## Success Definition

The modern implementation succeeds when a user can model the same domains faster and with fewer layout surprises, while future agents can understand the codebase from clear domain modules instead of reverse-engineering behavior from UI components.
