# Capability Canvas UI, UX, and Correctness Improvement PRD

**Product:** Capability Canvas  
**Repository reviewed:** `ThomasRohde/capability-canvas`  
**Branch reviewed:** `master`  
**PRD version:** 1.0  
**Date:** 2026-05-07  
**Audience:** Product owner, design implementer, frontend developer, test engineer

---

## 1. Executive summary

Capability Canvas already has the right foundation for a serious enterprise modeling tool: a normalized document model, a local-first persistence design, a command/transaction layer, multiple export adapters, visual views, hierarchy validation, layout repair, outline navigation, inspector panels, and a dense professional workspace.

The main opportunity is not a rewrite. The product should keep its current architecture and improve three things:

1. **UI clarity:** reduce toolbar overload, separate model actions from view actions, make common editing direct on the canvas, and make panel/drawer responsibilities obvious.
2. **UX confidence:** make save state, validation, import/export, view state, hidden/collapsed nodes, and destructive actions understandable without requiring knowledge of the data model.
3. **Correctness:** fix read-only viewer mutations, autosave/status inconsistencies, view history churn, ambiguous delete/remove behavior, export error handling, import edge cases, and heatmap defaults.

This PRD converts the review into a developer-ready backlog with acceptance criteria, implementation notes, and test coverage.

---

## 2. Current product assessment

### 2.1 What is already strong

Capability Canvas is not a generic drawing board. It is correctly centered on hierarchical capability modeling.

The current codebase supports:

- Local-first editor behavior with IndexedDB document persistence and local UI preferences.
- A normalized document model using `nodesById` and `childrenByParentId`.
- Hierarchy validation for missing parents, invalid root types, cycles, orphan nodes, text-label child violations, invalid geometry, and heatmap range violations.
- A transaction layer for document commands, undo/redo, relayout, validation, and visual workspace reconciliation.
- Automatic layout and parent containment repair.
- Multiple visual views with per-view node state, layout state, heatmap state, viewport, and export settings.
- Dense editor shell with toolbar, panel rail, outline, canvas, inspector, drawers, status bar, and viewer route.
- Export adapters for JSON, SVG, HTML, PowerPoint, draw.io, and ArchiMate.
- Unit and Playwright tests across layout, validation, selection, exports, editor shell, and persistence/store behavior.

### 2.2 Key source paths reviewed

The following files shaped this PRD:

| Area | Source paths |
|---|---|
| Product intent | `README.md`, `docs/product-brief.md`, `docs/interaction-contracts.md` |
| App shell | `src/app/App.tsx`, `src/features/editor/EditorRoute.tsx` |
| Toolbar and panels | `src/features/editor/Toolbar.tsx`, `src/features/editor/PanelRail.tsx`, `src/features/editor/StatusBar.tsx` |
| Canvas | `src/features/canvas/Canvas.tsx`, `src/features/canvas/selectors.ts` |
| Outline | `src/features/outline/Outline.tsx` |
| Inspector | `src/features/inspector/Inspector.tsx` |
| Settings and views | `src/features/settings/SettingsDrawer.tsx`, `src/features/views/ViewSwitcher.tsx`, `src/features/views/ViewsDrawer.tsx` |
| Viewer | `src/features/viewer/ViewerRoute.tsx` |
| Persistence | `src/app/persistence/autosave.ts`, `src/app/persistence/db.ts`, `src/app/stores/documentStore.ts`, `src/app/stores/uiStore.ts` |
| Domain model | `src/domain/document/types.ts`, `src/domain/document/schema.ts`, `src/domain/document/parse.ts`, `src/domain/document/serialize.ts` |
| Commands | `src/domain/commands/operations.ts` |
| Validation | `src/domain/validation/validate.ts` |
| Layout and selection | `src/domain/layout/containment.ts`, `src/domain/selection/rules.ts`, `src/domain/selection/dropTarget.ts` |
| Export | `src/features/export/ExportDrawer.tsx`, `src/features/import-export/*.ts` |
| Tests | `src/**/*.test.ts`, `src/**/*.test.tsx`, `tests/e2e/editor.spec.ts` |

### 2.3 Review limitations

This PRD is based on a static repository review through the available GitHub connector. The app was not run locally and browser interactions were not manually tested. The recommendations therefore focus on code-observable behavior, data model contracts, product documentation, and likely interaction outcomes.

---

## 3. Product direction

### 3.1 North star

Capability Canvas should feel like a **local-first, enterprise-grade business capability model editor** where the user can trust that hierarchy, layout, views, and exports remain correct.

The editor should optimize for:

- Fast hierarchy creation.
- Direct visual editing.
- Clear distinction between source model and active visual view.
- Safe local persistence.
- Reliable export fidelity.
- Professional, dense, keyboard-friendly UI.
- Correct handling of large models.

### 3.2 Recommended product framing

The app currently sits between two mental models:

1. A **source model editor**, where add/delete/reparent changes the authoritative hierarchy.
2. A **view composer**, where hide/show/collapse/layout/export changes the active visual representation.

That split is powerful but not always visible to the user. The UI should make it explicit:

- “Model” actions change the hierarchy.
- “View” actions change what appears in the active canvas.
- “Layout” actions change positions/sizes in the active view unless the user explicitly applies them globally.
- “Export” uses the active view by default and should say so.
- “Viewer” is truly read-only; local presentation toggles must not mutate the loaded document.

---

## 4. Goals and non-goals

### 4.1 Goals

1. Make common modeling actions faster and less ambiguous.
2. Reduce accidental destructive behavior.
3. Make save, validation, and export state trustworthy.
4. Make active view behavior understandable.
5. Improve direct canvas editing without sacrificing inspector power.
6. Fix correctness issues that can cause state mutation, misleading status, noisy history, or inconsistent exports.
7. Add automated tests for critical UI and model guarantees.
8. Preserve the local-first architecture and command/transaction model.

### 4.2 Non-goals

The following are not required for this PRD:

- Cloud storage.
- Accounts or authentication.
- Multiplayer editing.
- Server-side rendering.
- General vector drawing features.
- Mandatory connection/edge modeling as the primary diagram relationship.
- Replacing React/Zustand or the existing domain layer.
- Replacing the current export adapters wholesale.

---

## 5. Primary users and jobs

### 5.1 Enterprise architect

Needs to import, inspect, refine, present, and export capability models while keeping sensitive business context local.

Important jobs:

- Build and refine hierarchy quickly.
- Maintain view variants for different audiences.
- Export consistent visuals for documents and steering material.
- Avoid corrupting source hierarchy or losing layout work.

### 5.2 Product/platform/domain team

Needs to map domains, systems, ownership, responsibilities, or operating areas.

Important jobs:

- Add and reorganize nodes quickly.
- Hide irrelevant areas in a view.
- Create deep-dive views.
- Annotate nodes with descriptions and metadata.

### 5.3 Consultant/analyst

Needs output quality and predictable export behavior.

Important jobs:

- Produce slides and diagrams that preserve visual layout.
- Validate before export.
- Create multiple views without damaging the model.

---

## 6. Problem statements

### 6.1 UI overload

The top toolbar currently carries too many responsibilities: import, export, add root, add child, duplicate, delete/remove, undo/redo, fit, zoom, auto layout, heatmap, prompt, paste JSON, settings, and view switching. This makes first-time use harder and makes important distinctions, such as delete vs remove from canvas, less clear.

### 6.2 Direct editing gap

Label editing currently depends primarily on the inspector. The product brief expects direct editing from the canvas. A modeling tool should support double-click or keyboard-triggered inline label editing.

### 6.3 View/model ambiguity

The app supports hidden canvas nodes, collapsed nodes, active visual views, view-specific node states, and full-fidelity JSON. These are powerful, but the UI should make the distinction between “delete from model” and “remove from active view” obvious.

### 6.4 Read-only viewer is not strictly read-only

The viewer route is labeled read-only, but its toolbar currently calls document-store actions for heatmap toggling and viewport fitting. Viewer interactions should not mutate the loaded document, even if those mutations are not persisted.

### 6.5 Autosave status is misleading

The status bar always says “Local autosaved” and “All changes saved locally,” while `dirty` is set by document changes and is not reset after successful save. Restore uses `setDocument`, which marks the restored document dirty and adds history. Users need honest save and recovery status.

### 6.6 History can become noisy

View rename currently executes a transaction on every keystroke. That pollutes undo history and causes unnecessary autosave churn. Similar care is needed for numeric settings and view changes.

### 6.7 Export validation and errors are underrepresented

The export drawer can run validation, but export is not blocked or confirmed when validation has errors. Export errors are not surfaced as diagnostics. Visual exports also do not fully reflect all active view settings and do not include heatmap legend parity.

### 6.8 Import edge cases need targeted tests

Import repair is strong, but duplicate ID repair and parent reference ambiguity should be explicitly tested, especially when duplicate IDs exist and parent IDs refer to an ID that was renamed.

---

## 7. Release strategy

### 7.1 Recommended phases

**Phase 1: correctness and trust**

Fix read-only viewer mutation, autosave status, restore semantics, view rename commit behavior, reset confirmation logic, delete/remove semantics, export error handling, and heatmap default behavior.

**Phase 2: core UX improvements**

Simplify toolbar, add inline editing, add command palette and help overlay, improve selection/bulk editing, improve outline search and visible/hidden language, and split settings by scope.

**Phase 3: export and scale**

Improve visual export fidelity, add export preview, share a render model across DOM/SVG/PPTX where practical, add 1,000-node smoke/performance tests, and improve diagnostics repair flows.

### 7.2 Suggested implementation approach

Implement in small PRs. Do not bundle correctness fixes with major UI reshuffles. Start with tests that pin current failures, then patch behavior.

Recommended PR order:

1. Viewer read-only and autosave status correctness.
2. View rename/reset/history fixes.
3. Delete/remove-from-view semantics and confirmation UX.
4. Export validation/error handling.
5. Inline label editing.
6. Toolbar simplification and command palette.
7. Outline search and source/view labels.
8. Export fidelity and preview.

---

# 8. Developer-ready requirements

## Epic A — Correctness and trust

### CC-CR-001 — Make ViewerRoute truly read-only

**Priority:** P0  
**Area:** correctness, viewer UX  
**Problem:** The viewer route is labeled read-only but currently mutates the document store when toggling heatmap and fitting viewport.

**User story:**  
As a viewer user, I can pan, zoom, fit, switch visual view, inspect details, and temporarily toggle display options without changing the underlying document.

**Requirements:**

1. `ViewerRoute` must not call mutating document commands for purely presentational viewer interactions.
2. Fit in viewer mode must update only UI viewport state, not persisted active view viewport.
3. Heatmap toggle in viewer mode must be a local viewer override, not `updateActiveViewHeatmapSettings`.
4. Switching views in viewer mode may update UI state but must not persist previous viewport into `doc.visual.viewsById`.
5. Export from viewer must export the currently displayed visual state. If local viewer overrides are supported, export must either:
   - apply those overrides to a cloned resolved document, or
   - clearly export the document’s stored active view and ignore local toggles.
6. “Import into editor” must serialize the original document plus only intentional state, not accidental viewer-only mutations.

**Implementation notes:**

- Introduce a viewer-local state slice, for example:
  - `viewerViewportByViewId`
  - `viewerHeatmapEnabledOverride`
  - `viewerActiveViewId`, if switching should not mutate doc.
- Alternatively, extend `Canvas` and `ViewSwitcher` with controlled props for readonly/viewer state.
- Avoid using `useDocumentStore.getState().execute(...)` in viewer toolbar actions.
- Consider a small helper:

```ts
function resolveViewerDocument(doc: CapabilityDocument, overrides: ViewerOverrides): CapabilityDocument
```

This helper should clone/resolve the active view and apply non-persistent presentation overrides.

**Likely file touchpoints:**

- `src/features/viewer/ViewerRoute.tsx`
- `src/features/canvas/Canvas.tsx`
- `src/features/views/ViewSwitcher.tsx`
- `src/app/stores/uiStore.ts` or a new `viewerStore.ts`
- `src/features/import-export/*` if export should include viewer-local overrides

**Acceptance criteria:**

- Given a serialized document snapshot, clicking Fit in `/viewer` does not change serialized document output.
- Toggling heatmap in `/viewer` does not change `doc.visual`, `doc.heatmap`, or `doc.timestamp`.
- Switching views in `/viewer` does not update any stored viewport.
- The status bar remains “Read-only view.”
- Editor route behavior is unchanged.

**Tests:**

- Add Playwright test:
  - load `/viewer`
  - snapshot a `window.__ccTestSerializeDocument()` test hook or use a store test helper
  - click Fit
  - click Heatmap
  - switch views if multiple exist
  - assert serialized document unchanged
- Add unit test for any new `resolveViewerDocument` helper.

---

### CC-CR-002 — Replace misleading autosave status with real save state

**Priority:** P0  
**Area:** persistence, status bar, recovery  
**Problem:** The status bar claims all changes are saved locally, but `dirty` is not cleared after successful IndexedDB save. Restore currently uses `setDocument`, which marks the document dirty and adds history.

**User story:**  
As a model editor, I need to know whether my work is saved, saving, unsaved, restored, or failed, so I can trust local-first persistence.

**Requirements:**

1. Add explicit save state to `DocumentState`:
   - `saveStatus: "idle" | "dirty" | "saving" | "saved" | "error"`
   - `lastSavedAt?: number`
   - `lastSaveError?: string`
   - `dirtySince?: number`
2. Successful `saveActiveDocument` must mark the current saved document as saved.
3. Failed save must surface a diagnostic and show an error state.
4. Restored documents must not automatically add an undo history entry.
5. Restored documents must not immediately become dirty unless the restore materially repaired data and the user should be told that repair was applied.
6. The status bar must display actual save state:
   - “Unsaved local changes”
   - “Saving locally…”
   - “Saved locally just now”
   - “Save failed”
   - “Restored local draft”
7. Viewport updates should not constantly imply risky unsaved content changes. If viewport persistence remains document-backed, mark status as “View changed” or throttle separately.

**Implementation notes:**

- Add a non-history method such as:

```ts
hydrateDocument(doc: CapabilityDocument, diagnostics?: Diagnostic[]): void
```

or

```ts
replaceDocument(doc, { source: "restore", addHistory: false, dirty: false })
```

- Modify `useAutosave` so it:
  - sets `saveStatus: "saving"` before save,
  - calls `markSaved()` after `saveActiveDocument`,
  - calls `markSaveFailed(error)` on error.
- Store a cheap serialized hash or incrementing revision number to avoid clearing dirty after a stale save.
- Avoid marking a restore as dirty merely because `setDocument` was reused.

**Likely file touchpoints:**

- `src/app/stores/documentStore.ts`
- `src/app/persistence/autosave.ts`
- `src/app/persistence/db.ts`
- `src/features/editor/StatusBar.tsx`
- `src/app/importDocument.ts`

**Acceptance criteria:**

- Editing a label changes status to “Unsaved local changes” then “Saving locally…” then “Saved locally.”
- Save failure displays an error status and diagnostic.
- Reload after autosave restores the document without creating an undo entry.
- After restore, pressing Undo does not revert to the sample document.
- Panning/zooming does not permanently leave the model in “unsaved” status unless viewport persistence is explicitly treated as saved view state.
- Status text never claims saved while a save is pending or failed.

**Tests:**

- Unit test `useDocumentStore` restore path does not add history.
- Unit test save status transitions with mocked `saveActiveDocument`.
- Playwright test edits a label and observes status transition.
- Playwright test reloads after saved edit and verifies undo behavior.

---

### CC-CR-003 — Commit view rename as a single transaction

**Priority:** P1  
**Area:** views, undo/redo, autosave  
**Problem:** `ViewsDrawer` executes `renameVisualView` on every input change, creating many history entries and unnecessary saves.

**User story:**  
As a user managing views, I can rename a view naturally without filling undo history with every character typed.

**Requirements:**

1. View name inputs use local draft state.
2. Commit on blur or Enter.
3. Escape reverts draft without commit.
4. One rename equals one undo history entry.
5. No transaction is executed if the trimmed value did not change.
6. Empty names commit to “Untitled view” consistently.

**Implementation notes:**

- Create reusable `CommitTextInput` shared with inspector/settings, or extract from `Inspector.tsx`.
- Apply it in `ViewsDrawer` for view names.
- Rename should not close drawer.

**Likely file touchpoints:**

- `src/features/views/ViewsDrawer.tsx`
- Optional: `src/features/shared/CommitTextInput.tsx`

**Acceptance criteria:**

- Typing “Executive view” and blurring creates exactly one history entry.
- Undo restores previous view name in one step.
- Escape restores previous name and creates no history entry.
- Reordering/duplicating/deleting views is unaffected.

**Tests:**

- Unit or component test for committed text input.
- Component test for `ViewsDrawer` rename history length.
- Playwright test rename + undo once.

---

### CC-CR-004 — Fix view reset confirmation logic

**Priority:** P1  
**Area:** views, UX correctness  
**Problem:** `viewHasChanges(view)` currently returns true whenever `nodeStatesById` has keys. Created views normally have node states for all nodes, so reset confirmation appears even when the user has not changed the view.

**User story:**  
As a user managing visual views, I only get destructive reset confirmations when I actually changed something.

**Requirements:**

1. Define “view has changes” against a baseline:
   - source document default view state,
   - template-generated view state, or
   - a stored `baseTemplateHash` / `createdFromTemplateState`.
2. Reset confirmation appears only when the active view differs from its baseline.
3. Provide two reset actions:
   - “Reset layout only”
   - “Reset full view”
4. Confirmation body states what will be lost: layout, visibility, collapse state, heatmap view settings, export view settings.
5. If no changes exist, reset action can be disabled or run without confirmation.

**Implementation notes:**

- Introduce a pure helper:

```ts
export function viewHasUserChanges(doc: CapabilityDocument, view: VisualView): boolean
```

- The helper should ignore expected baseline `nodeStatesById` entries.
- For template views, compare with `createViewFromTemplate(...)` using stored `templateContext`.
- For full-model views, compare with `createVisualViewFromDocument(...)`.

**Likely file touchpoints:**

- `src/features/views/ViewsDrawer.tsx`
- `src/domain/visual/workspace.ts`
- `src/domain/visual/templates.ts`
- `src/domain/commands/operations.ts`

**Acceptance criteria:**

- Newly created view shows no destructive reset warning until the user changes layout, visibility, collapse, heatmap view settings, or export settings.
- Changed view shows a clear confirmation.
- Reset layout only preserves visibility/collapse and labels/colors.
- Reset full view restores all template/default visual state.

**Tests:**

- Unit test new view baseline returns no changes.
- Unit test moved node returns changes.
- Unit test hidden node returns changes.
- Unit test collapse returns changes.
- Component test confirmation appears only when expected.

---

### CC-CR-005 — Separate “Remove from view” from “Delete from model”

**Priority:** P1  
**Area:** data safety, UX clarity  
**Problem:** The toolbar delete icon conditionally removes visible nodes from the canvas instead of deleting from the model. Context menus use both remove and delete language in different places. This is dangerous because users may not understand whether they are hiding a node or deleting it.

**User story:**  
As a model editor, I can safely hide a capability from the active view or delete it from the model, and the UI makes the difference obvious.

**Requirements:**

1. Rename all canvas visibility actions from “canvas” language to “active view” language:
   - “Remove from active view”
   - “Add subtree to active view”
   - “Hidden in active view”
2. Provide separate actions:
   - Remove from active view
   - Delete from model
3. Delete from model always requires confirmation when the selected node has descendants or metadata/description.
4. Remove from active view does not require confirmation but must be undoable.
5. Toolbar must not present a trash icon whose behavior changes silently based on selection state.
6. Context menus and outline menus use the same language.
7. JSON export documentation and export drawer should state that hidden nodes remain in JSON.

**Implementation notes:**

- Split the current toolbar action:
  - an “eye off” icon for remove from view,
  - a “trash” icon for delete from model.
- Confirm dialog can reuse `ConfirmDialog`.
- Consider preserving the current keyboard Delete as “Remove from active view” and Shift+Delete as “Delete from model,” but the shortcut must be documented and confirmed.

**Likely file touchpoints:**

- `src/features/editor/Toolbar.tsx`
- `src/features/canvas/Canvas.tsx`
- `src/features/outline/Outline.tsx`
- `src/features/editor/StatusBar.tsx`
- `src/features/shared/ConfirmDialog.tsx`
- `src/domain/commands/operations.ts` only if command labels should change

**Acceptance criteria:**

- Selecting a visible node shows both “Remove from active view” and “Delete from model” where appropriate.
- Remove from active view hides the subtree only in the active view and is undoable.
- Delete from model removes the subtree from `nodesById` and `childrenByParentId`, is confirmed, and is undoable.
- No UI element labeled only “Delete” performs “remove from active view.”
- Tests prove JSON export includes hidden nodes while visual export omits them.

**Tests:**

- Component test toolbar labels/action availability.
- Playwright test remove from active view vs delete from model.
- Unit test command labels and history entries.
- Regression test export behavior for hidden nodes.

---

### CC-CR-006 — Make export validation and error handling explicit

**Priority:** P1  
**Area:** export, diagnostics, user confidence  
**Problem:** Export drawer displays validation but export can proceed without resolving invalid states, and export errors are not caught into diagnostics.

**User story:**  
As a user exporting work, I know whether the model is valid, what will be exported, and whether the export succeeded or failed.

**Requirements:**

1. Export drawer automatically validates the active document when opened and before export.
2. If validation has errors:
   - JSON export can proceed only after explicit “Export anyway” confirmation, or
   - export is blocked until errors are repaired.
   - Visual exports should default to blocked if geometry/hierarchy errors affect output.
3. Export failures must be caught and surfaced in diagnostics and drawer UI.
4. Export success should show a short success toast/status message.
5. Export drawer must clearly state:
   - exporting active view vs full model,
   - hidden nodes included/excluded per format,
   - heatmap state used,
   - whether the legend is included.
6. Export button shows busy state and disables repeated clicks.
7. Export adapters should return diagnostics and the drawer should display them after export.

**Implementation notes:**

- Wrap export call:

```ts
try {
  setBusy(true)
  const result = await adapterFor(format).exportDocument(doc)
  setDiagnostics([...validation.diagnostics, ...result.diagnostics])
  await saveExportResult(result)
  setExportStatus({ type: "success", message: ... })
} catch (err) {
  setDiagnostics([warning("export-failed", message)])
  setExportStatus({ type: "error", message })
} finally {
  setBusy(false)
}
```

- Consider adding format metadata to adapters:

```ts
visibility: "active-view" | "full-model"
requiresValidDocument: boolean
```

**Likely file touchpoints:**

- `src/features/export/ExportDrawer.tsx`
- `src/features/import-export/index.ts`
- `src/features/import-export/types.ts`
- `src/features/editor/StatusBar.tsx`
- export adapter tests

**Acceptance criteria:**

- Exporting with validation errors requires explicit confirmation or is blocked.
- A thrown adapter error appears in diagnostics and drawer UI.
- Busy state prevents duplicate downloads.
- Drawer text explains JSON is full-fidelity and visual formats use active view.
- Export success is visible.

**Tests:**

- Unit test export error -> diagnostic.
- Component test invalid validation blocks or confirms export.
- Component test busy state prevents duplicate export.
- Existing export tests remain green.

---

### CC-CR-007 — Add import edge-case tests for duplicate IDs and parent repair

**Priority:** P1  
**Area:** import correctness  
**Problem:** Import repair handles duplicate IDs and missing parents, but duplicate parent references can be ambiguous after ID rewriting.

**User story:**  
As a user importing model data, malformed input should repair predictably or tell me exactly what was changed.

**Requirements:**

1. Add test cases for wire document import with duplicate node IDs.
2. Define expected parent behavior when:
   - duplicate child ID is renamed,
   - parent ID refers to a duplicated ID,
   - duplicate root IDs exist,
   - duplicate parent ID and child parent references collide.
3. Diagnostics must name original ID, rewritten ID, and parent repair decision.
4. Import should never create cycles, unreachable nodes, or ambiguous `childrenByParentId`.
5. If parent references cannot be deterministically repaired, move affected nodes to root and warn.

**Implementation notes:**

- Current parsing builds `rewrittenIds` by `${rawNode.id}:${count}` but parent resolution uses raw `rawNode.parentId`.
- Decide whether parent references should bind to the first original ID or be treated as ambiguous.
- A deterministic rule is acceptable, but must be documented and tested.

**Likely file touchpoints:**

- `src/domain/document/parse.ts`
- `src/domain/document/document.test.ts`
- `docs/domain-model.md`

**Acceptance criteria:**

- Duplicate IDs are repaired deterministically.
- Parent references after ID repair are valid.
- Diagnostics are actionable.
- Validation passes after import repair.

**Tests:**

- Unit tests in `document.test.ts` for each duplicate scenario.
- Regression test for `parseDocument` + `serializeDocument` round trip after repair.

---

### CC-CR-008 — Treat new heatmap values as unscored by default

**Priority:** P1  
**Area:** heatmap correctness, semantic accuracy  
**Problem:** `addChild` creates new child nodes with `heatmapValue: 0`. In heatmap mode, this makes new nodes appear intentionally scored at the minimum value rather than unscored.

**User story:**  
As a user using heatmaps for analysis, new or imported nodes should not look like they have a real score unless I set one.

**Requirements:**

1. New nodes should default to `heatmapValue: undefined`.
2. Inspector should show “No value” or an empty input.
3. Heatmap rendering should use fallback color for unscored nodes.
4. CSV import and manual entry should continue to support explicit `0`.
5. Existing saved documents with `0` remain explicit zero values.
6. Optional: add a setting “Default score for new nodes” with default `undefined`, but do not add this in Phase 1 unless needed.

**Implementation notes:**

- Update `addChild`.
- Audit `createNode` defaults and sample fixture behavior.
- Use explicit `0` only in sample data if it represents real sample scoring.

**Likely file touchpoints:**

- `src/domain/commands/operations.ts`
- `src/domain/document/defaults.ts`
- `src/domain/fixtures/sample.ts`
- `src/features/inspector/Inspector.tsx`
- `src/features/heatmap/resolveNodeFill.ts`

**Acceptance criteria:**

- Add child -> heatmap value empty in inspector.
- Heatmap enabled -> new child uses fallback/category color, not minimum heatmap color.
- Entering `0` manually persists and renders as zero.
- CSV import with value `0` persists and renders as zero.

**Tests:**

- Unit test `addChild` returns undefined heatmap value.
- Unit test explicit zero remains zero.
- Component test inspector empty value.

---

### CC-CR-009 — Harden recursive traversal helpers against invalid cycles

**Priority:** P2  
**Area:** defensive correctness  
**Problem:** Validation detects cycles, but helpers such as `descendantsOf` recurse without a visited set. If an invalid cyclic document reaches a command path, recursion can overflow.

**User story:**  
As a developer, I want domain helpers to fail safely even when called with malformed imported or test data.

**Requirements:**

1. All recursive hierarchy traversal helpers must guard with a `visited` set.
2. If a cycle is encountered in traversal, traversal should stop and optionally emit a diagnostic depending on context.
3. Validation remains the authoritative source for cycle diagnostics.

**Likely file touchpoints:**

- `src/domain/validation/validate.ts`
- `src/domain/document/types.ts`
- `src/domain/commands/operations.ts`

**Acceptance criteria:**

- Calling traversal helpers on a cyclic test document does not throw stack overflow.
- Validation still reports cycle.
- Commands reject invalid cyclic docs.

**Tests:**

- Unit test traversal helper with cyclic fixture.
- Unit test `runTransaction` rejects cyclic input without overflow.

---

## Epic B — Workspace UI and interaction model

### CC-UX-001 — Simplify the top toolbar around primary tasks

**Priority:** P1  
**Area:** UI, workflow clarity  
**Problem:** The toolbar is dense and mixes document, view, layout, export, prompt, import, and settings actions.

**User story:**  
As a user, I can find the main modeling actions immediately and access less common actions without scanning a long toolbar.

**Requirements:**

1. Top toolbar should contain only high-frequency primary actions:
   - document title,
   - active view switcher,
   - Add,
   - Import,
   - Export,
   - Auto layout,
   - Undo/Redo,
   - Fit/Zoom summary.
2. Move secondary actions into:
   - panel rail,
   - contextual floating toolbar,
   - command palette,
   - overflow menu.
3. Replace multiple “Add” buttons with an Add menu:
   - Add root to model,
   - Add child to selected,
   - Add text label,
   - Add selected/subtree to active view if relevant.
4. Toolbar must be responsive:
   - At narrow widths, collapse labels into icons with accessible labels.
   - No horizontal clipping of critical actions.
5. Toolbar action labels must distinguish model vs active view.
6. Heatmap toggle should move to View controls or active view settings, not the global toolbar, unless it is treated as a primary view mode.

**Implementation notes:**

- Create `ToolbarGroup`, `ToolbarOverflowMenu`, and `AddMenu` components.
- Keep `PanelRail` for persistent workspace tool access.
- Remove duplicate settings/export triggers if both toolbar and rail are present, or make the toolbar actions the primary entry points and rail panel toggles secondary.
- Use consistent terminology:
  - “active view”
  - “source model”
  - “full-fidelity JSON”
  - “visual export”

**Likely file touchpoints:**

- `src/features/editor/Toolbar.tsx`
- `src/features/editor/PanelRail.tsx`
- `src/styles.css`
- `src/features/shared/IconButton.tsx`
- new shared menu components

**Acceptance criteria:**

- On a 1366px-wide viewport, no toolbar item is clipped.
- On a 1024px-wide viewport, secondary actions collapse into overflow.
- Add menu supports root, child, and text label actions with disabled reasons.
- Heatmap state is controlled from a view/display area.
- All toolbar buttons have accessible labels and titles.

**Tests:**

- Playwright visual/smoke test for toolbar at 1366px and 1024px.
- Component tests for Add menu disabled states.
- Accessibility test for button labels.

---

### CC-UX-002 — Add direct inline label editing on canvas

**Priority:** P1  
**Area:** direct manipulation, editing speed  
**Problem:** Label editing is currently inspector-centered. The product contract expects quick label editing from canvas.

**User story:**  
As a model editor, I can rename capabilities directly on the canvas without moving to the inspector.

**Requirements:**

1. Double-click a node label to edit inline.
2. Press Enter with a selected node to edit label, unless focus is already in an input.
3. Commit on Enter or blur.
4. Cancel on Escape.
5. Support multiline labels only if current rendering supports them; otherwise Enter commits and Shift+Enter does nothing or inserts newline by explicit design.
6. While editing:
   - drag should be disabled for that node,
   - global shortcuts should not trigger,
   - text should be selected initially,
   - focus ring should be visible.
7. Inspector label remains in sync.
8. Inline editor must work for root, parent, leaf, and text-label nodes.
9. Empty labels commit to “Untitled capability” or are rejected with a clear inline validation message.

**Implementation notes:**

- Add local canvas editing state:
  - `editingNodeId`
  - `labelDraft`
- Reuse `updateNode(node.id, { label })`.
- Avoid using `contentEditable` if it complicates accessibility; an absolutely positioned input/textarea inside the node is sufficient.
- Make node view model include editable label bounds if needed.

**Likely file touchpoints:**

- `src/features/canvas/Canvas.tsx`
- `src/features/inspector/Inspector.tsx` for shared commit input extraction
- `src/styles.css`
- `src/domain/commands/operations.ts` only if label normalization changes

**Acceptance criteria:**

- Double-click leaf -> input appears -> type -> Enter -> node and outline labels update.
- Escape cancels without transaction.
- Undo reverts the rename in one step.
- Inline editing does not start drag.
- Keyboard shortcuts do not trigger while input is active.
- Screen reader accessible name identifies the edited node.

**Tests:**

- Playwright test inline rename.
- Playwright test Escape cancel.
- Unit/component test commit helper.
- Regression test undo after inline rename.

---

### CC-UX-003 — Improve selection feedback and bulk editing

**Priority:** P1  
**Area:** modeling efficiency  
**Problem:** Multi-selection is restricted to sibling non-text nodes, which is correct for many bulk operations, but the UI should explain rejected selections and provide richer bulk editing.

**User story:**  
As a user arranging many sibling capabilities, I can understand what is selected and perform bulk operations quickly.

**Requirements:**

1. When multi-selection fails, show a short message:
   - “Bulk operations require sibling capabilities.”
   - “Text labels are excluded from multi-selection.”
2. Floating bulk toolbar should show:
   - count selected,
   - align,
   - distribute,
   - same size,
   - color,
   - remove from active view,
   - more menu.
3. Inspector should support multi-selection bulk fields:
   - common color,
   - size,
   - layout preserve/manual flags where valid,
   - heatmap value clear/set.
4. Bulk operations must be disabled with tooltip reasons when invalid.
5. The anchor/reference for same-size must be explicit:
   - first selected,
   - last selected,
   - or “choose reference.”
6. Marquee selection should show count preview where practical.
7. Selection state should be cleared or adjusted when switching views and selected nodes are hidden.

**Implementation notes:**

- Current selection rule helpers already return reasons. Surface them in UI.
- Add `BulkInspector` component.
- Add `SelectionNotice` toast/status message.
- Make `BulkToolbar` consume `canAlign`/`canDistribute` reasons.

**Likely file touchpoints:**

- `src/domain/selection/rules.ts`
- `src/features/canvas/Canvas.tsx`
- `src/features/inspector/Inspector.tsx`
- `src/app/stores/uiStore.ts`
- `src/features/editor/StatusBar.tsx`

**Acceptance criteria:**

- Selecting non-sibling nodes results in clear feedback and no invalid state.
- Bulk inspector appears for multi-selection.
- Bulk color applies transactionally to all selected valid nodes.
- Disabled actions expose reason via title/tooltip.
- Same-size reference is visible.

**Tests:**

- Unit tests for selection reason messages.
- Component test multi-selection inspector.
- Playwright test align/distribute/undo/redo workflow.
- Playwright test invalid multi-select feedback.

---

### CC-UX-004 — Improve outline search for large models

**Priority:** P1  
**Area:** navigation, scalability  
**Problem:** Outline search currently matches labels and shows matching rows, but it does not preserve ancestor context. In large trees, search should help users find and jump to nodes.

**User story:**  
As a user working with hundreds or thousands of capabilities, I can search by label, ID, description, or metadata and understand where matches sit in the hierarchy.

**Requirements:**

1. Search must match:
   - label,
   - node ID,
   - description,
   - selected metadata keys/values.
2. Results must show ancestor path context.
3. If a descendant matches, ancestors should remain visible.
4. Matched text should be highlighted.
5. Provide keyboard navigation:
   - Enter jumps to next result,
   - Shift+Enter jumps to previous result,
   - Escape clears search.
6. Clicking a search result selects the node and centers/fits it in the canvas if visible.
7. For hidden nodes, show “Hidden in active view” and offer “Add to active view.”
8. Search should handle 1,000 nodes without obvious input lag.

**Implementation notes:**

- Build a memoized search index from `doc.nodesById`.
- Keep tree filtering separate from search result ranking.
- Add helper:

```ts
getOutlineVisibleIdsForSearch(doc, query): Set<NodeId>
```

that includes matches and ancestors.
- Consider debouncing metadata-heavy search.

**Likely file touchpoints:**

- `src/features/outline/Outline.tsx`
- `src/features/canvas/Canvas.tsx` for center-on-node API
- `src/app/stores/uiStore.ts`
- `src/domain/document/types.ts` helper functions if needed

**Acceptance criteria:**

- Search for a leaf shows its parent path.
- Search by ID finds the node.
- Search by description finds the node.
- Hidden matching node offers add-to-view action.
- Search has no visible lag on a 1,000-node fixture.

**Tests:**

- Unit tests for search filtering and ancestor inclusion.
- Component test outline search.
- Playwright test search -> select -> center.
- Performance smoke test with generated large model.

---

### CC-UX-005 — Make source model vs active view explicit

**Priority:** P1  
**Area:** mental model, correctness  
**Problem:** Nodes can exist in the source model but be hidden in the active view. Current language uses “canvas” in commands and UI, which can be interpreted as model deletion or diagram deletion.

**User story:**  
As a user, I know whether a capability exists in the model, is visible in the active view, or is collapsed/hidden.

**Requirements:**

1. Replace user-facing “canvas” terminology with “active view” where it refers to `isOnCanvas`.
2. Outline row badges:
   - Visible in active view,
   - Hidden in active view,
   - Collapsed in active view.
3. Inspector should show model/view status:
   - Model path,
   - Active view visibility,
   - Active view layout state,
   - Source ID if imported.
4. Context menu action labels must include scope:
   - “Remove from active view”
   - “Delete from model”
   - “Collapse in active view”
5. Export drawer must explain format scope:
   - JSON includes source model and all views.
   - SVG/HTML/PPTX/draw.io use active visual view.
   - ArchiMate export scope should be explicitly stated.
6. Settings should label which controls are document-level and which are active-view-level.

**Implementation notes:**

- Command labels in history may continue using technical terms internally, but UI labels should not.
- Rename user-facing strings first; internal names can remain until a future refactor.
- Add a small `ScopeBadge` shared component.

**Likely file touchpoints:**

- `src/features/outline/Outline.tsx`
- `src/features/canvas/Canvas.tsx`
- `src/features/inspector/Inspector.tsx`
- `src/features/export/ExportDrawer.tsx`
- `src/features/settings/SettingsDrawer.tsx`
- `src/features/editor/Toolbar.tsx`

**Acceptance criteria:**

- No visible UI says “remove from canvas” for active-view hiding.
- Inspector clearly identifies visible/hidden/collapsed state.
- Export drawer format scope is visible before exporting.
- User can hide a node from a view and still see it in the outline.

**Tests:**

- Snapshot or DOM text tests for action labels.
- Playwright test hide from active view and verify outline state.
- Component test export scope copy by format.

---

### CC-UX-006 — Improve view creation and management

**Priority:** P2  
**Area:** views, presentation workflow  
**Problem:** Views are powerful but the current create/manage flow is dense. Creating a view does not ask for a name before creation, and reset actions are packed into icon rows.

**User story:**  
As an architect preparing different stakeholder views, I can create, name, duplicate, reset, and export views confidently.

**Requirements:**

1. Create view form includes:
   - Name,
   - Template,
   - Root target for deep-dive templates,
   - Description preview,
   - “Create and switch” action.
2. View list should show:
   - active/default state,
   - template,
   - visible node count,
   - changed status,
   - last updated.
3. Rename commits on blur/Enter, not on each keystroke.
4. Reset actions are explicit:
   - Reset layout only,
   - Reset visibility/collapse,
   - Reset full view from template.
5. Delete view confirmation states that the source model is unaffected.
6. Default view action should be labeled “Set as default” with clear current default indicator.
7. View switcher should show current view scope and node count.

**Implementation notes:**

- The current row grid uses many icon buttons. Add a per-row “More” menu to reduce density.
- Keep keyboard navigation and accessible menu roles.
- Use existing `ConfirmDialog`.

**Likely file touchpoints:**

- `src/features/views/ViewsDrawer.tsx`
- `src/features/views/ViewSwitcher.tsx`
- `src/domain/commands/operations.ts`
- `src/domain/visual/templates.ts`
- `src/styles.css`

**Acceptance criteria:**

- User can create a named view in one form.
- Deep-dive template requires or suggests a selected/root capability.
- Reset options are clear and separately testable.
- Delete view confirmation says model is not deleted.
- View list remains readable at 320px drawer width or switches to a stacked layout.

**Tests:**

- Component test create view with name/template.
- Playwright test create, rename, duplicate, set default, reset, delete.
- Unit tests for view metadata counts.

---

### CC-UX-007 — Split settings by scope

**Priority:** P2  
**Area:** settings UX, correctness  
**Problem:** Settings drawer mixes document settings, active-view layout, heatmap settings, CSV import, and global defaults. Heatmap settings are partly global and partly active-view-specific.

**User story:**  
As a user, I understand whether a setting affects the whole model, the current view, new nodes, heatmap data, or export output.

**Requirements:**

1. Settings drawer sections must be scoped:
   - Document,
   - Model defaults,
   - Active view,
   - Layout,
   - Heatmap data,
   - Export defaults.
2. Each setting has a small scope label:
   - “Document”
   - “Active view”
   - “New nodes”
   - “Export”
3. Heatmap section must distinguish:
   - heatmap values on nodes,
   - global palette/fallback,
   - active-view heatmap enabled/show legend.
4. Settings that trigger auto layout must warn when they may move unlocked nodes.
5. Settings with immediate relayout should show progress and allow undo as one transaction.
6. Numeric fields commit on blur/Enter and do not spam history while typing.

**Implementation notes:**

- Extract reusable `NumberSetting` with commit semantics.
- Use `updateSettings` for relayout-triggering fields.
- Add explanatory copy for layout modes: adaptive, flow, uniform, freeform.

**Likely file touchpoints:**

- `src/features/settings/SettingsDrawer.tsx`
- `src/app/stores/documentStore.ts`
- `src/domain/commands/operations.ts`
- `src/styles.css`

**Acceptance criteria:**

- User can tell which settings affect active view only.
- Heatmap showLegend is visibly active-view-scoped.
- Palette is visibly document-scoped or intentionally made view-scoped.
- Changing multiple related layout settings can be undone coherently.
- No setting executes a transaction per keystroke.

**Tests:**

- Component tests for scoped labels.
- Unit test settings transaction labels.
- Playwright test layout setting change + undo.

---

## Epic C — Import, export, and visual fidelity

### CC-UX-008 — Add export preview and active-view export contract

**Priority:** P2  
**Area:** export UX, fidelity  
**Problem:** Users need confidence that the exported result matches the active view, especially for heatmap, hidden nodes, and view-specific layout.

**User story:**  
As a user exporting a diagram, I can preview what will be exported and understand format limitations.

**Requirements:**

1. Export drawer includes a preview of the active view using the selected format’s export bounds.
2. Preview updates when format changes.
3. Format cards show:
   - full-fidelity vs visual-only,
   - includes hidden nodes or not,
   - includes heatmap legend or not,
   - editable after export or not.
4. Exports should include active-view heatmap legend when enabled, unless a format explicitly does not support it.
5. Export bounds should be derived consistently from active visual document.
6. User can choose:
   - include title,
   - include subtitle/description,
   - include footer/version/date,
   - include grid,
   - page preset for presentation formats.
7. These options should map to `VisualView.export`.

**Implementation notes:**

- Build `resolveExportPlan(doc, format)`:
  - resolved visual doc,
  - bounds,
  - visible nodes,
  - legend,
  - page settings,
  - diagnostics.
- Reuse export plan across SVG, HTML, PPTX, draw.io where practical.
- Avoid exact DOM/SVG parity as a first step; prioritize legend, bounds, and settings parity.

**Likely file touchpoints:**

- `src/features/export/ExportDrawer.tsx`
- `src/features/import-export/svg.ts`
- `src/features/import-export/html.ts`
- `src/features/import-export/pptx.ts`
- `src/features/import-export/drawio.ts`
- `src/domain/visual/workspace.ts`
- `src/domain/document/types.ts`

**Acceptance criteria:**

- Export preview matches active view bounds and visible nodes.
- Heatmap legend appears in preview/export when enabled.
- Hidden active-view nodes are omitted from visual formats.
- JSON format clearly states it includes full document and all views.
- PPTX title/grid/footer options affect output when enabled.

**Tests:**

- Unit test `resolveExportPlan`.
- Export tests for legend inclusion.
- Export tests for active view hidden/collapsed nodes.
- Playwright test preview changes when toggling heatmap/legend.

---

### CC-UX-009 — Improve SVG/PPTX render fidelity

**Priority:** P2  
**Area:** output quality  
**Problem:** SVG/PPTX exports manually approximate canvas rendering and hardcode fonts/sizes in places. This can diverge from the editor.

**User story:**  
As a user exporting to documents or slides, the export should look like what I arranged in the editor.

**Requirements:**

1. Export renderers must use active visual document settings for:
   - font family,
   - border radius,
   - container label offset,
   - heatmap colors,
   - fallback colors,
   - visible/collapsed nodes.
2. SVG and HTML label wrapping should be closer to canvas behavior.
3. PPTX should include:
   - heatmap legend when enabled,
   - title/footer options,
   - active view name if configured,
   - description notes optionally.
4. Exports should support large diagrams with predictable scaling.
5. Renderers should share helpers for:
   - node fill,
   - label wrapping,
   - export bounds,
   - legend rendering.

**Implementation notes:**

- Introduce `src/features/import-export/renderPlan.ts`.
- Avoid hardcoding `Inter` and `Aptos` without mapping from document settings.
- Use deterministic wrap logic and test it.
- Keep file sizes reasonable.

**Likely file touchpoints:**

- `src/features/import-export/svg.ts`
- `src/features/import-export/html.ts`
- `src/features/import-export/pptx.ts`
- `src/features/heatmap/resolveNodeFill.ts`
- `src/domain/document/types.ts`

**Acceptance criteria:**

- Changing document font affects SVG/PPTX export.
- Changing border radius affects visual export where supported.
- Heatmap legend is exported in SVG/HTML/PPTX when enabled.
- Export tests verify active view layout and style fidelity.

**Tests:**

- Unit tests for render plan.
- SVG snapshot string tests.
- PPTX smoke test for slide object count and legend text.
- HTML export test for accessible tooltip behavior remains green.

---

### CC-UX-010 — Improve import feedback and safe recovery

**Priority:** P2  
**Area:** import UX, diagnostics  
**Problem:** Import repair diagnostics exist but the UI does not provide a rich review of what changed before applying imported content.

**User story:**  
As a user importing a model, I can see what was imported, what was repaired, and what will be replaced before committing.

**Requirements:**

1. Import flow shows a summary before replacing current document:
   - title,
   - node count,
   - view count,
   - diagnostics count,
   - repairs made.
2. User can cancel import.
3. If current document has unsaved changes, import requires confirmation.
4. Import diagnostics are visible after import and clickable where node IDs exist.
5. External hierarchy imports should state that the input was converted.
6. Large imports should show progress/busy state.
7. Add “Download current backup before import” action.

**Implementation notes:**

- `applyImportedDocument` currently applies immediately. Add a review modal layer in UI, but keep pure parsing in domain.
- For file import and pasted JSON, share `ImportReviewDialog`.
- Keep prompt-merge payload import as a separate flow.

**Likely file touchpoints:**

- `src/features/editor/Toolbar.tsx`
- `src/app/importDocument.ts`
- `src/app/fileSystem.ts`
- `src/domain/document/parse.ts`
- `src/features/shared/ConfirmDialog.tsx`

**Acceptance criteria:**

- Importing malformed but repairable JSON shows repairs before apply.
- Cancel leaves current document unchanged.
- Applying import creates one history entry.
- Import diagnostics appear in status diagnostics.
- User can export backup before applying import.

**Tests:**

- Component test import review dialog.
- Unit test apply import creates one history entry.
- Playwright test cancel import leaves title/node count unchanged.

---

## Epic D — Diagnostics, accessibility, and help

### CC-UX-011 — Make diagnostics actionable

**Priority:** P2  
**Area:** validation, UX trust  
**Problem:** Diagnostics are shown as text in the status popover, but they are not actionable.

**User story:**  
As a user, when validation reports a problem, I can jump to the affected node or run a safe repair.

**Requirements:**

1. Diagnostics list supports severity:
   - info,
   - warning,
   - error.
2. Diagnostics with `nodeId` are clickable:
   - select node,
   - open inspector,
   - center node if visible,
   - show hidden-state action if hidden.
3. Diagnostics can include repair actions:
   - repair containment,
   - move orphan to root,
   - clear invalid heatmap value,
   - remove stale view state.
4. Export drawer and status bar use the same diagnostics component.
5. Diagnostics should be grouped by category:
   - hierarchy,
   - geometry,
   - layout,
   - import,
   - export,
   - persistence.

**Implementation notes:**

- Add `DiagnosticPanel` shared component.
- Extend diagnostic shape only if needed:

```ts
interface DiagnosticAction {
  label: string
  command?: Transaction
  run?: () => void
}
```

- Keep domain diagnostics pure if UI action closures would pollute domain. Map actions in UI layer.

**Likely file touchpoints:**

- `src/features/editor/StatusBar.tsx`
- `src/features/export/ExportDrawer.tsx`
- `src/domain/validation/diagnostics.ts`
- `src/app/stores/documentStore.ts`

**Acceptance criteria:**

- Clicking a diagnostic with node ID selects that node.
- Hidden node diagnostic offers add-to-view.
- Export diagnostics and status diagnostics render consistently.
- Clear diagnostics remains available.

**Tests:**

- Component test `DiagnosticPanel`.
- Playwright test validation diagnostic selects node.
- Unit test action mapping for known diagnostic codes.

---

### CC-UX-012 — Add command palette and shortcut help

**Priority:** P2  
**Area:** keyboard UX, discoverability  
**Problem:** Many shortcuts exist in canvas key handlers, but they are not discoverable. Toolbar density can be reduced if common actions are also available in a command palette.

**User story:**  
As a keyboard-oriented user, I can discover and run commands quickly without scanning panels.

**Requirements:**

1. `?` opens shortcut help.
2. `Ctrl/Cmd+K` opens command palette.
3. Command palette includes:
   - Add root,
   - Add child,
   - Rename selected,
   - Fit view,
   - Auto layout,
   - Toggle outline,
   - Toggle inspector,
   - Open views/settings/export,
   - Import,
   - Export,
   - Toggle heatmap,
   - Remove from active view,
   - Delete from model.
4. Commands are context-aware and show disabled reasons.
5. Palette search is keyboard navigable.
6. Help overlay documents:
   - pan/zoom,
   - selection,
   - inline editing,
   - undo/redo,
   - view actions,
   - export/import.

**Implementation notes:**

- Create command registry:

```ts
interface CommandDefinition {
  id: string
  label: string
  keywords?: string[]
  shortcut?: string
  canRun: (ctx) => { valid: boolean; reason?: string }
  run: (ctx) => void
}
```

- Use registry in toolbar/menu where possible to avoid duplicated action logic.

**Likely file touchpoints:**

- `src/features/commands/CommandPalette.tsx`
- `src/features/help/ShortcutHelp.tsx`
- `src/features/editor/EditorRoute.tsx`
- `src/features/editor/Toolbar.tsx`
- `src/app/stores/uiStore.ts`

**Acceptance criteria:**

- Ctrl/Cmd+K opens palette from canvas.
- Palette does not open while typing in inputs.
- Disabled command displays reason.
- Running command through palette produces same transaction as toolbar.
- `?` help can be closed with Escape.

**Tests:**

- Component tests for command registry.
- Playwright test command palette add child, fit, open export.
- Accessibility test keyboard navigation.

---

### CC-UX-013 — Improve accessibility and keyboard completeness

**Priority:** P2  
**Area:** accessibility, enterprise readiness  
**Problem:** Many controls have labels, but complex menus, tree rows, canvas editing, floating toolbars, and color/heatmap states need stronger keyboard and screen-reader support.

**User story:**  
As a user relying on keyboard navigation or assistive tech, I can use the core editor workflows.

**Requirements:**

1. All icon-only controls have accessible labels.
2. Context menus and outline menus support:
   - Arrow navigation,
   - Enter/Space activate,
   - Escape close,
   - focus restore.
3. Floating bulk toolbar is keyboard reachable.
4. Inline label editor has accessible label and focus management.
5. Heatmap colors meet contrast guidance or provide text/score alternatives.
6. Selection and drag states have non-color indicators.
7. Focus order follows workspace structure:
   - toolbar,
   - rail,
   - outline,
   - canvas,
   - inspector,
   - status.
8. Canvas selected node details can be reached without pointer.
9. Resize handle already has ARIA separator; preserve and extend keyboard support where applicable.

**Implementation notes:**

- Add `useMenuKeyboardNavigation` hook.
- Add visible focus styles for nodes and bulk toolbar.
- Color swatches should have names and selected state via `aria-pressed`.
- Consider `aria-live` announcements for selection count and diagnostics.

**Likely file touchpoints:**

- `src/features/canvas/Canvas.tsx`
- `src/features/outline/Outline.tsx`
- `src/features/editor/Toolbar.tsx`
- `src/features/shared/IconButton.tsx`
- `src/styles.css`

**Acceptance criteria:**

- Core workflows pass keyboard-only smoke test.
- Axe or equivalent accessibility scan has no critical violations in editor shell.
- Menu keyboard interactions match expectations.
- Color swatches announce selected color.

**Tests:**

- Playwright keyboard navigation smoke test.
- Component test menu keyboard behavior.
- Accessibility assertions for labels and ARIA states.

---

## Epic E — Performance and large-model readiness

### CC-PERF-001 — Add 1,000-node editor smoke and performance guardrails

**Priority:** P2  
**Area:** scalability  
**Problem:** Product requirements call for usability around 1,000 nodes. Current tests cover functionality but do not appear to include a large-model pan/zoom/select smoke test.

**User story:**  
As a user working with enterprise-scale capability models, the editor remains responsive for view, search, selection, pan, zoom, and common edits.

**Requirements:**

1. Add generated 1,000-node fixture.
2. Test load, pan, zoom, search, select, fit view, and export plan generation.
3. Add budget-style assertions where stable:
   - initial render under a reasonable threshold in CI,
   - search update under threshold,
   - no obvious frame-freezing in common interactions.
4. Avoid excessive `resolveVisualDocument` recalculation.
5. Memoize expensive selectors by document revision and active view.
6. Consider virtualization of outline and canvas view models where necessary.

**Implementation notes:**

- `Canvas.tsx` already filters visible view models by viewport. Verify `createNodeViewModels` scales well.
- `Toolbar`, `Inspector`, `Outline`, and `Canvas` each call `resolveVisualDocument`. Consider a store selector or memoized hook:

```ts
useResolvedVisualDocument(viewId?)
```

- Do not prematurely optimize; first add fixture and measurements.

**Likely file touchpoints:**

- `src/domain/fixtures/large.ts`
- `src/features/canvas/selectors.ts`
- `src/domain/visual/workspace.ts`
- `src/features/outline/Outline.tsx`
- `tests/e2e/large-model.spec.ts`

**Acceptance criteria:**

- Generated 1,000-node fixture opens in editor.
- Pan/zoom/select/search smoke tests pass.
- No transaction or validation step overflows recursion.
- Search remains usable.
- Export plan generation completes.

**Tests:**

- Vitest benchmark-like unit test for `resolveVisualDocument` and `createNodeViewModels`.
- Playwright smoke test with 1,000 nodes.
- Unit test validation on large generated model.

---

# 9. Detailed backlog table

| ID | Title | Priority | Recommended PR |
|---|---|---:|---:|
| CC-CR-001 | Viewer read-only contract | P0 | PR 1 |
| CC-CR-002 | Autosave/save status correctness | P0 | PR 1 |
| CC-CR-003 | View rename single transaction | P1 | PR 2 |
| CC-CR-004 | View reset dirty baseline | P1 | PR 2 |
| CC-CR-005 | Remove from active view vs delete from model | P1 | PR 3 |
| CC-CR-006 | Export validation/error handling | P1 | PR 4 |
| CC-CR-007 | Import duplicate-ID tests and repair behavior | P1 | PR 4 |
| CC-CR-008 | Heatmap default unscored nodes | P1 | PR 4 |
| CC-CR-009 | Defensive traversal cycle guards | P2 | PR 5 |
| CC-UX-001 | Toolbar simplification | P1 | PR 6 |
| CC-UX-002 | Inline canvas label editing | P1 | PR 7 |
| CC-UX-003 | Selection and bulk editing UX | P1 | PR 8 |
| CC-UX-004 | Outline search with path context | P1 | PR 9 |
| CC-UX-005 | Source model vs active view language | P1 | PR 3/9 |
| CC-UX-006 | View management flow | P2 | PR 10 |
| CC-UX-007 | Scoped settings drawer | P2 | PR 11 |
| CC-UX-008 | Export preview and active-view contract | P2 | PR 12 |
| CC-UX-009 | SVG/PPTX render fidelity | P2 | PR 13 |
| CC-UX-010 | Import review and recovery | P2 | PR 14 |
| CC-UX-011 | Actionable diagnostics | P2 | PR 15 |
| CC-UX-012 | Command palette and shortcut help | P2 | PR 16 |
| CC-UX-013 | Accessibility and keyboard completeness | P2 | PR 17 |
| CC-PERF-001 | 1,000-node smoke/performance guardrails | P2 | PR 18 |

---

# 10. Acceptance smoke flows

These flows should be added to Playwright over time. They are written as product-level acceptance tests.

## Flow 1 — Create and directly edit a three-level hierarchy

1. Open editor.
2. Add root capability.
3. Rename root inline on canvas.
4. Add child.
5. Rename child inline.
6. Add grandchild.
7. Verify outline shows full hierarchy.
8. Export JSON.
9. Import JSON.
10. Verify structure and labels survive.

Expected result: three-level hierarchy preserved, labels updated, no validation errors.

## Flow 2 — Remove from view vs delete from model

1. Select a visible leaf.
2. Use “Remove from active view.”
3. Verify leaf disappears from visual canvas.
4. Verify leaf remains in outline as hidden.
5. Export JSON and verify leaf exists.
6. Undo.
7. Use “Delete from model.”
8. Confirm deletion.
9. Verify leaf removed from outline and JSON.
10. Undo restores it.

Expected result: user-facing actions clearly map to model/view behavior.

## Flow 3 — Viewer read-only guarantee

1. Load `/viewer`.
2. Snapshot serialized document.
3. Toggle heatmap.
4. Fit view.
5. Switch views.
6. Select nodes.
7. Export visual.
8. Snapshot serialized document again.

Expected result: serialized document is unchanged.

## Flow 4 — Autosave truthfulness

1. Open editor.
2. Change a label.
3. Verify status becomes unsaved/saving/saved.
4. Reload.
5. Verify changed label restored.
6. Press Undo.

Expected result: Undo reverts the user edit, not the restore operation.

## Flow 5 — View rename history

1. Open Views drawer.
2. Rename active view to a longer name.
3. Press Undo once.

Expected result: previous name returns in one undo step.

## Flow 6 — Export validation and error handling

1. Inject or import invalid geometry in a test fixture.
2. Open export drawer.
3. Verify validation error visible.
4. Attempt visual export.
5. Verify blocked or explicit export-anyway confirmation.
6. Mock adapter failure.
7. Verify diagnostic shown.

Expected result: no silent failed export and no misleading success state.

## Flow 7 — Heatmap unscored nodes

1. Enable heatmap.
2. Add child.
3. Verify new child has no heatmap score.
4. Set heatmap value to `0`.
5. Verify explicit zero displays and exports.

Expected result: unscored and zero are visually and semantically distinct.

## Flow 8 — Large model

1. Load generated 1,000-node fixture.
2. Pan.
3. Zoom.
4. Search for a deep node.
5. Select it.
6. Fit view.
7. Export preview.

Expected result: no obvious lag or errors.

---

# 11. Data model and migration notes

## 11.1 Existing document model

The current model should remain intact:

- `CapabilityDocument`
- `CapabilityNode`
- `childrenByParentId`
- `VisualWorkspace`
- `VisualView`
- `VisualNodeState`
- `HeatmapState`
- `LayoutMetadata`

The PRD does not require schema-breaking changes.

## 11.2 Optional additions

Potential additive changes:

```ts
interface DocumentSaveState {
  saveStatus: "idle" | "dirty" | "saving" | "saved" | "error";
  lastSavedAt?: number;
  dirtySince?: number;
  lastSaveError?: string;
}
```

```ts
interface ViewerOverrides {
  activeViewId?: VisualViewId;
  viewportByViewId?: Record<VisualViewId, VisualViewport>;
  heatmapEnabled?: boolean;
}
```

```ts
interface ExportPlan {
  format: ExportFormat;
  scope: "full-document" | "active-view";
  resolvedDoc: CapabilityDocument;
  bounds: Bounds;
  visibleNodeIds: NodeId[];
  includeHiddenNodes: boolean;
  includeHeatmapLegend: boolean;
  diagnostics: Diagnostic[];
}
```

```ts
interface ViewBaselineMetadata {
  templateId?: string;
  templateContext?: VisualView["templateContext"];
  createdFromDocumentRevision?: string;
  baseTemplateHash?: string;
}
```

These should be introduced only if they reduce ambiguity and do not overcomplicate the current model.

## 11.3 Migration

No mandatory wire schema migration is required for Phase 1. If view baseline metadata is added later, it can be optional and computed for older documents.

Migration rule:

- If no baseline metadata exists, derive baseline from `templateId` and `templateContext`.
- If derivation fails, treat view as changed and show a conservative confirmation.

---

# 12. Design principles

1. **Prefer direct manipulation, but never hide the model contract.** Canvas actions should be fast, while model/view scope remains visible.
2. **Use the command layer for all model changes.** Do not bypass transactions for document edits.
3. **Keep viewer interactions non-mutating.** Read-only means read-only.
4. **Make save state honest.** “Saved” must mean a successful write completed.
5. **Use active view language.** Avoid “canvas” when the user-facing concept is a visual view.
6. **Disable with reasons.** Invalid actions should either be impossible or explain why.
7. **Make exports predictable.** Export scope and fidelity limitations must be visible before download.
8. **Keep enterprise density.** Do not turn the app into a marketing-style interface; make dense UI clearer, not larger.
9. **Preserve local-first operation.** No backend assumptions.
10. **Test correctness before redesign.** Trust issues are more expensive than layout polish.

---

# 13. Definition of done

A PR implementing any requirement is done when:

1. Acceptance criteria are met.
2. Unit/component/e2e tests are added or updated.
3. `npm run typecheck` passes.
4. `npm run lint` passes.
5. `npm run test:run` passes.
6. Relevant `npm run test:e2e` scenarios pass.
7. User-facing terminology is consistent.
8. Diagnostics/status copy is honest.
9. Undo/redo behavior is verified for any transaction change.
10. JSON round-trip behavior is not broken.
11. Visual exports still pass existing export tests.
12. Documentation is updated if model/view/export behavior changes.

---

# 14. PR recommendations

The first PR should be narrow and correctness-focused:

## PR 1 — “Fix read-only viewer and autosave status”

Scope:

1. Make viewer Fit and Heatmap non-mutating.
2. Add save status state.
3. Mark successful autosave as saved.
4. Hydrate restored document without undo history and without dirtying it.
5. Update status bar copy.
6. Add tests for viewer no-mutation and restore/no-history.

Why first:

- It directly addresses user trust.
- It is mostly isolated.
- It reduces risk before changing UI structure.
- It gives later UX work a correct status foundation.

Proposed test checklist for PR 1:

- Viewer heatmap toggle does not change serialized doc.
- Viewer fit does not change serialized doc.
- Autosave success clears dirty.
- Save failure is visible.
- Restore does not create history.
- Status bar text matches actual save state.

## Suggested follow-on PRs

Keep the follow-on PRs small enough that each one can be reviewed against one product promise. PRs 2-5 should finish the correctness and trust foundation before larger workspace UI changes. PRs 6-11 should improve day-to-day modeling ergonomics. PRs 12-18 should harden import/export, diagnostics, accessibility, and scale.

## PR 2 — “Make view editing history predictable”

Backlog IDs: `CC-CR-003`, `CC-CR-004`

Scope:

1. Change view rename inputs to draft locally while typing and commit once on blur or Enter.
2. Make Escape cancel an in-progress rename without dirtying the document.
3. Fix view reset confirmation so unchanged default views do not warn.
4. Ensure reset and rename each produce one clear undo history entry only when the view actually changes.

Test focus:

- Renaming a view and pressing Undo once restores the previous name.
- Typing and pressing Escape leaves the document clean.
- Reset prompts only after meaningful view changes.
- Reset can be undone in one step.

## PR 3 — “Separate source-model deletes from active-view removes”

Backlog IDs: `CC-CR-005`, `CC-UX-005`

Scope:

1. Rename visible actions so the user sees “Remove from active view” and “Delete from model” as separate commands.
2. Make the default Delete-key behavior non-destructive to the source model, with a deliberate shortcut or menu path for model deletion.
3. Add confirmation copy for model deletion that states descendants and exports are affected.
4. Add source-model vs active-view language to the toolbar, inspector, outline, and relevant empty states.
5. Preserve JSON/source exports while making visual exports respect active-view visibility.

Test focus:

- Removing a node from the active view keeps it in the outline and JSON.
- Deleting from the model removes descendants and can be undone.
- Keyboard shortcuts map to the documented behavior.
- Hidden/removed nodes are discoverable and restorable.

## PR 4 — “Make import/export failures explicit”

Backlog IDs: `CC-CR-006`, `CC-CR-007`, `CC-CR-008`

Scope:

1. Block or require confirmation before visual export when validation has errors.
2. Surface export adapter failures as visible diagnostics with actionable copy.
3. Add duplicate-ID import tests, including parent references that target renamed duplicates.
4. Treat newly added heatmap values as unscored by default until explicitly scored.
5. Verify JSON round-trip behavior after repair.

Test focus:

- Invalid geometry is shown before export and cannot fail silently.
- Export adapter exceptions appear in the UI.
- Duplicate IDs are repaired deterministically.
- New nodes do not inherit misleading heatmap scores.

## PR 5 — “Defend traversal helpers against malformed graphs”

Backlog ID: `CC-CR-009`

Scope:

1. Centralize recursive traversal guards for ancestors, descendants, outline walking, and containment-related helpers.
2. Return diagnostics or bounded results instead of overflowing the stack on invalid cycles.
3. Keep valid-document traversal behavior unchanged.

Test focus:

- Cyclic fixtures do not hang or crash.
- Missing-parent fixtures produce diagnostics.
- Existing valid sample traversal snapshots remain stable.

## PR 6 — “Simplify the primary workspace toolbar”

Backlog ID: `CC-UX-001`

Scope:

1. Keep primary modeling actions visible and move secondary actions into grouped menus.
2. Separate Model, View, Layout, Import, and Export command groups.
3. Preserve keyboard access and responsive behavior at narrow widths.
4. Avoid moving state ownership between the three Zustand stores.

Test focus:

- Existing toolbar commands remain reachable.
- Primary add/edit/layout/export paths are visible and keyboard usable.
- Toolbar does not wrap or overlap at tested viewport widths.

## PR 7 — “Add inline canvas label editing”

Backlog ID: `CC-UX-002`

Scope:

1. Support double-click and keyboard-triggered inline label edits on canvas nodes.
2. Commit edits as one document transaction.
3. Keep inspector label editing behavior consistent with inline editing.
4. Prevent drag and selection preview state from entering `documentStore`.

Test focus:

- Double-click rename updates canvas, outline, inspector, and JSON.
- Enter commits, Escape cancels, blur commits when changed.
- Undo restores the previous label in one step.

## PR 8 — “Improve selection and bulk editing”

Backlog ID: `CC-UX-003`

Scope:

1. Make single-selection, multi-selection, and empty-selection states visually distinct.
2. Add bulk edit affordances only for properties that are safe across selected node types.
3. Keep text-label limitations explicit where relevant.
4. Ensure selection previews remain transient.

Test focus:

- Multi-select shows count and supported bulk actions.
- Bulk edits commit once and can be undone once.
- Unsupported mixed selections do not expose unsafe controls.

## PR 9 — “Improve outline search and view context”

Backlog IDs: `CC-UX-004`, `CC-UX-005`

Scope:

1. Add outline search with path context for matching nodes.
2. Show whether results are visible, hidden, collapsed, or outside the active view.
3. Provide direct restore/show-in-view actions where safe.
4. Finish source-model vs active-view language that did not belong in PR 3.

Test focus:

- Search finds deep nodes by label.
- Result paths disambiguate duplicate labels.
- Hidden/collapsed result states are accurate.
- Selecting a result focuses the expected canvas node when visible.

## PR 10 — “Improve view creation and management”

Backlog ID: `CC-UX-006`

Scope:

1. Make creating, duplicating, renaming, resetting, and deleting views a coherent flow.
2. Protect the last remaining view from deletion.
3. Clarify what is copied when a view is duplicated.
4. Keep view-level changes scoped to visual state, not the source hierarchy.

Test focus:

- View duplicate preserves expected visual settings.
- Deleting a non-active view updates state safely.
- Deleting the last view is prevented.
- Active-view changes survive reload.

## PR 11 — “Split settings by scope”

Backlog ID: `CC-UX-007`

Scope:

1. Separate document, active-view, layout, export, and local UI preferences.
2. Move controls to the store that owns their state.
3. Make persistence behavior explicit in labels and status copy where useful.
4. Keep high-frequency UI state out of persisted stores.

Test focus:

- View settings persist with the document.
- Local UI preferences persist through local storage only.
- Transient interactions do not dirty the document.

## PR 12 — “Add export preview and active-view export contract”

Backlog ID: `CC-UX-008`

Scope:

1. Add an export preview that reflects the active visual view.
2. State whether each format exports the active view or the whole source model.
3. Show validation state and warnings next to the selected export format.
4. Keep JSON/source export behavior intentionally different from visual exports.

Test focus:

- Preview hides nodes removed from the active view.
- Format-specific scope copy is accurate.
- Export warnings appear before the export action.

## PR 13 — “Improve SVG and PPTX visual fidelity”

Backlog ID: `CC-UX-009`

Scope:

1. Align DOM, SVG, and PPTX sizing, colors, labels, badges, and heatmap legend treatment.
2. Use `resolveNodeFill(node, heatmap)` everywhere visual color is rendered.
3. Add or update snapshot tests for representative export states.

Test focus:

- Heatmap and normal color modes match expected fills.
- Long labels and badges do not overflow badly in SVG/PPTX.
- Existing export snapshots are intentionally updated.

## PR 14 — “Add import review and safe recovery”

Backlog ID: `CC-UX-010`

Scope:

1. Show an import review summary before replacing the current document.
2. List repairs, warnings, duplicate IDs, missing parents, and validation errors.
3. Preserve a safe rollback path if import produces an unusable model.
4. Keep parse/serialize conversion isolated at the wire boundary.

Test focus:

- Import summary reports repairs and warnings.
- Cancel leaves the current document unchanged.
- Accepting import replaces the document without adding a misleading undo entry.

## PR 15 — “Make diagnostics actionable”

Backlog ID: `CC-UX-011`

Scope:

1. Add a diagnostics panel or drawer with severity, affected node, and recommended action.
2. Link diagnostics to selection or outline focus when possible.
3. Add repair actions only when they can be deterministic and safe.
4. Keep tests asserting diagnostic codes rather than message text.

Test focus:

- Diagnostics are grouped and actionable.
- Selecting a diagnostic focuses the relevant node.
- Repair actions update the model through transactions.

## PR 16 — “Add command palette and shortcut help”

Backlog ID: `CC-UX-012`

Scope:

1. Add a command palette for common model, view, layout, import/export, and navigation commands.
2. Add shortcut help generated from the same command metadata where practical.
3. Disable or hide commands that are unsafe for the current selection or route.
4. Keep viewer-route commands read-only.

Test focus:

- Palette opens by keyboard and mouse.
- Commands execute the same handlers as toolbar/menu actions.
- Disabled commands explain why they are unavailable.

## PR 17 — “Complete accessibility and keyboard coverage”

Backlog ID: `CC-UX-013`

Scope:

1. Audit keyboard paths across toolbar, drawers, outline, canvas selection, inspector, and dialogs.
2. Add focus management for modals, menus, inline editing, and drawer close/return.
3. Add accessible names for icon-only controls.
4. Verify contrast and visible focus states.

Test focus:

- Keyboard-only smoke flow can create, rename, remove, restore, and export.
- Dialog focus is trapped and restored.
- Icon buttons have accessible names.

## PR 18 — “Add large-model performance guardrails”

Backlog ID: `CC-PERF-001`

Scope:

1. Add a generated 1,000-node fixture or builder.
2. Add smoke coverage for editor load, outline render, selection, pan/zoom, layout, and export preview where feasible.
3. Add benchmark-like unit checks for expensive selectors and visual resolution helpers.
4. Document acceptable performance budgets without making tests flaky.

Test focus:

- 1,000-node model loads without validation crashes.
- Core selectors complete within an agreed budget on CI.
- Canvas and outline remain usable in smoke tests.

---

# 15. Open product questions

These need product-owner decisions before later PRs:

1. Should visual view viewport be persisted automatically, or should viewport be treated as local UI state unless the user saves the view?
2. Should active-view heatmap enabled/show legend be view-scoped, document-scoped, or both?
3. Should Delete key remove from active view or delete from model? Recommended: Delete removes from active view; Shift+Delete deletes from model with confirmation.
4. Should hidden nodes be considered part of active view export for any visual format? Recommended: no, except JSON.
5. Should ArchiMate export include all model nodes or only active view nodes? Current tests suggest ArchiMate includes hidden nodes; the UI must state this clearly.
6. Should imported external source models be source-locked in the UI, with only visual overrides allowed? This aligns with the broader “source model vs visual publishing” direction, but current code supports direct edits.
7. Should heatmap palette be global or view-specific? Recommended: palette global at first; enabled/show legend view-specific.
8. Should text labels remain excluded from multi-selection permanently? Recommended: yes for layout bulk operations, but allow text-label bulk text styling later.
9. Should view reset compare against a generated template baseline or store explicit baseline metadata? Recommended: generated baseline first, stored metadata later if needed.
10. Should export preview use SVG rendering as the canonical visual preview even for PPTX/draw.io? Recommended: yes initially, with format-specific warnings.

---

# 16. Appendix — Suggested component extraction

Current components are workable, but some shared components would reduce duplication and history bugs.

Recommended new shared components/hooks:

- `CommitTextInput`
- `CommitNumberInput`
- `ConfirmDestructiveAction`
- `ScopeBadge`
- `DiagnosticPanel`
- `ToolbarOverflowMenu`
- `AddMenu`
- `CommandPalette`
- `ShortcutHelp`
- `useResolvedVisualDocument`
- `useMenuKeyboardNavigation`
- `ExportScopeCard`
- `ImportReviewDialog`

Recommended domain helpers:

- `resolveExportPlan`
- `viewHasUserChanges`
- `getSearchMatchesWithAncestors`
- `safeDescendantsOf`
- `formatDiagnosticMessage`
- `isDocumentSerializedEqual` or `documentRevisionHash` for save state

---

# 17. Appendix — Copy guidelines

Use these exact phrases consistently:

| Concept | Preferred user-facing phrase | Avoid |
|---|---|---|
| Hide from view | Remove from active view | Remove from canvas |
| Show in view | Add to active view | Add to canvas |
| Permanent deletion | Delete from model | Delete, when ambiguous |
| JSON export | Full-fidelity JSON | Backup only |
| Visual export | Active view export | Diagram export, if scope unclear |
| Viewer | Read-only view | Editor, if actions mutate |
| Save state | Saved locally / Unsaved local changes / Save failed | All changes saved locally when untrue |
| Heatmap missing value | No score | 0, unless explicit |
| Layout preservation | Preserve from auto layout | Lock, if move still allowed |
| Source hierarchy | Source model | Canvas model |

---

# 18. Appendix — Example PR acceptance template

Use this template for implementation PRs:

```md
## Summary

Implements CC-XXX.

## User-visible behavior

- ...
- ...

## Technical changes

- ...
- ...

## Tests

- [ ] Unit tests
- [ ] Component tests
- [ ] Playwright tests
- [ ] Existing export tests
- [ ] Typecheck
- [ ] Lint
- [ ] Build

## Acceptance criteria mapping

- AC1: ...
- AC2: ...
- AC3: ...

## Risks

- ...

## Rollback

- ...
```
