# Capability Canvas Modeling UX Correctness

## 1. Executive Summary

One-sentence objective: implement layout-mode-aware canvas interaction rules that make Capability Canvas modeling intuitive, semantically correct, and safe across Manual and Automatic layout modes.

User-visible outcome: users can tell whether they are editing a visual layout, changing the semantic capability model, or asking the automatic layout engine to recompute the view, and canvas actions behave consistently in each mode.

Why this matters: Capability Canvas is used to communicate and reason about business capabilities; if drag, resize, reparent, import, or auto-layout actions silently change the wrong state, users lose trust in the model and the canvas becomes a drawing tool rather than a reliable modeling surface.

What Codex is expected to implement: inspect the repository, confirm existing architecture, then implement a narrow set of UI and correctness improvements covering Manual layout behavior, Automatic layout behavior, source-locked model behavior, action guardrails, containment geometry invariants, persistence, undo/redo coverage where supported, and automated tests.

What Codex must not implement: do not replace the existing canvas architecture, do not introduce a new diagramming framework, do not create a new database or external service, do not change authentication or authorization, do not redesign unrelated UI, and do not convert Capability Canvas into a generic node-edge graph editor.

Primary success condition: every direct canvas action has deterministic, test-covered behavior based on layout mode and model editability, and invalid actions are blocked with clear user feedback rather than silently corrupting semantic model state or visual layout state.

Primary risk: mixing semantic model changes with visual layout changes, especially when users drag or resize containment rectangles in Manual layout or attempt the same actions in Automatic layout.

## 2. Codex Kickoff Prompt

```text
Read `SPEC_capability-canvas-modeling-ux-correctness.md` first.

Then inspect the repository instructions and structure before editing files. Read `AGENTS.md` if present, plus relevant README files, package/build files, test configuration, lint/typecheck configuration, existing source conventions, canvas/layout-related folders, and any persisted model/view schema definitions.

Implement the specification milestone by milestone. Before coding, update the Repository Discovery section with what you find and confirm or revise the repo-specific implementation plan. Do not implement anything listed as out of scope.

Pay special attention to the distinction between semantic capability model state and visual view/layout state. Manual layout may permit direct visual geometry edits. Automatic layout must not permit silent direct geometry edits. Source-locked imported models must not be semantically mutated by visual canvas actions.

After each milestone, run the relevant validation commands and update the Progress, Discoveries During Implementation, Decision Log, and Outcomes and Retrospective sections in the spec.

When finished, run the full validation suite, review the final diff for unintended changes, and provide a final summary with changed files, commands run, results, remaining risks, and suggested follow-ups.

Stop only when all acceptance criteria and validation checks in the spec are satisfied.
```

## 3. Optional `/goal` Prompt

This section is optional. The main workflow is to use the Codex Kickoff Prompt above. `/goal` may not be available in all Codex surfaces.

```text
/goal Implement `SPEC_capability-canvas-modeling-ux-correctness.md` end-to-end. Read the spec and repo instructions first, inspect the repository, confirm the implementation plan, work milestone by milestone, keep the spec updated as a living execution record, run validation after each milestone, review the final diff, and stop only when all acceptance criteria and validation checks pass.
```

## 4. Background and Context

Capability Canvas is a modeling canvas for business capability models. The current task is to perform a deep UX and correctness review of modeling behavior on the canvas, with special attention to different actions in Manual layout versus Automatic layout.

The product problem is not merely visual polish. The hard problem is preserving modeling intent. A user dragging a rectangle may intend to change a visual arrangement, not reparent a business capability. A user applying automatic layout may intend to improve readability, not overwrite a carefully curated manual view. A user editing an imported release may expect source data to remain locked while still being able to prepare a presentation view.

Desired future state:

- Canvas actions are predictable because they are governed by a central policy using at least layout mode and model editability.
- Manual layout supports direct visual manipulation while preserving containment correctness and semantic model integrity.
- Automatic layout uses the layout engine as the source of visual geometry and blocks or redirects direct geometry edits.
- The UI clearly communicates mode, blocked actions, destructive actions, and whether the semantic model or only the visual view is being changed.
- Imported/source-locked models remain semantically immutable while visual views can still be adjusted where the product supports visual-only binding.
- Undo/redo, persistence, tests, and manual smoke tests cover the same action semantics users experience.

Relevant prior context available at spec generation:

- Capability Canvas has been discussed as a visual publishing and presentation layer for externally modeled capability data.
- Imported models may be source-locked, with visual adjustments allowed without altering semantic model state.
- Saved visual views and view templates may exist or be planned, including layout, zoom, heatmap lens, legends, branding, and export settings.
- Prior project context indicates Capability Canvas is based on nested rectangular containment rather than a generic node-edge graph.
- Prior project context indicates that React Flow or other node-edge graph frameworks were considered inappropriate for the nested rectangle containment model.
- Prior project context indicates the preferred layout concept is a custom contained-rectangle layout engine, including recursive subtree sizing, parent sizing from children, child packing, padding, gaps, and layout modes.
- Prior project context indicates a Balanced Ratio DP or similar automatic layout approach was recommended to preserve sibling order and optimize row rhythm, ratio fit, compactness, raggedness, and center balance.
- Prior project context identified historical correctness issues: child elements did not move with their parent during drag, parents could be resized smaller than children, and undo/redo behavior was missing or incomplete.

Constraints already established:

- The spec must be self-contained because Codex cannot see this ChatGPT conversation.
- Repository details are not available to this spec generator; Codex must discover them.
- Markdown is the required output format.
- The task must be narrow enough for one Codex implementation pass.
- The implementation must avoid broad architecture rewrites.
- The implementation must distinguish semantic modeling from visual layout.

Important rejected ideas:

- Do not treat Capability Canvas as a generic node-edge diagram editor.
- Do not introduce React Flow, ELK, Yoga, or another layout/canvas framework unless the repository already uses it and the change can be made without replacing the current architecture.
- Do not make drag across a parent boundary silently reparent a capability.
- Do not allow Automatic layout to behave like Manual layout with hidden geometry overrides.
- Do not let imported/source-locked capability data be edited through visual canvas interactions.

External modeling sanity baseline:

- A business capability should represent what the organization can do, not how a process, system, person, or department performs it.
- A capability model normally uses hierarchical grouping, levels, and stable business language.
- Canvas UX should reinforce this modeling discipline by separating capability identity and hierarchy from view-specific geometry and presentation.

## 5. Users and Use Cases

### Use Case 1: Enterprise architect arranges a model manually

Actor: enterprise architect.

Trigger: the user switches to Manual layout or opens a saved Manual view.

Current pain or limitation: drag and resize behavior may be ambiguous or unsafe; moving a parent may leave children behind; resizing a parent may overlap or hide children; visual changes may be confused with semantic hierarchy changes.

Desired outcome: the user can directly arrange rectangles while containment, child bounds, and model semantics remain valid.

Observable success: after dragging or resizing, all children remain visually contained, parent bounds respect minimum size constraints, and no semantic parent-child relationships change unless the user performs an explicit semantic action.

### Use Case 2: Enterprise architect uses Automatic layout for readability

Actor: enterprise architect.

Trigger: the user opens an Automatic view, switches to Automatic layout, imports/loads a model, or applies auto-arrange.

Current pain or limitation: users may try to drag or resize nodes even though geometry is controlled by the layout engine; silent overrides can make Automatic layout unpredictable.

Desired outcome: Automatic layout clearly owns geometry and direct manual geometry edits are blocked or redirected through an explicit mode switch.

Observable success: drag/resize handles are disabled or produce a clear “switch to Manual layout” affordance; automatic re-layout produces deterministic geometry; persisted Automatic views do not contain ad hoc manual geometry mutations unless the repository already supports explicit pins and they are deliberately implemented.

### Use Case 3: Enterprise architect reviews imported source-locked data

Actor: enterprise architect or reviewer.

Trigger: the user opens a model imported from an external source or release.

Current pain or limitation: visual corrections may accidentally mutate source data, or semantic edit controls may appear available even though the model is source-locked.

Desired outcome: source-locked models allow safe visual view preparation while blocking semantic model edits.

Observable success: semantic actions such as rename, create, delete, and reparent are disabled or read-only for source-locked data; allowed visual actions update only view state; blocked actions show a clear reason.

### Use Case 4: User switches between Manual and Automatic layout

Actor: any Capability Canvas user.

Trigger: the user changes the layout mode selector or applies an automatic layout to a manually arranged view.

Current pain or limitation: mode switching can overwrite manual layout decisions or leave old overrides in a state that makes future behavior confusing.

Desired outcome: switching modes is explicit, reversible through undo where supported, and does not silently destroy manual geometry.

Observable success: switching from Automatic to Manual captures current geometry as the manual baseline; switching from Manual to Automatic either preserves the manual view separately or requires explicit confirmation before clearing/manual-overriding geometry, depending on existing product conventions discovered by Codex.

### Use Case 5: User changes semantic model structure where editing is allowed

Actor: model author.

Trigger: the user creates, renames, deletes, or explicitly reparents a capability in an editable model.

Current pain or limitation: semantic edits and visual edits may be conflated; automatic layout may not reflow after semantic changes; manual layout may not know where to place new elements.

Desired outcome: semantic edits are explicit, validated, undoable where history exists, and update the visual view according to current layout mode.

Observable success: in Automatic layout, semantic changes trigger layout recomputation; in Manual layout, semantic changes preserve existing valid geometry and assign deterministic initial geometry to new or moved elements.

### Use Case 6: Keyboard or assistive technology user edits the canvas

Actor: keyboard-only user or assistive technology user.

Trigger: the user navigates to canvas controls, mode selectors, action buttons, or selected capability controls.

Current pain or limitation: disabled or blocked actions may be invisible to non-pointer users; mode state may not be announced.

Desired outcome: mode state and action availability are exposed through accessible controls and messages.

Observable success: keyboard focus reaches layout mode controls; disabled actions are programmatically disabled or described; blocked action messages are announced through the existing notification/status pattern if present.

## 6. Scope

### 6.1 In Scope

- Discover the existing repository architecture, canvas implementation, model/view state structures, layout engine, tests, and command scripts.
- Implement or centralize a canvas action policy that determines whether each canvas action is allowed, blocked, or requires confirmation based on layout mode, model editability, selection type, and current view state.
- Add or update user-facing indicators for current layout mode and model editability where the canvas currently lacks them.
- Enforce Manual layout containment invariants for drag and resize actions.
- Ensure dragging a parent in Manual layout moves its child subtree consistently, either by moving nested DOM/SVG groups or by updating child-relative geometry according to repository conventions.
- Ensure parent resize in Manual layout cannot make the parent smaller than its title, padding, and child bounds.
- Ensure Automatic layout owns geometry and blocks direct drag/resize geometry edits unless the repository already has an explicit, tested pin/override concept.
- Add explicit UX behavior for switching from Automatic to Manual and from Manual to Automatic.
- Preserve the distinction between semantic model edits and visual view edits.
- Enforce source-locked/imported model behavior by blocking semantic edits while permitting allowed visual-only actions.
- Ensure accepted canvas actions participate in undo/redo if the repository has an existing history mechanism; if no history exists, add a minimal action-history integration only for actions changed by this spec if feasible in one pass.
- Persist layout mode and allowed visual geometry state according to existing view persistence conventions.
- Add tests covering action policy, geometry invariants, blocked actions, mode switching, and source-locked behavior.
- Add or update manual smoke test documentation if the repository maintains it.
- Update this spec as a living execution record during implementation.

### 6.2 Out of Scope

- Do not replace the existing rendering framework or canvas engine.
- Do not introduce a generic node-edge graph editor.
- Do not add React Flow, ELK, Yoga, or another layout library unless the repository already uses it and no framework replacement is required.
- Do not redesign the full Capability Canvas UI outside the specific interaction and correctness changes listed here.
- Do not change authentication, authorization, account management, or tenant isolation behavior.
- Do not introduce a new database, external service, telemetry platform, or cloud dependency.
- Do not implement collaborative multi-user editing.
- Do not implement full model import/export pipelines unless existing source-lock flags require a small compatibility update.
- Do not add heatmap lenses, legends, branding, export settings, or saved view templates beyond layout mode and visual geometry behavior required for this task.
- Do not implement AI model generation, semantic capability quality scoring, or automated capability naming suggestions.
- Do not alter unrelated UI components, unrelated routes, or unrelated data models.
- Do not remove existing layout algorithms unless they are dead code and removal is explicitly required by repository maintainers.

### 6.3 Later Phases

- Rich saved view templates with branding, legends, heatmap lenses, and export presets.
- Explicit pinning in Automatic layout, if product direction supports a hybrid layout mode.
- Multi-select align, distribute, and pack tools for Manual layout.
- Visual diff between semantic model versions or imported releases.
- Collaboration, comments, and review workflows.
- Semantic capability linting, such as warnings for process-like names or duplicated capability names.
- Advanced keyboard geometry editing with nudge, resize, align, and distribute commands.
- Animated transitions between layout modes.
- A full source-data governance panel explaining model provenance and lock state.

## 7. Known Facts, Assumptions, and Open Questions

### 7.1 Known Facts

- The requested feature area is Capability Canvas modeling UX and correctness.
- The required distinction is Manual layout versus Automatic layout.
- The output must be a Codex-ready repository specification in Markdown.
- The repository is not visible to this spec generator.
- Codex must inspect the repository before editing files.
- Capability Canvas is intended to model business capabilities, not arbitrary diagrams.
- Prior project context indicates Capability Canvas uses nested rectangular containment rather than a generic node-edge graph.
- Prior project context indicates imported/released models may be source-locked with visual-only binding.
- Prior project context indicates prior issues included children not moving with parents, parent resize constraints, and incomplete undo/redo.
- Prior project context indicates automatic layout is likely a custom contained-rectangle layout algorithm rather than a flexbox or graph layout engine.

### 7.2 Assumptions

Assumption: the repository is a web application with a TypeScript or JavaScript frontend.

Why it is reasonable: prior context referenced React-style canvas components and TypeScript-like layout code.

How Codex can verify it in the repository: inspect package/build files, source extensions, README files, and frontend folders.

What Codex should do if the assumption is wrong: map the requirements to the actual stack without introducing a new framework; update the Repository Discovery section and implementation plan before coding.

Assumption: there is an existing concept of layout mode or enough view state to introduce one minimally.

Why it is reasonable: the user explicitly asked to consider Manual and Automatic layout behavior.

How Codex can verify it in the repository: search for layout mode names, auto layout commands, manual layout flags, view settings, and persisted geometry fields.

What Codex should do if the assumption is wrong: introduce the smallest explicit layout mode representation needed for this spec and update persistence only if required by existing behavior.

Assumption: the semantic model and visual view state can be separated or are already separated.

Why it is reasonable: prior context emphasized visual-only binding for imported models and saved visual views.

How Codex can verify it in the repository: inspect model types, view state types, persistence schemas, import handlers, and save/load paths.

What Codex should do if the assumption is wrong: do not perform a broad data model rewrite; create a small adapter or action policy layer that prevents further conflation and document remaining risks.

Assumption: source-locked imported models are represented by a flag, release state, import source, or read-only mode.

Why it is reasonable: prior context referenced source-locked releases.

How Codex can verify it in the repository: search for terms such as import, release, readOnly, locked, source, external, viewOnly, editable, and provenance.

What Codex should do if the assumption is wrong: implement the policy against the closest existing editability concept; if no source-lock concept exists, keep semantic editability behavior unchanged and add tests only for modes that exist.

Assumption: direct drag and resize actions are currently implemented or planned.

Why it is reasonable: the task asks about actions taken on the canvas, and prior context identified drag/resize defects.

How Codex can verify it in the repository: inspect canvas event handlers, interaction libraries, drag handles, resize handles, mouse/pointer events, and tests.

What Codex should do if the assumption is wrong: implement only action policy and UX guardrails around existing actions; do not add entirely new canvas tools unless necessary to satisfy current behavior.

Assumption: undo/redo either exists or can be integrated for changed actions.

Why it is reasonable: prior context identified undo/redo as important and historically incomplete.

How Codex can verify it in the repository: search for history, undo, redo, command stack, snapshots, reducer history, or keyboard shortcut hooks.

What Codex should do if the assumption is wrong: do not build a full global history subsystem if it would exceed one implementation pass; implement minimal history coverage for touched actions only if feasible, otherwise document the gap and add acceptance criteria as not satisfied until resolved.

Assumption: automatic layout should be deterministic for identical input and settings.

Why it is reasonable: layout reproducibility is required for trust, testing, and predictable saved views.

How Codex can verify it in the repository: inspect layout algorithm inputs, sort order, child ordering, randomization, and tests.

What Codex should do if the assumption is wrong: remove randomness where possible or persist stable seeds/settings; if not possible, document the conflict and add deterministic tests for policy behavior even if geometry differs slightly.

### 7.3 Open Questions

Question: What is the exact repository name and tech stack?

Whether Codex can proceed without the answer: yes.

Safe default if Codex must proceed: inspect root files and follow existing conventions.

Where Codex might find the answer: repository root, README files, package/build files, CI configuration, and source directory structure.

Question: What are the exact existing names for Manual and Automatic layout modes?

Whether Codex can proceed without the answer: yes.

Safe default if Codex must proceed: preserve existing names if present; otherwise use stable internal values such as `manual` and `automatic` while displaying user-facing labels as `Manual layout` and `Automatic layout`.

Where Codex might find the answer: layout settings components, reducers/stores, view serialization, and UI labels.

Question: Are semantic edits allowed inside Capability Canvas, or is it only a visual layer over external model data?

Whether Codex can proceed without the answer: yes.

Safe default if Codex must proceed: do not add new semantic editing capabilities; only guard existing semantic editing paths.

Where Codex might find the answer: model editors, create/delete/reparent handlers, import/release code, permissions, and README documentation.

Question: Should drag across a container boundary ever reparent a capability?

Whether Codex can proceed without the answer: yes.

Safe default if Codex must proceed: dragging must not reparent. Reparenting must require an explicit command, drop zone, confirmation, or repository-existing semantic action.

Where Codex might find the answer: existing drag/drop tests, context menu actions, product docs, or issue descriptions.

Question: Should switching from Manual to Automatic overwrite manual geometry, create a separate view, or temporarily preview automatic layout?

Whether Codex can proceed without the answer: yes.

Safe default if Codex must proceed: do not silently overwrite manual geometry; require explicit confirmation or preserve manual geometry separately if the repository already supports separate visual views.

Where Codex might find the answer: saved view implementation, layout mode selector, user docs, and existing state persistence.

Question: Does the product support pinned nodes in Automatic layout?

Whether Codex can proceed without the answer: yes.

Safe default if Codex must proceed: assume no pinning and block direct drag/resize in Automatic layout.

Where Codex might find the answer: layout algorithm options, view state schema, and UI controls for pinning/fixing nodes.

Question: What validation commands should Codex run?

Whether Codex can proceed without the answer: yes, after discovery.

Safe default if Codex must proceed: inspect package/build/test configuration and run the smallest relevant tests after each milestone, then full validation at the end.

Where Codex might find the answer: package scripts, build files, test config, CI workflows, and README files.

## 8. Repository Discovery Instructions

Codex must inspect the repository before implementing changes. Do not assume paths, framework, package manager, or test commands from this spec.

Inspect:

- Repository root.
- `AGENTS.md`, if present.
- README files.
- Package/build files.
- Test configuration.
- Lint/typecheck configuration.
- Existing feature folders related to Capability Canvas, canvas rendering, layout, model editing, and view persistence.
- Routing and API definitions.
- Database/schema/migration folders, if relevant.
- Existing tests.
- CI configuration, if present.
- Any documentation for imported models, releases, source locking, saved views, manual layout, automatic layout, undo/redo, or canvas shortcuts.

Codex must update this section after discovery with:

- Actual tech stack.
- Relevant directories.
- Existing patterns to follow.
- Files likely to change.
- Commands discovered.
- Existing layout mode names and state shape.
- Existing semantic model state shape.
- Existing visual view state shape.
- Existing source-lock/editability mechanism.
- Existing action/history/undo-redo mechanism.
- Any conflicts between repository conventions and this spec.

Repository Discovery Update Placeholder:

- Actual tech stack: React 19 + TypeScript + Vite, Zustand stores, IndexedDB via `idb`, Vitest/jsdom component and unit tests, Playwright E2E, ESLint with type-aware rules, PWA static build.
- Relevant directories: `src/domain/` for document, command, layout, validation, selection, and visual-view rules; `src/app/` for Zustand stores, autosave, import hydration, active visual-state resolution; `src/features/canvas/`, `src/features/editor/`, `src/features/inspector/`, `src/features/settings/`, `src/features/views/`, and `src/features/commands/` for UI integration; `tests/e2e/` for smoke tests.
- Existing patterns to follow: every mutation goes through domain `Transaction` objects and `documentStore.execute`; visual edits use command scope `"visual"` and are applied to the active `VisualView` through `resolveVisualDocument` / `applyResolvedVisualDocument`; semantic edits use scope `"source"`; undo/redo stores full before/after document snapshots; transient drag/resize previews stay in `useTransientStore`.
- Files likely to change: `src/domain/layout/canvasLayoutPolicy.ts`, related policy tests, geometry command tests, `src/features/canvas/useCanvasNodeInteractions.ts`, `src/features/canvas/CanvasNode.tsx`, `src/features/commands/useEditorActions.ts`, `src/features/commands/editorCommands.ts`, `src/features/editor/Toolbar.tsx`, `src/features/editor/StatusBar.tsx`, `src/features/inspector/*`, `src/app/stores/documentTransactions.ts`, document parse/serialize/types if source-lock compatibility is added, and focused editor/store tests.
- Commands discovered: `npm run lint`, `npm run typecheck`, `npm run test:run`, `npm run build`, `npm run test:e2e`; focused Vitest runs can use `npm run test:run -- <path-or-pattern>`.
- Existing layout mode names and state shape: document/view modes are `"uniform"`, `"flow"`, `"adaptive"`, `"balanced"`, and `"free"`; `"free"` is the repository-equivalent Manual/Freeform view mode, while the other modes are automatic. Per-parent `isManualPositioningEnabled` currently preserves a parent's children during automatic layout.
- Existing semantic model state shape: `CapabilityDocument` stores normalized `nodesById` plus `childrenByParentId`; `ROOT_PARENT_ID = "__root__"` stores top-level roots; `CapabilityNode.parentId` is the semantic hierarchy relation.
- Existing visual view state shape: `CapabilityDocument.visual.viewsById[activeViewId]` stores `nodeStatesById`, viewport, layout mode/metadata, heatmap, export settings, and optional baselines. Active-view geometry overrides are resolved into a temporary visual document and written back to the active view for visual commands.
- Existing source-lock/editability mechanism: route-level viewer mode passes `readonly` to canvas/outline/inspector, but there is no persisted source-lock field for editable routes. This implementation will add a small optional document access flag and a transaction guard for source-scoped commands while keeping visual commands available when mode policy allows them.
- Existing action/history/undo-redo mechanism: `documentStore.execute` creates history entries for committed transactions; async relayout updates the most recent history entry after layout completes; `undo` and `redo` restore full document snapshots.
- Existing feedback mechanism: errors and informational diagnostics appear in the status bar diagnostics popover; selection notices appear as an `aria-live` status message in the status bar. Blocked action feedback should use these existing mechanisms.
- Conflicts between repo conventions and this spec: current repo behavior deliberately converts direct drag, keyboard nudge, numeric X/Y edits, and drag reparent in automatic modes into per-parent Manual positioning. The spec requires Automatic layout to block direct geometry edits unless the user explicitly switches to Manual/Freeform, so the policy and tests must be revised. Existing docs/help text also describe the old automatic-to-Manual conversion behavior and need targeted updates.
- Confirmed implementation plan: Milestone 2 will revise the central policy and UI signals first; Milestone 3 will fix Manual/Freeform min-size/containment behavior; Milestone 4 will block automatic direct geometry edits and verify safe mode switching; Milestone 5 will add persisted source-lock compatibility, transaction-level source edit protection, and history/persistence coverage; Milestone 6 will run full validation, browser smoke, final diff review, and update this spec.

## 9. Functional Requirements

### FR-001: Centralize canvas action permission decisions

Requirement: Codex must implement or identify a single canvas action policy mechanism that decides whether each relevant canvas action is allowed, blocked, or requires confirmation.

Rationale: UX correctness depends on consistent behavior across pointer handlers, context menus, keyboard shortcuts, toolbar buttons, and future tests.

Acceptance criteria:

- There is one discoverable policy function, module, reducer, or equivalent pattern used by changed interaction paths.
- The policy considers at least layout mode and model editability/source-lock state.
- The policy covers drag, resize, semantic create, semantic rename, semantic delete, semantic reparent, apply automatic layout, switch layout mode, reset layout, and save visual view where those actions exist.
- Blocked actions return or surface a reason that can be displayed to the user.
- Tests cover at least one allowed and one blocked decision for Manual layout, Automatic layout, and source-locked/editability state where those states exist.

Validation method: run the relevant unit tests for the action policy and any integration tests for changed UI paths.

### FR-002: Show current layout mode and editability state

Requirement: The canvas must expose the current layout mode to users and must expose read-only/source-locked state where semantic edits are not allowed.

Rationale: users cannot make correct modeling decisions if the UI hides whether geometry is manually editable, automatically computed, or source-locked.

Acceptance criteria:

- The canvas has a visible layout mode indicator or selector using user-facing labels equivalent to Manual layout and Automatic layout.
- If the model is source-locked or read-only, semantic edit controls are disabled, hidden, or clearly marked read-only according to repository UI conventions.
- The mode indicator updates when the user switches layout mode.
- The source-lock/read-only indicator updates when a source-locked model is loaded.
- Accessible labels or equivalent programmatic text expose mode and read-only state.

Validation method: run UI/component tests if available; otherwise perform manual smoke tests and update this spec with exact behavior.

### FR-003: Manual layout drag updates visual geometry without implicit semantic mutation

Requirement: In Manual layout, dragging a capability changes visual geometry only and must not change semantic parent-child relationships unless the user invokes an explicit semantic reparent action.

Rationale: spatial movement is a view action; semantic hierarchy is a model action. Conflating them makes modeling unsafe.

Acceptance criteria:

- Dragging a child within its current parent updates its visual position in the current view.
- Dragging a child across another container boundary does not silently change the child’s semantic parent.
- If the repository already implements explicit drag-to-reparent, it must use a visible semantic drop affordance and action-policy confirmation rather than boundary crossing alone.
- After drag completion, the semantic parent ID or equivalent relationship remains unchanged unless an explicit reparent action occurred.
- The drag operation is undoable if the repository has a history mechanism.

Validation method: add or update tests that inspect view geometry and semantic hierarchy before and after drag; run relevant UI/integration tests.

### FR-004: Manual layout parent drag moves the child subtree consistently

Requirement: In Manual layout, dragging a parent/container capability must move its child subtree consistently with the parent.

Rationale: containment rectangles represent a nested hierarchy. If a parent moves while children stay behind, the visual model becomes misleading and may violate containment.

Acceptance criteria:

- When a parent is dragged, all children and descendants remain visually inside the parent after the operation.
- Implementation may use relative child coordinates, nested rendering groups, or explicit descendant coordinate updates, but the rendered result must remain consistent.
- No child is visually orphaned or left at the old parent position.
- Tests cover dragging a parent with at least two children and at least one nested descendant if repository fixtures make that practical.

Validation method: run geometry tests and manual smoke tests for parent drag behavior.

### FR-005: Manual layout resize enforces minimum container bounds

Requirement: In Manual layout, resizing a parent/container must respect the minimum size required by its title/header, padding, and child bounds.

Rationale: users should not be able to make a parent too small to contain its children, because that breaks the containment model and visual readability.

Acceptance criteria:

- Resize handles or resize logic prevent a parent from becoming smaller than its computed minimum width and height.
- The minimum bounds account for children, nested descendants as needed, configured padding/gaps, and title/header area if present.
- If a resize attempt is constrained, the final rendered size is the constrained valid size.
- Children do not overflow the parent after resize unless existing product design intentionally allows scroll/clipping; if scroll/clipping exists, Codex must document it in Discoveries and adapt the acceptance test to the existing pattern.
- Tests cover a resize attempt smaller than child bounds.

Validation method: run unit tests for min-size calculation and UI tests for resize behavior if possible.

### FR-006: Automatic layout blocks direct visual geometry edits

Requirement: In Automatic layout, direct drag and resize geometry edits must be disabled or blocked unless the repository already has an explicit, tested pin/override feature.

Rationale: Automatic layout must have a clear source of truth. Allowing hidden manual geometry changes makes automatic layout unpredictable.

Acceptance criteria:

- In Automatic layout, drag handles and resize handles are disabled, hidden, or guarded by the action policy.
- Attempting a direct drag or resize in Automatic layout does not change persisted visual geometry.
- The user receives clear feedback such as “Switch to Manual layout to move or resize capabilities” using existing notification/status UI conventions.
- If explicit pinning already exists, Codex must document it and ensure actions use the pinning model, not hidden ad hoc geometry overrides.
- Tests cover at least one blocked drag or resize action in Automatic layout.

Validation method: run policy tests and UI/integration tests; manually verify blocked feedback.

### FR-007: Automatic layout recomputes geometry after semantic model changes

Requirement: In Automatic layout, allowed semantic changes must trigger layout recomputation using the existing automatic layout engine.

Rationale: Automatic layout is useful only if it responds to changes in the capability hierarchy and keeps the view readable.

Acceptance criteria:

- After an allowed create, delete, rename affecting measured text if applicable, or explicit reparent action, Automatic layout recomputes geometry.
- Recomputed geometry remains deterministic for identical input and layout settings.
- Existing sibling order is preserved if the current layout algorithm is designed to preserve order.
- Automatic layout recomputation does not create manual geometry overrides unless the repository already has an explicit hybrid feature.
- Tests cover at least one semantic change in Automatic layout and assert layout recomputation or changed layout input/output according to repository testability.

Validation method: run layout engine tests and relevant UI/state integration tests.

### FR-008: Mode switching is explicit and protects manual geometry

Requirement: Switching layout modes must be explicit and must not silently destroy manual geometry.

Rationale: users may spend time arranging a Manual view. Automatic layout should not erase that work without an intentional action.

Acceptance criteria:

- Switching from Automatic to Manual captures the current computed geometry as the initial manual geometry baseline, unless the repository already has a different documented convention.
- Switching from Manual to Automatic either preserves manual geometry separately, requires confirmation before overwriting it, or creates/uses an Automatic view according to existing repository patterns.
- Any destructive or potentially destructive mode switch displays clear confirmation or preserves prior state in undo history.
- Undo/redo restores the previous mode and geometry state if the repository has a history mechanism.
- Tests cover switching from Automatic to Manual and Manual to Automatic.

Validation method: run mode-switch tests and perform manual smoke tests for geometry preservation.

### FR-009: Source-locked models block semantic edits but permit allowed visual-only actions

Requirement: For imported/source-locked/read-only models, semantic create, rename, delete, and reparent actions must be blocked, while allowed visual-only actions remain available according to layout mode.

Rationale: imported source data must remain trustworthy. Visual presentation changes must not mutate the source model.

Acceptance criteria:

- Source-locked state is detected through existing repository mechanisms or a minimal compatibility layer.
- Semantic edit actions are disabled or blocked with clear feedback.
- Visual-only actions in Manual layout may update view geometry if the product supports visual-only binding.
- Visual-only actions in Automatic layout remain governed by Automatic layout restrictions.
- Tests cover at least one blocked semantic edit on a source-locked model and one allowed visual-only action if supported.

Validation method: run state/policy tests and manually verify source-locked UI behavior.

### FR-010: Explicit semantic reparenting preserves model validity

Requirement: If the repository supports reparenting, it must be explicit, policy-governed, and validated for model correctness.

Rationale: reparenting changes the capability hierarchy and must not happen accidentally through visual movement.

Acceptance criteria:

- Reparenting requires an explicit action such as context menu command, tree action, command palette action, or visible semantic drop target.
- Reparenting is unavailable for source-locked/read-only models.
- Reparenting rejects cycles, self-parenting, and invalid parent-child relationships.
- In Automatic layout, reparenting triggers layout recomputation.
- In Manual layout, reparenting places the child inside the new parent with valid geometry or uses the repository’s existing placement pattern.
- Tests cover valid reparent, invalid cycle/self-parent prevention, and source-locked block where reparenting exists.

Validation method: run model validation tests and integration tests for the reparent action.

### FR-011: Persist layout mode and visual geometry consistently

Requirement: The persisted view state must include enough information to restore layout mode and valid visual geometry according to existing repository conventions.

Rationale: users expect saved views to reload with the same layout mode and arrangement.

Acceptance criteria:

- Reloading a saved Manual view restores layout mode and manual geometry.
- Reloading an Automatic view restores layout mode and recomputes or restores automatic geometry according to existing layout engine conventions.
- Source-locked visual-only changes, if allowed, persist as view state rather than semantic source model changes.
- Backward compatibility is maintained for older views missing layout mode or geometry fields through safe defaults.
- Tests cover serialization/deserialization or store persistence where available.

Validation method: run persistence tests and manual reload smoke test.

### FR-012: Undo/redo covers changed actions where history exists

Requirement: Actions changed by this spec must integrate with existing undo/redo mechanisms where such mechanisms exist.

Rationale: layout changes and model edits are high-impact interactions; users need recovery from accidental actions.

Acceptance criteria:

- Manual drag can be undone and redone if existing history supports view edits.
- Manual resize can be undone and redone if existing history supports view edits.
- Layout mode switch can be undone and redone if existing history supports view settings.
- Explicit semantic reparent can be undone and redone if reparenting exists and history supports model edits.
- If no history mechanism exists, Codex must document this in Discoveries and either add minimal feasible history for changed actions or explicitly mark the limitation in Outcomes.

Validation method: run history tests or manual smoke test keyboard shortcuts according to repository conventions.

### FR-013: Geometry/model invariants are validated after canvas actions

Requirement: The implementation must validate core invariants after relevant actions during tests and, where cheap and safe, at runtime in development mode.

Rationale: containment modeling is fragile if individual handlers each implement partial geometry logic.

Acceptance criteria:

- Tests assert no self-parent cycles, no duplicate IDs in the rendered model fixture, and no child outside parent after Manual drag/resize actions.
- Automatic layout output is validated for non-negative dimensions and valid containment where applicable.
- Invalid actions do not mutate state.
- Runtime development assertions or error handling are added only if consistent with repository conventions and not noisy in production.

Validation method: run invariant tests and existing full validation suite.

### FR-014: Blocked actions produce clear, non-sensitive feedback

Requirement: When a user attempts a blocked action, the UI must provide clear feedback explaining why and what to do next.

Rationale: disabled behavior without explanation is frustrating, especially when mode-specific behavior differs.

Acceptance criteria:

- Blocked Manual/Automatic layout actions have user-facing messages or disabled-state explanations.
- Source-locked semantic edit blocks have user-facing messages or disabled-state explanations.
- Messages do not expose sensitive model content beyond what is already visible on the canvas.
- Feedback uses existing notification, tooltip, toast, status bar, or inline message patterns.
- Tests or manual smoke tests verify at least one Automatic layout blocked message and one source-locked blocked message where source-lock exists.

Validation method: run UI tests if available and manual smoke tests.

### FR-015: Accessibility behavior is maintained or improved

Requirement: Layout mode controls, action availability, and blocked-action feedback must be accessible to keyboard and assistive technology users.

Rationale: canvas UX must not rely solely on pointer affordances.

Acceptance criteria:

- Layout mode selector or indicator has an accessible name.
- Disabled controls are programmatically disabled or include accessible explanatory text according to existing component conventions.
- Feedback for blocked actions is exposed through existing accessible notification/status patterns where available.
- Keyboard shortcuts for undo/redo continue to work if they existed before.
- No new keyboard trap is introduced in the canvas.

Validation method: run accessibility tests if available; otherwise perform keyboard-only manual smoke test.

### FR-016: Tests and validation are added before final completion

Requirement: Codex must add or update tests for the behavior changed by this spec and run validation commands.

Rationale: layout-mode behavior is easy to regress; tests are required to make the behavior agent-safe and maintainable.

Acceptance criteria:

- Tests cover action policy decisions.
- Tests cover Manual drag and resize invariants where test infrastructure allows.
- Tests cover Automatic drag/resize blocking.
- Tests cover source-locked semantic edit blocking if source-lock exists.
- Tests cover mode switching and persistence if those mechanisms exist.
- Codex records commands run and results in Outcomes and Retrospective.

Validation method: run discovered unit, integration, typecheck, lint, and build commands as appropriate.

## 10. Non-Functional Requirements

### 10.1 Security, Privacy, and Compliance Requirements

Data classification assumptions:

- Capability names, hierarchy, imported model provenance, and view metadata may contain internal enterprise architecture information.
- The feature should not require personal data, customer banking data, payment data, authentication secrets, or regulated transaction data.
- If the repository stores real organization names or capability details, treat them as confidential application data.

Authorization checks:

- Do not change existing authentication or authorization behavior.
- Do not allow canvas UI changes to bypass existing edit permissions.
- If existing permission checks distinguish model edit, view edit, and read-only access, respect those distinctions.
- Source-locked/read-only state must block semantic edits even if UI controls are reachable through keyboard shortcuts or direct handler calls.

Input validation:

- Validate geometry values before persistence: finite numbers, non-negative width/height, and containment constraints where applicable.
- Validate semantic operations: no duplicate IDs introduced, no self-parenting, no cycles, no invalid parent references.
- Validate layout mode values against known allowed modes.

Logging restrictions:

- Do not log full capability names, hierarchy payloads, imported model contents, user-entered descriptions, or raw view payloads unless existing logging policy already permits it.
- Do not log authentication tokens, cookies, API keys, tenant IDs beyond existing safe patterns, or personal data.
- Blocked-action logs, if added, should use action type, mode, and generic reason codes, not model content.

Audit requirements:

- If the repository already has audit logging for semantic model changes, ensure explicit semantic edits continue to emit the existing audit events.
- Visual-only view changes should not be recorded as semantic model changes.
- Do not introduce a new audit system in this task.

PII handling:

- Do not add features that collect or display PII.
- Do not include user identity in client-side logs beyond existing patterns.

Failure behavior:

- If an action is rejected by policy, state must remain unchanged.
- If automatic layout fails, the canvas must keep the last valid geometry and show an error through existing UI patterns.
- If persistence fails, do not mark the view as saved.

Backward compatibility requirements:

- Existing saved views without explicit layout mode should load using a safe default discovered from existing behavior.
- Existing source-unlocked editable models should retain existing semantic edit behavior unless this spec explicitly guards an unsafe action.
- Existing read-only/source-locked behavior must not become more permissive.

What must not be logged:

- Raw model payloads.
- Capability descriptions or sensitive names.
- Authentication or authorization tokens.
- User personal data.
- Full imported release payloads.
- Raw error objects containing request headers or credentials.

### 10.2 Reliability Requirements

- Invalid canvas actions must fail closed: no state mutation when action policy blocks an action.
- Geometry calculations must produce finite numeric values.
- Automatic layout failures must not corrupt persisted manual geometry.
- Persistence changes must preserve backward compatibility with existing saved views.

### 10.3 Performance Requirements

- Manual drag should remain responsive for representative existing models.
- Action policy checks should be constant-time or proportional only to required model validation.
- Expensive subtree bound calculations should be memoized or scoped to affected subtrees if the repository already handles large models.
- Automatic layout should not be triggered on every pointer move; it should run after semantic changes or explicit layout commands.

### 10.4 Accessibility Requirements

- Layout mode and read-only/source-locked state must be discoverable without using a mouse.
- New controls must follow existing accessible component conventions.
- Blocked-action feedback should be available to assistive technology through existing notification/status patterns.

### 10.5 Maintainability Requirements

- Action-mode rules must not be duplicated across multiple event handlers.
- Geometry invariant logic should be testable independently from the rendering layer where practical.
- Implementation must follow repository naming, state management, and test patterns discovered during Milestone 1.
- Avoid broad refactors unless required to remove duplicated unsafe behavior in changed paths.

### 10.6 Backward Compatibility Requirements

- Existing saved models and views must load.
- Existing manual layouts must not be silently changed during migration or first load.
- Existing automatic layout output should remain unchanged except where necessary to enforce correctness or deterministic behavior.
- Existing public APIs must not change unless Codex discovers the feature already has an internal API contract that must include layout mode.

## 11. Architecture and Design

Recommended conceptual design:

### Components involved

- Canvas renderer: displays capability rectangles and handles selection, drag, resize, and visual feedback.
- Layout mode control: displays and changes Manual or Automatic layout mode.
- Action policy: determines whether an action is allowed, blocked, or requires confirmation.
- Semantic model store: stores capability identity, hierarchy, source/editability state, and metadata.
- Visual view store: stores layout mode, geometry overrides, viewport, and view-specific settings.
- Automatic layout engine: computes contained-rectangle geometry from semantic model and layout settings.
- History/undo-redo mechanism: records accepted model and view changes if present.
- Persistence layer: saves and loads model state and visual view state.
- Notification/status system: communicates blocked actions and confirmation results.

### Data flow

- User initiates an action through pointer, keyboard, toolbar, context menu, or command.
- The action is normalized to a typed canvas action request.
- The action policy receives current layout mode, source/editability state, selection, and action type.
- If blocked, the UI shows the policy reason and state is not mutated.
- If confirmation is required, the UI asks for confirmation using existing patterns.
- If allowed, the action updates either semantic model state, visual view state, or both according to the action contract.
- If the action changes semantic model state in Automatic layout, automatic layout recomputes geometry.
- If the action changes visual view state in Manual layout, geometry invariants are enforced before committing.
- Accepted changes are recorded in history where supported.
- Persisted state is updated according to existing save behavior.

### Control flow by layout mode

| Canvas action | Manual layout behavior | Automatic layout behavior |
| --- | --- | --- |
| Select capability | Allowed. No state mutation except selection. | Allowed. No state mutation except selection. |
| Pan/zoom | Allowed as viewport/view state. | Allowed as viewport/view state. |
| Drag child | Allowed as visual geometry edit within constraints. Does not implicitly reparent. | Blocked unless explicit pin/override feature exists. Offer switch to Manual. |
| Drag parent/container | Allowed. Child subtree remains visually contained and moves consistently. | Blocked unless explicit pin/override feature exists. Offer switch to Manual. |
| Resize leaf | Allowed only if leaf resizing exists and geometry remains valid. | Blocked unless explicit pin/override feature exists. |
| Resize parent/container | Allowed but constrained by title, padding, and child bounds. | Blocked unless explicit pin/override feature exists. |
| Create capability | If semantic editing is allowed, create model element and assign valid initial manual geometry. If source-locked, block. | If semantic editing is allowed, create model element and recompute layout. If source-locked, block. |
| Rename capability | If semantic editing is allowed, update model. If source-locked, block. | Same. Recompute layout if text measurement affects geometry. |
| Delete capability | If semantic editing is allowed, update model and remove associated view geometry. If source-locked, block. | Same, then recompute layout. |
| Reparent capability | Explicit semantic action only. Validate, then place child inside new parent with valid manual geometry. | Explicit semantic action only. Validate, then recompute layout. |
| Apply automatic layout | Allowed as explicit command; must protect or confirm loss of manual geometry. | Allowed; recompute current automatic geometry. |
| Switch to Manual | Capture current geometry as manual baseline. | Capture current automatic geometry as manual baseline. |
| Switch to Automatic | Preserve manual geometry separately or require confirmation before overwrite. | No-op or recompute depending on UI command. |
| Reset layout | Reset visual view according to current mode and existing product rules. | Recompute automatic layout. |
| Save view | Persist mode and allowed view state. | Persist mode and layout settings; avoid hidden manual overrides. |

### State management

Codex should map this conceptual state to repository conventions. If type definitions do not already exist, introduce the smallest set needed.

Conceptual types:

```ts
type LayoutMode = 'manual' | 'automatic';
type ModelEditability = 'editable' | 'sourceLocked' | 'readOnly';

type CanvasActionType =
  | 'select'
  | 'panZoom'
  | 'drag'
  | 'resize'
  | 'createCapability'
  | 'renameCapability'
  | 'deleteCapability'
  | 'reparentCapability'
  | 'applyAutomaticLayout'
  | 'switchLayoutMode'
  | 'resetLayout'
  | 'saveView';

interface CanvasActionPolicyDecision {
  status: 'allowed' | 'blocked' | 'requiresConfirmation';
  reasonCode?: string;
  message?: string;
  suggestedAction?: 'switchToManual' | 'unlockSource' | 'useExplicitReparent' | 'confirmOverwrite';
}

interface CapabilityGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CapabilityVisualView {
  layoutMode: LayoutMode;
  viewport?: { x: number; y: number; zoom: number };
  geometryByCapabilityId?: Record<string, CapabilityGeometry>;
  layoutAlgorithmId?: string;
  layoutSettings?: Record<string, unknown>;
}
```

The exact type names, values, and locations must follow repository conventions discovered by Codex.

### API boundaries

- Client-side event handlers must not directly mutate model or view state without passing through the action policy or equivalent centralized guard.
- Persistence code must distinguish semantic model payloads from visual view payloads.
- Automatic layout engine should receive semantic model input and layout settings, not arbitrary UI state unless already required.
- Semantic edit handlers must call existing validation and authorization mechanisms.

### Integration points

- Existing canvas interaction handlers.
- Existing layout mode selector or layout toolbar.
- Existing automatic layout command.
- Existing model editing commands.
- Existing view persistence/save/load mechanisms.
- Existing undo/redo/history mechanisms.
- Existing notification/toast/status UI.
- Existing tests and fixtures.

### Error handling

- Blocked action: show user-facing reason, no state mutation.
- Invalid geometry: clamp to valid bounds or reject action; do not persist invalid geometry.
- Automatic layout failure: keep last valid geometry, show error, do not overwrite saved view.
- Persistence failure: preserve dirty state and show existing save error pattern.
- Semantic validation failure: reject action, show reason if available, no partial mutation.

### Validation strategy

- Use unit tests for action policy and geometry calculations.
- Use state/reducer tests for semantic versus visual state changes.
- Use component/integration tests for disabled controls and blocked feedback if test infrastructure exists.
- Use manual smoke tests for pointer interactions that are hard to simulate.
- Run full build, typecheck, lint, and tests discovered in the repository.

### Dependency choices

- Prefer existing dependencies.
- Do not add a new layout or canvas library.
- Do not add a new notification library.
- Do not add a state management library.
- If a tiny utility dependency appears necessary, Codex must justify it in the Decision Log; default is no new dependency.

### Alternatives considered

Alternative: allow drag in Automatic layout and store hidden geometry overrides.

Why rejected: it blurs the source of truth and makes Automatic layout unpredictable.

Alternative: make drag across a container boundary reparent automatically.

Why rejected: it silently mutates semantic model hierarchy and is risky for enterprise architecture modeling.

Alternative: replace the current canvas with a node-edge diagramming framework.

Why rejected: Capability Canvas is a containment-based rectangular model, not primarily a node-edge graph editor, and framework replacement is out of scope.

Alternative: use flexbox/Yoga-style layout for the capability model.

Why rejected: prior context indicates capability containment maps need semantic grouping and nested rectangle packing rather than generic UI flex layout.

Alternative: ignore source-lock state because this task is about UX.

Why rejected: source-lock behavior is central to correctness; visual edits must not mutate imported source data.

## 12. Interfaces and Contracts

Exact names are unknown. Codex must confirm actual names in the repository before implementation.

### 12.1 Canvas action policy contract

Conceptual function signature:

```ts
function evaluateCanvasActionPolicy(input: {
  actionType: CanvasActionType;
  layoutMode: LayoutMode;
  modelEditability: ModelEditability;
  selection?: unknown;
  targetCapabilityId?: string;
  requestedNextLayoutMode?: LayoutMode;
  hasManualGeometry?: boolean;
  supportsAutomaticPins?: boolean;
}): CanvasActionPolicyDecision;
```

Required behavior:

- Semantic actions are blocked when `modelEditability` is `sourceLocked` or `readOnly`.
- Direct geometry edits are allowed in Manual layout when geometry constraints pass.
- Direct geometry edits are blocked in Automatic layout unless explicit pinning exists.
- Mode switches that may discard manual geometry require confirmation or preservation.
- Every blocked decision includes a reason code and a user-facing message or message key.

### 12.2 Layout mode contract

Conceptual values:

```ts
type LayoutMode = 'manual' | 'automatic';
```

Repository-specific values may differ. Codex must preserve existing values where present.

Rules:

- Manual layout means direct visual geometry edits are allowed under constraints.
- Automatic layout means geometry is computed by layout engine.
- Switching modes must be explicit and history-aware if history exists.

### 12.3 Visual view persistence contract

Conceptual persisted view fields:

```ts
interface PersistedCanvasView {
  layoutMode?: LayoutMode;
  geometryByCapabilityId?: Record<string, CapabilityGeometry>;
  viewport?: { x: number; y: number; zoom: number };
  layoutAlgorithmId?: string;
  layoutSettings?: Record<string, unknown>;
}
```

Rules:

- Missing `layoutMode` must be handled with a backward-compatible default.
- Manual geometry should be stored as view state, not semantic model state.
- Automatic layout should store mode and settings; it should not persist hidden manual overrides unless the repository already has explicit pins/overrides.

### 12.4 Semantic model contract

Conceptual fields:

```ts
interface CapabilityModelNode {
  id: string;
  parentId?: string | null;
  name: string;
  children?: string[];
  sourceLocked?: boolean;
  readOnly?: boolean;
}
```

Rules:

- IDs must remain stable.
- Parent-child relationships must not form cycles.
- Visual drag must not change `parentId` or equivalent hierarchy fields.
- Explicit reparent must validate the hierarchy.
- Source-locked/read-only nodes or models must reject semantic changes.

### 12.5 Geometry contract

Conceptual rules:

- `x`, `y`, `width`, and `height` must be finite numbers.
- `width` and `height` must be positive or meet the repository’s minimum shape dimensions.
- Child bounds must fit inside parent bounds in Manual layout after drag/resize.
- Parent minimum size must include title/header, padding, and child bounds.
- Coordinate system may be absolute, parent-relative, or transform-based; Codex must follow existing rendering conventions.

### 12.6 Events and commands

Codex should map existing commands to these conceptual action types:

- `selectCapability`
- `dragCapability`
- `resizeCapability`
- `createCapability`
- `renameCapability`
- `deleteCapability`
- `reparentCapability`
- `applyAutomaticLayout`
- `switchLayoutMode`
- `resetLayout`
- `saveView`

Do not add public APIs unless current architecture requires it.

### 12.7 Error contracts

Suggested reason codes:

- `automatic_layout_geometry_locked`
- `source_locked_semantic_edit_blocked`
- `read_only_model_semantic_edit_blocked`
- `manual_resize_min_bounds`
- `implicit_reparent_blocked`
- `manual_geometry_overwrite_requires_confirmation`
- `invalid_reparent_cycle`
- `layout_engine_failed`

Repository naming may differ; use existing error/message conventions.

### 12.8 Database changes and migrations

Database changes are not assumed. If persistence currently requires schema changes to store layout mode or geometry, Codex must:

- Prefer backward-compatible optional fields.
- Add migrations only if the repository’s persistence layer requires them.
- Keep existing records readable.
- Document migration commands and rollback considerations.

### 12.9 Feature flags

A feature flag is not required by default. If repository conventions require flags for UI behavior changes, Codex may add one using existing feature flag mechanisms and must document it in the Decision Log.

## 13. Detailed Implementation Plan

### Milestone 1: Repository Discovery and Plan Confirmation

Goal: understand the repository and update this spec with actual implementation details before coding.

Files or areas to inspect:

- Repository root.
- `AGENTS.md`, if present.
- README files.
- Package/build/test/lint/typecheck configuration.
- Canvas feature folders.
- Layout engine folders.
- Model/view state definitions.
- Persistence/save/load code.
- Import/source-lock/read-only code.
- Undo/redo/history code.
- Existing tests and fixtures.
- CI workflows.

Files or areas likely to change:

- Unknown until discovery.

Concrete implementation steps:

1. Read repository instructions and relevant documentation.
2. Identify the canvas implementation and current interaction handlers.
3. Identify how layout mode is represented or inferred.
4. Identify semantic model state and visual view state.
5. Identify source-lock/read-only/editability mechanisms.
6. Identify existing validation, history, notification, and persistence patterns.
7. Identify validation commands.
8. Update Section 8 with actual findings.
9. Confirm or revise the milestone plan in this spec before coding.

Validation commands:

- Discover and record commands. Do not assume command names.
- Run a quick existing test or build command if repository setup allows.

Expected result:

- Repository Discovery section is updated with actual stack, directories, commands, likely files, and conflicts.
- Implementation plan is confirmed or revised.

Acceptance criteria covered:

- FR-016 partially, by discovering validation paths.

Rollback or recovery notes:

- No code changes should be necessary in this milestone except updates to this spec.
- If discovery reveals this spec conflicts with repository architecture, update the plan rather than forcing the conceptual design.

### Milestone 2: Canvas Action Policy and UX State Signals

Goal: create or centralize layout-mode and editability-aware action decisions, and expose mode/read-only state in the UI.

Files or areas to inspect:

- Canvas event handlers.
- Toolbar/context menu/keyboard command code.
- Existing permission/read-only helpers.
- Existing notification/toast/status components.
- Existing tests for UI state or reducers.

Files or areas likely to change:

- Action policy helper/module or equivalent.
- Canvas interaction handlers.
- Layout toolbar or mode selector.
- Source-lock/read-only UI controls.
- Tests.

Concrete implementation steps:

1. Define or locate the canonical action types.
2. Implement or centralize policy logic for Manual layout, Automatic layout, and source-locked/read-only state.
3. Refactor changed interaction paths to use the policy before mutating state.
4. Add user-facing messages for blocked actions using existing message patterns.
5. Add or update layout mode and read-only/source-lock indicators.
6. Add policy unit tests and targeted UI/state tests.

Validation commands:

- Run discovered unit test command for policy/state tests.
- Run lint/typecheck if files changed require it.

Expected result:

- Changed canvas actions are policy-governed.
- Users can see layout mode and read-only/source-lock state.

Acceptance criteria covered:

- FR-001.
- FR-002.
- FR-006 partially.
- FR-009 partially.
- FR-014 partially.
- FR-015 partially.

Rollback or recovery notes:

- If UI refactor becomes too broad, keep the policy additive and wire it into only the high-risk actions first: drag, resize, semantic edit, mode switch.
- Do not delete existing permission checks; layer policy with them.

### Milestone 3: Manual Layout Geometry Correctness

Goal: make Manual layout direct manipulation safe and intuitive.

Files or areas to inspect:

- Drag handlers.
- Resize handlers.
- Geometry utilities.
- Canvas coordinate transforms.
- Layout constants for padding, gaps, title/header height, and minimum dimensions.
- Tests for geometry/layout.

Files or areas likely to change:

- Geometry utility functions.
- Drag/resize handlers.
- Manual layout state updates.
- Tests and fixtures.

Concrete implementation steps:

1. Determine whether coordinates are absolute, parent-relative, or transform-based.
2. Implement or update geometry helpers for child bounds, parent minimum size, and containment validation.
3. Ensure child drag updates visual geometry without semantic mutation.
4. Ensure parent drag moves descendants consistently or uses nested rendering transforms that preserve containment.
5. Ensure parent resize clamps to computed minimum bounds.
6. Ensure invalid geometry is not persisted.
7. Add tests for child drag, parent drag, parent resize, and invalid geometry rejection.

Validation commands:

- Run geometry/layout unit tests.
- Run relevant component/integration tests if available.
- Run typecheck if applicable.

Expected result:

- Manual layout direct manipulation preserves containment and visual correctness.

Acceptance criteria covered:

- FR-003.
- FR-004.
- FR-005.
- FR-013 partially.
- FR-016 partially.

Rollback or recovery notes:

- If descendant coordinate updates are risky, prefer rendering children relative to parents if repository architecture supports it.
- If parent-relative conversion is too invasive, implement a constrained absolute-coordinate update for the affected subtree and document the limitation.

### Milestone 4: Automatic Layout Guardrails and Mode Switching

Goal: ensure Automatic layout is geometry-owned by the layout engine and mode switching is safe.

Files or areas to inspect:

- Automatic layout command.
- Layout mode selector.
- Layout engine invocation.
- Persistence of layout settings and geometry.
- Confirmation dialogs.
- History integration.

Files or areas likely to change:

- Mode switch handler.
- Automatic layout command handler.
- Drag/resize affordance rendering.
- View persistence.
- Tests.

Concrete implementation steps:

1. Disable or guard direct drag/resize in Automatic layout.
2. Add user-facing blocked feedback suggesting switch to Manual layout.
3. Ensure Automatic layout recomputes after allowed semantic changes.
4. Implement safe switch from Automatic to Manual by capturing current geometry as manual baseline.
5. Implement safe switch from Manual to Automatic using preservation or confirmation according to repository conventions.
6. Ensure mode switching uses history/undo-redo if available.
7. Add tests for blocked automatic geometry edit, automatic recompute, and mode switch behavior.

Validation commands:

- Run layout and canvas tests.
- Run UI/integration tests for mode switching if available.
- Run typecheck/lint as applicable.

Expected result:

- Automatic layout behavior is deterministic and distinct from Manual layout.
- Mode switching does not silently destroy manual geometry.

Acceptance criteria covered:

- FR-006.
- FR-007.
- FR-008.
- FR-011 partially.
- FR-012 partially.
- FR-014 partially.

Rollback or recovery notes:

- If confirmation dialogs are not available, use existing modal/status pattern; do not introduce a new dialog framework.
- If manual geometry cannot be preserved separately, require explicit confirmation and history capture before overwriting.

### Milestone 5: Source-Locked Semantics, Persistence, and Undo/Redo Integration

Goal: protect imported/source-locked model semantics and ensure changed actions persist and recover correctly.

Files or areas to inspect:

- Import/release/read-only code.
- Semantic edit handlers.
- Model persistence.
- View persistence.
- Undo/redo/history implementation.
- Tests for imported/read-only models.

Files or areas likely to change:

- Semantic edit guards.
- View/model persistence separation.
- History integration.
- Tests.

Concrete implementation steps:

1. Wire source-lock/read-only state into the action policy and all changed semantic handlers.
2. Ensure source-locked semantic edits are blocked from pointer, keyboard, toolbar, and direct handler paths touched by this spec.
3. Ensure allowed visual-only actions persist as view state, not source model state.
4. Ensure Manual and Automatic view state load and save safely with backward-compatible defaults.
5. Integrate changed actions with undo/redo if existing history exists.
6. Add tests for source-locked blocks, visual-only persistence, and history where feasible.

Validation commands:

- Run model/view persistence tests.
- Run history tests if available.
- Run relevant unit/integration tests.

Expected result:

- Source-locked model semantics are protected.
- Layout mode and visual state persist consistently.
- Changed actions are recoverable through existing history where supported.

Acceptance criteria covered:

- FR-009.
- FR-010 if reparenting exists.
- FR-011.
- FR-012.
- FR-013 partially.
- FR-016 partially.

Rollback or recovery notes:

- If persistence requires migration, prefer optional fields and backward-compatible defaults.
- If history integration becomes too broad, integrate only changed actions and document remaining gaps.

### Milestone 6: Final Validation, Accessibility, and Diff Review

Goal: complete tests, run full validation, perform manual smoke tests, and update this spec with outcomes.

Files or areas to inspect:

- Test results.
- Accessibility-sensitive controls.
- Final diff.
- This spec.

Files or areas likely to change:

- Tests.
- Minor accessibility fixes.
- This spec.

Concrete implementation steps:

1. Add any missing tests for acceptance criteria.
2. Perform keyboard-only checks for layout mode and blocked feedback.
3. Run full validation suite discovered in Milestone 1.
4. Run manual smoke test script in Section 15.
5. Review final diff for unintended file changes.
6. Update Progress, Discoveries, Decision Log, and Outcomes and Retrospective.
7. Prepare final Codex response.

Validation commands:

- Full discovered build command.
- Full discovered test command.
- Full discovered lint command if present.
- Full discovered typecheck command if present.
- Any relevant e2e command if present and practical.

Expected result:

- All in-scope acceptance criteria pass.
- Final diff is scoped to this spec.
- Spec is updated as the living execution record.

Acceptance criteria covered:

- FR-014.
- FR-015.
- FR-016.
- All final acceptance conditions.

Rollback or recovery notes:

- If a validation command fails due to unrelated pre-existing issues, document exact failure and evidence; still fix failures caused by this implementation.
- Do not mask failing tests by weakening assertions unless the assertion is demonstrably wrong and the change is documented.

## 14. Testing and Validation Plan

Codex must discover actual test locations and commands during Milestone 1 and update this section before coding.

### Unit tests

What to test: action policy decisions for Manual layout, Automatic layout, editable model, source-locked/read-only model, blocked geometry edit, blocked semantic edit, and mode switch requiring confirmation.

Where to add or update the test, if known: unknown; use existing policy/reducer/util test patterns discovered in the repository.

Command to run, if known: unknown; Codex must discover and record it.

Expected result: policy returns allowed, blocked, or requires-confirmation decisions with reason codes and messages according to FR-001.

Functional or non-functional requirement covered: FR-001, FR-006, FR-008, FR-009, FR-014.

What to test: geometry helpers for child bounds, parent minimum size, finite geometry, and containment after drag/resize.

Where to add or update the test, if known: unknown; use existing layout/geometry utility test patterns.

Command to run, if known: unknown; Codex must discover and record it.

Expected result: invalid parent resize is clamped or rejected; children remain within parent; no non-finite values are produced.

Functional or non-functional requirement covered: FR-003, FR-004, FR-005, FR-013, NFR reliability.

What to test: semantic model validation for reparenting if reparenting exists.

Where to add or update the test, if known: unknown.

Command to run, if known: unknown; Codex must discover and record it.

Expected result: valid reparent succeeds; self-parenting and cycles fail; source-locked reparent fails.

Functional or non-functional requirement covered: FR-010, FR-013, security/compliance edit restrictions.

### Integration tests

What to test: Manual layout drag updates view geometry but does not mutate semantic parent ID.

Where to add or update the test, if known: unknown; use existing canvas component or state integration tests.

Command to run, if known: unknown.

Expected result: geometry changes; semantic relationship remains unchanged.

Functional or non-functional requirement covered: FR-003.

What to test: Automatic layout drag/resize attempt is blocked and state remains unchanged.

Where to add or update the test, if known: unknown.

Command to run, if known: unknown.

Expected result: no geometry mutation; blocked feedback appears or policy reason is returned.

Functional or non-functional requirement covered: FR-006, FR-014.

What to test: mode switching from Automatic to Manual and Manual to Automatic.

Where to add or update the test, if known: unknown.

Command to run, if known: unknown.

Expected result: Automatic to Manual captures baseline geometry; Manual to Automatic preserves or confirms manual geometry handling.

Functional or non-functional requirement covered: FR-008, FR-011, FR-012.

What to test: source-locked model blocks semantic edits but permits allowed visual-only changes.

Where to add or update the test, if known: unknown.

Command to run, if known: unknown.

Expected result: semantic edit blocked; allowed view edit persists as view state only.

Functional or non-functional requirement covered: FR-009, security/compliance edit restrictions.

### End-to-end tests

What to test: representative canvas workflow across Automatic layout, Manual layout, blocked semantic edit, and save/reload.

Where to add or update the test, if known: unknown; only add if existing e2e infrastructure exists and the test is not brittle.

Command to run, if known: unknown.

Expected result: user-visible behavior matches manual smoke script.

Functional or non-functional requirement covered: FR-002 through FR-012.

### Manual smoke tests

What to test: user-facing canvas behavior that is hard to simulate reliably.

Where to add or update the test, if known: Section 15 of this spec and repository docs if a manual testing folder exists.

Command to run, if known: application start command unknown; Codex must discover and record it.

Expected result: all steps in Section 15 pass.

Functional or non-functional requirement covered: all core UX requirements.

### Regression tests

What to test: existing model load, existing view load, automatic layout output, manual layout output, source-locked/imported models, and undo/redo shortcuts.

Where to add or update the test, if known: unknown.

Command to run, if known: unknown.

Expected result: existing behavior remains intact except where this spec deliberately changes unsafe behavior.

Functional or non-functional requirement covered: backward compatibility, reliability, FR-011, FR-012.

### Security tests

What to test: semantic edit block for source-locked/read-only models through UI and direct handler paths touched by this spec.

Where to add or update the test, if known: unknown.

Command to run, if known: unknown.

Expected result: blocked semantic actions do not mutate model state.

Functional or non-functional requirement covered: Security, privacy, and compliance requirements; FR-009; FR-010.

### Accessibility tests

What to test: keyboard access to layout mode controls, disabled state semantics, blocked action feedback, and absence of keyboard traps.

Where to add or update the test, if known: unknown; use existing accessibility test patterns if present.

Command to run, if known: unknown.

Expected result: controls are reachable and state is programmatically exposed.

Functional or non-functional requirement covered: FR-015.

### Performance checks

What to test: drag responsiveness and automatic layout invocation frequency.

Where to add or update the test, if known: unknown; use existing profiling/performance practices if present.

Command to run, if known: unknown.

Expected result: manual drag does not trigger automatic layout on every pointer move; action policy adds no visible latency.

Functional or non-functional requirement covered: performance requirements.

## 15. Manual Smoke Test Script

Preconditions:

- Application can be started locally using commands discovered by Codex.
- A sample capability model is available with at least one root container, two child containers, and at least two leaf capabilities under one container.
- If source-locked/imported model behavior exists, at least one source-locked sample model or fixture is available.
- User has permissions equivalent to view and edit where needed for editable model tests.

Test data:

- Editable sample model: root capability `Enterprise`, child containers `Customer`, `Operations`, and leaves such as `Customer Onboarding`, `Customer Support`, `Fulfillment`, and `Case Handling`.
- Source-locked sample model: any imported/released model fixture available in the repository. Do not create real bank/customer data for testing.

Steps and expected results:

1. Start the application and open the editable sample model.

Expected result: the canvas loads without console/runtime errors and displays the current layout mode.

2. Switch to Automatic layout if it is not already active.

Expected result: capabilities are arranged by the automatic layout engine; layout mode indicator displays Automatic layout or repository-equivalent label.

3. Attempt to drag a leaf capability in Automatic layout.

Expected result: the capability does not move persistently; the UI shows disabled behavior or a clear message explaining that Manual layout is required for direct movement.

4. Attempt to resize a parent capability in Automatic layout.

Expected result: the parent does not resize persistently; the UI shows disabled behavior or a clear message explaining that Manual layout is required for direct resizing.

5. Perform an allowed semantic edit in Automatic layout if semantic editing is supported, such as creating or renaming a capability.

Expected result: the semantic edit succeeds only if the model is editable; automatic layout recomputes; no manual geometry override is created.

6. Switch from Automatic layout to Manual layout.

Expected result: current geometry is captured as the manual baseline; layout mode indicator displays Manual layout.

7. Drag a leaf capability within its parent.

Expected result: the leaf moves visually inside the same parent; semantic parent relationship does not change.

8. Drag a leaf capability across another parent boundary without using an explicit reparent command.

Expected result: semantic parent relationship does not silently change; if the UI prevents crossing, the element is constrained or a blocked message appears.

9. Drag a parent/container capability.

Expected result: its child subtree moves with it or remains correctly rendered inside it; no child is left at the old location.

10. Try to resize a parent/container smaller than its child contents.

Expected result: resize is clamped or blocked at the computed minimum size; children remain visible and contained.

11. Use explicit reparent action if the repository supports it.

Expected result: valid reparent succeeds in editable model; invalid cycle/self-parent reparent is rejected; layout updates according to current mode.

12. Use undo and redo for drag, resize, mode switch, and reparent where those actions exist.

Expected result: undo restores previous state; redo reapplies the action; no partial or inconsistent state appears.

13. Save the Manual view, reload the page or reopen the model, and inspect geometry.

Expected result: Manual layout mode and geometry are restored.

14. Switch from Manual layout to Automatic layout.

Expected result: manual geometry is preserved separately or a confirmation is shown before overwrite; automatic geometry appears only after explicit confirmation or safe preservation.

15. Open the source-locked/imported sample model if available.

Expected result: source-locked/read-only state is visible or semantic edit controls are disabled.

16. Attempt to rename, create, delete, or reparent a capability in the source-locked model.

Expected result: semantic edit is blocked with a clear reason; source model data is unchanged.

17. In source-locked Manual layout, perform an allowed visual-only movement if product behavior supports it.

Expected result: visual view state changes and can be saved/reloaded; source model semantics remain unchanged.

18. Navigate layout mode controls and primary actions with keyboard only.

Expected result: controls are reachable; disabled state or blocked feedback is understandable; no keyboard trap occurs.

Cleanup steps:

- Revert test model/view changes if using persistent local data.
- Remove any temporary fixtures created for manual testing unless they are committed as intentional test fixtures.
- Clear local storage or test database entries only if repository docs say this is safe.

## 16. Migration, Rollout, and Backward Compatibility

Migration is not assumed to be required. The preferred implementation uses existing view/model persistence structures and adds optional, backward-compatible fields only if necessary.

Database migration requirements:

- No database migration by default.
- If the repository persists view state in a database and lacks layout mode or geometry fields, Codex may add optional fields through the repository’s migration mechanism.
- Any migration must preserve existing records and allow missing fields to load with safe defaults.

Data migration requirements:

- Existing saved views without layout mode must load using the repository’s current default behavior.
- Existing manual geometry must not be overwritten during migration or first load.
- Existing automatic layout views must remain valid.

Feature flag strategy:

- No feature flag is required by default.
- If the repository uses feature flags for UX changes, Codex may add a flag using existing conventions and must document it.

Safe rollout approach:

- Implement action policy and tests first.
- Apply policy to high-risk actions before expanding to lower-risk actions.
- Preserve existing semantic edit permission checks.
- Keep changes additive and localized.

Backward compatibility constraints:

- Older view payloads must load.
- Existing import/source-lock behavior must not become more permissive.
- Existing canvas rendering should remain visually stable except for corrected invalid states and blocked unsafe actions.
- Existing test fixtures should require minimal changes.

Rollback plan:

- Revert changed action policy, interaction handlers, and persistence changes together.
- If a migration is added, include repository-standard down/rollback guidance if supported.
- If optional fields are added, old code should ignore them where possible.

How to verify old behavior still works:

- Load existing editable model fixtures.
- Load existing saved Manual view fixtures if available.
- Load existing Automatic view fixtures if available.
- Load existing imported/source-locked fixtures if available.
- Run existing full test suite before and after changes if practical.

## 17. Idempotence and Recovery

Steps safe to repeat:

- Running tests, typecheck, lint, and build commands.
- Running geometry/action policy unit tests.
- Running manual smoke tests against disposable local fixtures.
- Updating this spec with progress notes.
- Re-running automatic layout on the same semantic model and settings, assuming the layout engine is deterministic.

Steps that are destructive or risky:

- Applying database migrations.
- Overwriting existing saved manual geometry.
- Modifying source model payloads during source-locked tests.
- Deleting capabilities from persistent test data.
- Rewriting canvas architecture or changing global state management.

How to recover from partial implementation:

- Revert changed files from the current milestone if validation fails and the failure source is unclear.
- Keep action policy tests isolated so they can be validated before UI integration.
- If persistence changes fail, disable new persistence writes and keep UI changes guarded until persistence is fixed.
- If automatic layout integration fails, keep Automatic layout drag/resize blocks but roll back recomputation changes until fixed.

How to clean up temporary files, generated files, or test data:

- Remove temporary fixtures not committed as part of tests.
- Remove generated coverage/build artifacts unless repository convention keeps them.
- Reset local test database or local storage only according to repository instructions.
- Do not delete user data or real imported models.

What to do if validation fails:

- Identify whether the failure is caused by this implementation or pre-existing.
- Fix implementation-caused failures before proceeding.
- Document pre-existing unrelated failures with exact command, failure summary, and evidence.
- Do not weaken tests to make failures disappear.

What not to retry blindly:

- Do not repeatedly run destructive migrations without understanding rollback state.
- Do not repeatedly overwrite persisted manual geometry while debugging.
- Do not bypass action policy to make UI tests pass.
- Do not disable source-lock checks to simplify semantic edit tests.

## 18. Observability and Operations

This feature is primarily client-side UX and model correctness. Operational observability is relevant only where the repository already captures client errors, action telemetry, audit events, or debug logs.

Logs:

- If adding logs, use existing logging conventions.
- Prefer generic reason codes over model content.
- Log blocked action type, layout mode, and reason code only if this aligns with existing telemetry.
- Do not log full capability names, descriptions, hierarchy payloads, imported model payloads, raw errors with headers, authentication data, or PII.

Metrics:

- No new metrics are required.
- If existing product analytics track canvas actions, ensure blocked actions are not misclassified as successful semantic edits.

Traces:

- No distributed tracing changes are required.

Alerts:

- No new alerts are required.

Dashboards:

- No dashboard changes are required.

Audit records:

- Existing semantic model audit events must continue to fire for accepted semantic edits.
- Visual-only layout changes must not be recorded as semantic model changes.
- Do not introduce a new audit subsystem.

Error messages:

- Blocked action messages should be concise and actionable.
- Automatic layout failure should communicate that the last valid layout is preserved.
- Source-locked semantic edit messages should explain that the imported/source model cannot be changed from this view.

Support diagnostics:

- If existing diagnostics are available, include layout mode, view ID, action reason code, and layout algorithm ID, but not sensitive model content.

## 19. Risks and Mitigations

Risk: visual drag silently changes semantic hierarchy.

Impact: users may unknowingly corrupt the capability model.

Mitigation: require explicit reparent action and test that drag does not mutate parent-child relationships.

How to validate mitigation: compare semantic hierarchy before and after drag tests; run manual smoke test step for boundary crossing.

Risk: Automatic layout stores hidden manual overrides.

Impact: automatic layout becomes unpredictable and hard to debug.

Mitigation: block direct geometry edits in Automatic layout unless explicit pinning exists; test that state does not change after blocked drag/resize.

How to validate mitigation: inspect persisted state after blocked action and run Automatic layout guard tests.

Risk: parent drag leaves children behind.

Impact: containment model becomes visually false.

Mitigation: render descendants relative to parent or update descendant coordinates consistently during parent drag.

How to validate mitigation: test parent drag with child and nested descendant fixtures.

Risk: parent resize hides or overlaps children.

Impact: model readability and correctness degrade.

Mitigation: compute minimum parent bounds from title, padding, and child bounds; clamp resize.

How to validate mitigation: resize below minimum in tests and manual smoke script.

Risk: source-locked models can still be edited through keyboard shortcuts or direct handlers.

Impact: imported/source-of-truth data may be mutated incorrectly.

Mitigation: enforce policy in handlers, not only in disabled UI controls.

How to validate mitigation: test direct semantic handler path if accessible and keyboard shortcut path where supported.

Risk: mode switching overwrites manual geometry.

Impact: user loses carefully arranged presentation views.

Mitigation: preserve manual geometry separately or require confirmation and history capture.

How to validate mitigation: mode switch tests and manual reload smoke test.

Risk: action policy becomes duplicated across UI controls.

Impact: future regressions and inconsistent action behavior.

Mitigation: centralize policy decisions and route changed handlers through it.

How to validate mitigation: review final diff for duplicated mode/editability conditionals and add policy tests.

Risk: tests are too brittle for pointer interactions.

Impact: CI instability or false failures.

Mitigation: unit-test policy and geometry calculations; use integration tests only where stable; cover remaining flows with manual smoke script.

How to validate mitigation: run tests multiple times if flakiness is suspected and document any limitation.

Risk: repository lacks clear model/view separation.

Impact: implementation may require broader refactor than intended.

Mitigation: add a minimal action-policy guard and view-state adapter rather than rewriting storage architecture.

How to validate mitigation: inspect final diff scope and verify no broad unrelated changes.

## 20. Progress

Codex must add timestamps and notes as work proceeds.

- [x] Read full spec. 2026-05-16 07:34 +02:00.
- [x] Inspect repository instructions. 2026-05-16 07:34 +02:00.
- [x] Inspect repository structure. 2026-05-16 07:34 +02:00.
- [x] Discover build, test, lint, and typecheck commands. 2026-05-16 07:34 +02:00.
- [x] Update Repository Discovery Instructions with actual findings. 2026-05-16 07:34 +02:00.
- [x] Confirm or revise implementation plan. 2026-05-16 07:34 +02:00.
- [x] Implement Milestone 1. 2026-05-16 07:34 +02:00.
- [x] Validate Milestone 1. 2026-05-16 07:35 +02:00: `npm run test:run -- src/domain/layout/canvasLayoutPolicy.test.ts` passed, 13 tests.
- [x] Implement Milestone 2. 2026-05-16 07:42 +02:00: central policy now blocks direct geometry edits in automatic modes, exposes optional source-lock editability, guards canvas pointer/resize entry points, disables source create controls when source-locked, and shows layout/editability status-bar indicators.
- [x] Validate Milestone 2. 2026-05-16 07:42 +02:00: `npm run test:run -- src/domain/layout/canvasLayoutPolicy.test.ts src/features/commands/commands.test.ts src/features/editor/editor.shell.test.tsx` passed, 38 tests; `npm run typecheck` passed.
- [x] Implement Milestone 3. 2026-05-16 07:47 +02:00: Manual/Freeform geometry commands now clamp parent/container resize against child bounds, direct Freeform movement remains undoable, parent movement keeps descendants contained, and old automatic direct-geometry conversion tests were updated to the new blocked-action semantics.
- [x] Validate Milestone 3. 2026-05-16 07:47 +02:00: `npm run test:run -- src/domain/commands/commands.test.ts` passed, 43 tests; `npm run test:run -- src/app/stores/documentStore.layout.test.ts src/features/canvas/canvasGeometry.test.ts src/domain/layout/containment.test.ts` passed, 28 tests after the mode-switch coverage was added.
- [x] Implement Milestone 4. 2026-05-16 07:55 +02:00: editor canvas, bulk toolbar, inspector layout fields, settings copy, and help copy now expose Automatic geometry ownership and Manual/Freeform direct-edit behavior without hidden parent Manual conversion.
- [x] Validate Milestone 4. 2026-05-16 07:55 +02:00: `npm run test:run -- src/app/stores/documentStore.layout.test.ts src/features/canvas/canvasGeometry.test.ts src/domain/layout/containment.test.ts` passed, 28 tests; `npm run test:run -- src/features/editor/editor.canvas.test.tsx` passed, 50 tests; `npm run test:run -- src/features/editor/editor.inspector.test.tsx src/features/editor/editor.settings.test.tsx` passed, 25 tests.
- [x] Implement Milestone 5. 2026-05-16 08:04 +02:00: optional source-lock access metadata now round-trips, source-locked documents block source-model commands while allowing visual-view commands, bulk layout operations persist as active-view visual state, and inspector/settings/context/bulk UI surfaces source read-only controls.
- [x] Validate Milestone 5. 2026-05-16 08:04 +02:00: `npm run test:run -- src/domain/document/document.test.ts src/app/stores/documentStore.saveHistory.test.ts src/domain/layout/canvasLayoutPolicy.test.ts src/domain/commands/commands.test.ts src/app/stores/documentStore.layout.test.ts src/features/editor/editor.canvas.test.tsx src/features/editor/editor.inspector.test.tsx src/features/editor/editor.shell.test.tsx src/features/editor/editor.settings.test.tsx` passed, 201 tests across 9 files; `npm run typecheck` passed.
- [x] Implement Milestone 6. 2026-05-16 08:09 +02:00: updated Playwright smoke coverage for the new Manual/Freeform prerequisite and completed final validation/review.
- [x] Validate Milestone 6. 2026-05-16 08:09 +02:00: `npm run lint`, `npm run typecheck`, `npm run test:run`, `npm run build`, and `npm run test:e2e` passed.
- [x] Implement remaining milestones. 2026-05-16 08:09 +02:00.
- [x] Run full validation suite. 2026-05-16 08:09 +02:00: Vitest passed 439 tests across 37 files; Playwright passed 21 tests.
- [x] Run manual smoke test. 2026-05-16 08:09 +02:00: local dev server on `http://127.0.0.1:5174/` loaded in the in-app browser; canvas was visible; status showed `Automatic layout: Uniform` and `Source editable`; settings layout mode options included `Manual / Freeform`.
- [x] Review final diff for unintended changes. 2026-05-16 08:09 +02:00: reviewed key policy, command, store, canvas, inspector, settings, status, test, and spec diffs; `git diff --check` passed.
- [x] Update Decision Log. 2026-05-16 08:09 +02:00.
- [x] Update Outcomes and Retrospective. 2026-05-16 08:09 +02:00.
- [x] Produce final implementation summary. 2026-05-16 08:09 +02:00: final response will summarize implementation, validation, smoke result, risks, and follow-up.
- [x] Implement post-acceptance Tidy children algorithm selector. 2026-05-16 10:15 +02:00: scoped layout now accepts an explicit automatic layout mode, and the inspector exposes Adaptive, Balanced, Flow, and Uniform choices for selected-container tidy operations without changing the global layout mode.
- [x] Validate post-acceptance Tidy children algorithm selector. 2026-05-16 10:15 +02:00: focused command-palette regressions passed; `npm run lint`, `npm run typecheck`, `npm run test:run`, `npm run build`, `npm run test:e2e`, and `git diff --check` passed from the final state.
- [x] Run post-acceptance browser smoke test. 2026-05-16 10:19 +02:00: local dev server on `http://127.0.0.1:5174/`; selected Risk, opened Inspector -> Layout, changed Tidy algorithm from Uniform to Flow, clicked Tidy children, and confirmed Risk stayed anchored while its children moved and Operations stayed stable.

## 21. Discoveries During Implementation

- 2026-05-16 07:34 +02:00: Repository already has a central `src/domain/layout/canvasLayoutPolicy.ts`, but it currently treats direct geometry edits in automatic modes as layout intent that enables per-parent Manual positioning. This conflicts with the new spec requirement to block direct automatic geometry edits until the user explicitly switches to Manual/Freeform.
- 2026-05-16 07:34 +02:00: Visual-view separation already exists. Visual commands are scoped as `"visual"` and write active-view overrides through `applyResolvedVisualDocument`, so source-locked visual-only movement can be supported without mutating source nodes.
- 2026-05-16 07:34 +02:00: No persisted source-lock/editability field exists in the document schema. Viewer mode is route-level read-only only. A backward-compatible optional access field plus a transaction-level source command guard is the narrowest implementation path.
- 2026-05-16 07:34 +02:00: Manual/Freeform parent resize currently allows manually positioned parents to be resized below child bounds because min-size calculations skip child bounds for manual parents and containment repair skips manual parents.
- 2026-05-16 07:34 +02:00: Undo/redo already covers committed transactions by storing full before/after documents; drag, resize, mode switch, and visual/source edits can participate if they continue through existing transaction/store paths.
- 2026-05-16 07:42 +02:00: Existing status-bar diagnostics and selection notices are sufficient for blocked-action feedback; no toast system exists or is needed.
- 2026-05-16 07:47 +02:00: Manual/Freeform containment repair may expand a parent left/up when existing children do not satisfy configured padding. Tests therefore assert contained subtree consistency rather than exact parent/child relative offsets after repair.
- 2026-05-16 07:55 +02:00: The default editor fixture opens in an automatic layout mode. Tests that assert actual geometry mutation must explicitly switch to Freeform; tests that run in automatic mode should assert disabled controls, unchanged geometry, and status feedback.
- 2026-05-16 08:04 +02:00: Several commands stored visual workspace state but were scoped as `"source"`. Source-lock enforcement therefore needs command-type allowance for visual-workspace commands, and bulk layout commands should use `"visual"` scope so active-view overrides do not mutate imported source nodes.
- 2026-05-16 08:09 +02:00: The existing Playwright bulk-align smoke test also assumed direct geometry tools were available in the default automatic layout. It was updated to switch the active view to Manual/Freeform before exercising align/undo/redo.
- 2026-05-16 10:15 +02:00: Browser and UX review showed selected-container tidy was confusing when the active view was Manual/Freeform because the scoped command silently chose the Uniform algorithm. The inspector needs an explicit per-action automatic algorithm selector so users can tidy manual child placement with the algorithm they expect while keeping the global view mode unchanged.

Codex must update this section when it finds:

- Unexpected repository structure.
- Missing commands.
- Failing existing tests.
- Undocumented conventions.
- Conflicts with this spec.
- Dependency constraints.
- Better implementation paths.
- Existing layout mode or editability semantics that differ from this spec.
- Existing source-lock or saved-view behavior that changes implementation choices.

## 22. Decision Log

Decision: Treat Capability Canvas as a nested containment modeling surface, not a generic node-edge graph editor.

Rationale: prior context indicates Capability Canvas uses rectangles fully contained in rectangles for business capability models.

Alternatives considered: replace with generic graph editor or node-edge diagramming framework.

Date/Author: Spec generation / ChatGPT Pro

Decision: Separate semantic model changes from visual view/layout changes.

Rationale: intuitive modeling requires users to know whether they are changing capability hierarchy/identity or only presentation geometry.

Alternatives considered: allow all canvas actions to mutate a shared model/view state.

Date/Author: Spec generation / ChatGPT Pro

Decision: Manual layout allows constrained direct manipulation.

Rationale: Manual layout exists for curated presentation and modeling views, but containment correctness must be preserved.

Alternatives considered: disable all direct manipulation and rely only on automatic layout.

Date/Author: Spec generation / ChatGPT Pro

Decision: Automatic layout blocks direct drag/resize unless an explicit pin/override feature already exists.

Rationale: automatic layout needs a clear geometry source of truth.

Alternatives considered: store hidden manual geometry overrides in Automatic layout.

Date/Author: Spec generation / ChatGPT Pro

Decision: Dragging across a container boundary must not silently reparent a capability.

Rationale: reparenting is a semantic hierarchy change and must be explicit.

Alternatives considered: implicit drag-to-reparent based only on geometric containment.

Date/Author: Spec generation / ChatGPT Pro

Decision: Source-locked imported models must block semantic edits while allowing safe visual-only actions where product behavior supports them.

Rationale: imported source data must remain trustworthy while users may still need presentation views.

Alternatives considered: block all edits including visual changes; allow semantic edits through the canvas.

Date/Author: Spec generation / ChatGPT Pro

Decision: Do not require a new database, external service, layout library, or canvas framework.

Rationale: this is a targeted UX/correctness task, not an architecture replacement.

Alternatives considered: introduce a new layout/canvas stack.

Date/Author: Spec generation / ChatGPT Pro

Codex must append implementation-time decisions here using the same format.

Decision: Treat global layout mode `free` as the repository-equivalent Manual/Freeform view mode for direct geometry edits.

Rationale: the repository already uses `free` to preserve current positions and no-op Apply auto layout, while automatic modes are `uniform`, `flow`, `adaptive`, and `balanced`.

Alternatives considered: introduce a new `manual` layout mode alias, or continue automatic drag-to-parent-Manual conversion.

Date/Author: 2026-05-16 / Codex

Decision: Add source-lock support as an optional document access flag and enforce it at the transaction source-command boundary.

Rationale: route-level viewer read-only state is not persisted and cannot protect direct handler paths in the editor; command scopes already separate source and visual changes.

Alternatives considered: disable only visible UI controls, or add a broad permission subsystem.

Date/Author: 2026-05-16 / Codex

Decision: Enforce automatic layout geometry ownership at both the UI-affordance layer and the command layer.

Rationale: hiding or disabling drag handles, resize handles, inspector fields, and bulk geometry buttons gives immediate feedback, while command-level guards protect keyboard shortcuts, tests, and future callers.

Alternatives considered: leave UI controls enabled and rely only on diagnostics from command rejection.

Date/Author: 2026-05-16 / Codex

Decision: Treat visual workspace management commands as source-lock safe even when they are implemented as source-scoped document updates.

Rationale: creating, renaming, resetting, configuring, and switching visual views mutates the view workspace, not the semantic capability hierarchy or source node data. Blocking these commands would prevent source-locked presentation work.

Alternatives considered: change all visual-view commands to `"visual"` scope, but the store's visual transaction adapter only persists resolved active-view overrides and would drop visual workspace structural changes.

Date/Author: 2026-05-16 / Codex

Decision: Treat text-label annotation geometry as visual-only and movable in automatic layout modes.

Rationale: automatic layout owns capability card geometry, but canvas labels are manual annotations skipped by layout. Browser retesting showed adding a label in the default `Automatic layout: Uniform` mode selected the label but blocked drag with the capability movement notice, making label placement feel broken.

Alternatives considered: require users to switch the whole view to Manual/Freeform before moving labels, but that over-applies capability layout ownership to annotation-only geometry.

Date/Author: 2026-05-16 / Codex

Decision: Expose the selected-container Tidy children algorithm as a local inspector selector.

Rationale: Tidy children is a scoped visual cleanup action, not a global mode switch. Users need to choose between Adaptive, Balanced, Flow, and Uniform for that one operation while preserving the current Manual/Freeform or automatic view mode.

Alternatives considered: infer the algorithm only from global layout mode, switch the whole document mode before tidying, or add a toolbar mode for scoped layout. Those options either hide the algorithm choice or over-apply a local cleanup action to the whole canvas.

Date/Author: 2026-05-16 / Codex

## 23. Outcomes and Retrospective

- Implemented a central layout/editability policy that blocks direct geometry in automatic modes and blocks semantic source edits when `doc.access.sourceLocked` is true.
- Post-acceptance browser retesting at 2026-05-16 08:51 +02:00 found that text labels could be selected but not moved in the default automatic layout. The policy was narrowed so label-only geometry edits remain available in automatic modes while mixed label/capability and capability-only geometry edits stay locked.
- Updated canvas drag/resize, keyboard/numeric movement, bulk align/distribute/sizing, inspector layout fields, context menus, command availability, toolbar buttons, status chips, settings/help copy, and blocked-action notices to match Manual/Freeform versus Automatic semantics.
- Fixed Manual/Freeform resize minimums so parent/container resizing accounts for child bounds even when manual positioning is enabled.
- Added optional persisted document access metadata (`access.sourceLocked`, `sourceLabel`, `reason`) through schema, parse, normalize, serialize, and round-trip tests.
- Preserved source-locked visual preparation by allowing visual workspace commands and making bulk layout operations visual-scoped active-view edits instead of source-node edits.
- Added source-lock UI read-only affordances in inspector, settings, context menu, and bulk controls while leaving active-view controls available.
- Added a selected-container Tidy children algorithm selector in the inspector so scoped cleanup can run Adaptive, Balanced, Flow, or Uniform without changing global layout mode.
- Updated tests across domain policy/commands, document schema, stores/history/layout, editor canvas/shell/inspector/settings, and Playwright E2E.
- Changed from the initial plan only where repository architecture required it: visual workspace management commands remain source-scoped internally because changing them to visual scope would be dropped by the active-view adapter, so source-lock uses a narrow command-type allowance for those view-only commands.
- Validation commands run and results:
  - `npm run lint` passed.
  - `npm run typecheck` passed.
  - `npm run test:run` passed, 443 tests across 37 files.
  - `npm run build` passed.
  - `npm run test:e2e` passed, 21 tests.
  - `git diff --check` passed.
- Manual smoke result: local Vite app loaded at `http://127.0.0.1:5174/` in the in-app browser; canvas was visible; status showed `Automatic layout: Uniform` and `Source editable`; settings exposed `Manual / Freeform`.
- Post-fix browser smoke result at 2026-05-16 08:55 +02:00: in the default `Automatic layout: Uniform` mode, an unselected text label selected and dragged from `440,496` to `488,520`, keyboard nudge moved it to `496,528`, and a regular capability drag stayed blocked with the Freeform notice.
- Tidy selector validation result at 2026-05-16 10:15 +02:00: final validation passed with Vitest 450 tests across 37 files and Playwright 22 tests; the selected-container E2E confirms choosing Flow in the inspector tidies only the selected container children.
- Tidy selector browser smoke result at 2026-05-16 10:19 +02:00: in the in-app browser, Flow tidy changed Fraud Risk and Operational Risk positions inside Risk, kept Risk at `x=808, y=360`, and left Operations at `x=1008, y=360`.
- Remaining risk: source-locked color, heatmap data, metadata, and label edits are blocked because those are still source-node properties. The current data model has no visual-only label/color/metadata override workflow for all inspector fields beyond existing active-view geometry/view settings.
- Follow-up recommendation: if source-locked presentation editing should include per-view labels, colors, or annotations, add explicit visual override commands and UI copy rather than storing those edits on source nodes.

## 24. Final Acceptance Checklist

Before stopping, Codex must confirm each item below in the final implementation summary:

1. [x] All in-scope functional requirements are implemented or any unsupported repository cases are explicitly documented with evidence.
2. [x] Out-of-scope items were not implemented.
3. [x] All acceptance criteria are satisfied.
4. [x] Repository instructions were followed.
5. [x] Build passes.
6. [x] Tests pass.
7. [x] Lint passes, if applicable.
8. [x] Typecheck passes, if applicable.
9. [x] Manual smoke test passes, if applicable.
10. [x] Security/privacy/compliance requirements are satisfied or explicitly marked not applicable.
11. [x] No sensitive data is logged.
12. [x] No unrelated files were changed.
13. [x] Final diff was reviewed.
14. [x] Progress section was updated.
15. [x] Discoveries section was updated.
16. [x] Decision Log was updated.
17. [x] Outcomes and Retrospective section was updated.
18. [x] Final Codex summary includes changed files, commands run, results, risks, and follow-ups.

## 25. Codex Final Response Requirements

Codex final response must include:

- Summary of implementation.
- Changed files.
- Validation commands run.
- Results of each command.
- Manual smoke test result, if applicable.
- Deviations from the spec.
- Risks or limitations.
- Suggested next steps.
