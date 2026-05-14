# Canvas Layout Interaction Correctness

## 1. Executive Summary

- One-sentence objective: make Capability Canvas canvas actions behave predictably across automatic layout modes, freeform layout, parent-level manual positioning, and preserved/locked subtrees.
- User-visible outcome: when a user drags, nudges, reparents, resizes, adds, aligns, distributes, or applies layout on the canvas, the app clearly preserves deliberate manual intent and does not surprise the user with silent relayouts.
- Why this matters: Capability Canvas is a hierarchy-first modeling tool where layout is part of user trust; users must be able to distinguish semantic modeling changes from visual arrangement changes, especially when switching between automatic and manual arrangement workflows.
- What Codex is expected to implement: a repo-aware UX/correctness review artifact, a small pure layout-action policy layer, targeted command/UI changes for direct canvas manipulation, and tests proving manual and automatic layout behaviors are intuitive and stable.
- What Codex must not implement: do not replace the layout engine, do not redesign the whole canvas, do not add collaboration/backend/cloud features, do not alter authentication, and do not introduce new external services or telemetry.
- Primary success condition: direct user placement of nodes is preserved unless the user explicitly applies an automatic layout action, and automatic layout continues to skip manual/preserved areas while arranging eligible areas.
- Primary risk: changing move/reparent/add-child semantics can accidentally affect undo/redo, visual-view state, or autosave if transient preview state and committed document state are mixed.

## 2. Codex Kickoff Prompt

```text
Read `SPEC_canvas-layout-interaction-correctness.md` first.

Then inspect the repository instructions and structure before editing files. Read `AGENTS.md` if present, plus relevant README files, package/build files, test configuration, existing source conventions, and the current canvas/layout/command implementation.

Implement the specification milestone by milestone. Before coding, update the Repository Discovery section with what you find and confirm or revise the implementation plan. Do not implement anything listed as out of scope.

Focus on Canvas Layout Interaction Correctness: mode-aware canvas action semantics for automatic layout modes, freeform layout, parent-level Manual positioning, and Preserve/locked subtrees. Preserve the existing local-first architecture, command transaction model, undo/redo behavior, visual views, and domain-layer purity.

After each milestone, run the relevant validation commands and update the Progress, Discoveries During Implementation, Decision Log, and Outcomes and Retrospective sections in this spec.

When finished, run the full validation suite that is practical for the repository, review the final diff for unintended changes, and provide a final summary with changed files, commands run, results, remaining risks, and suggested follow-ups.

Stop only when all acceptance criteria and validation checks in this spec are satisfied, or when an explicit blocker is documented with the safest partial implementation completed.
```

## 3. Optional `/goal` Prompt

This is optional. The main workflow is to use the Codex Kickoff Prompt above. `/goal` may not be available in all Codex surfaces.

```text
/goal Implement `SPEC_canvas-layout-interaction-correctness.md` end-to-end. Read the spec and repo instructions first, work milestone by milestone, keep the spec updated as a living execution record, run validation after each milestone, review the final diff, and stop only when all acceptance criteria and validation checks pass.
```

## 4. Background and Context

Capability Canvas is a local-first, browser-based hierarchical capability modeling tool. The repository discovered during spec generation is `ThomasRohde/capability-canvas`, with a TypeScript/React/Vite implementation, a pure domain layer, Zustand stores, local persistence, visual views, and a deterministic layout engine.

The problem being solved is not general “UX polish.” The concrete problem is that canvas modeling actions have different intuitive meanings depending on layout state:

- In automatic modes (`adaptive`, `balanced`, `flow`, `uniform`), layout is expected to arrange eligible children consistently.
- In global `free` layout mode, the engine currently preserves positions instead of rearranging nodes.
- A node’s `isManualPositioningEnabled` flag means that the node’s children are manually placed and should be skipped by automatic layout.
- A node’s `isLockedAsIs` flag means its subtree is preserved from automatic layout and the node cannot be resized through existing UI, although deliberate manual movement is currently allowed.
- Saved visual views can override layout, visibility, collapse state, viewport, and node visual state without deleting source model data.

The current situation, based on repository inspection, is strong but still exposes a UX correctness gap. The code already has layout modes, manual positioning, preserved/locked state, command transactions, undo/redo, visual views, and tests. However, direct canvas manipulation is not consistently expressed as a layout intent. A user can drag a child under an automatically arranged parent, but later forced relayouts may still treat the parent as automatically arranged unless the user explicitly turns on Manual positioning. That is easy to misunderstand: a direct drag feels like manual intent.

Desired future state:

- Direct placement actions preserve user intent in the smallest affected scope.
- Automatic layout actions remain useful and deterministic for areas that are still eligible for automatic arrangement.
- Users get concise, non-modal feedback when the app converts a parent to Manual positioning to preserve a direct edit.
- The app’s labels, help text, and diagnostics use consistent terms: automatic layout mode, freeform layout mode, Manual child positioning, and Preserve/locked subtree.
- Codex and future maintainers can see an explicit action-semantics matrix rather than reverse-engineering behavior from UI event handlers.

Relevant decisions from the conversation and prior context:

- Capability Canvas must preserve hierarchy correctness and layout determinism.
- Modeling operations should remain command-based and undoable.
- Transient drag/resize/selection preview state must stay out of the committed document store.
- Layout behavior must preserve manual and locked/preserved areas by default.
- Local-first operation is a hard constraint; no backend is required for this task.
- Earlier planning discussed Capability Canvas as a visual publishing layer over governed models; the current repository presents it as a local-first modeling tool. This spec targets the current repository behavior and does not change product positioning.

Important rejected ideas for this task:

- Do not replace the existing layout engine with a graph/canvas library.
- Do not redesign the full editor shell.
- Do not add a modal confirmation before every drag; that would make modeling slow.
- Do not introduce telemetry, backend sync, or analytics to understand interactions.
- Do not change export formats unless a regression is found and must be fixed.

Deep UX/correctness review summary:

| Area | Current strength | Correctness risk | Required direction |
| --- | --- | --- | --- |
| Automatic layout modes | Deterministic modes and tests already exist. | Directly dragged children can still belong to an automatically arranged parent. | Treat direct child movement as manual positioning intent for the arranging parent. |
| Freeform mode | Engine preserves positions. | Settings help text can imply forced layout may rearrange freeform content. | Align UI copy and diagnostics with actual no-op preservation behavior. |
| Manual parent positioning | Domain flag exists and layout skips manual areas. | Users may not understand that Manual applies to children of the selected parent, not the selected node’s own position. | Add clearer copy and mode-aware feedback. |
| Preserve/locked subtree | Domain and UI support exists. | Preserve, Manual, and Freeform can be mentally conflated. | Keep meanings distinct in UI and tests. |
| Drag/reparent | Transient preview is separated from commit state. | Drop position preservation relies on command composition and may not update layout intent. | Introduce a policy-backed commit path for move/reparent intent. |
| Add child | Existing command can relayout the parent. | Adding under a manual parent should not rearrange existing manually placed siblings. | Add parent-mode-aware add-child behavior. |
| Undo/redo | Command transactions exist. | Policy-side effects such as switching a parent to Manual must undo with the user action. | Group side effects into one history entry. |

## 5. Users and Use Cases

### Use Case 1: Capability modeler manually arranges children inside a domain

- Actor: enterprise architect or capability modeler.
- Trigger: the user drags or keyboard-nudges a child capability inside a parent while the active view is using an automatic layout mode.
- Current pain or limitation: the user’s direct placement can be treated as a visual move without clearly changing the parent’s layout behavior, making later forced automatic layout surprising.
- Desired outcome: the parent that owns the moved child becomes Manual for child positioning, the moved child stays where placed, and the app shows a concise notice explaining why.
- Observable success: after dragging a child, the parent’s Manual layout state is active, applying auto layout does not move that parent’s children, and undo reverts both the movement and the Manual state change.

### Use Case 2: User reparents a capability by dragging it into another parent

- Actor: capability modeler.
- Trigger: the user drags a capability into a different valid parent container.
- Current pain or limitation: a reparent operation changes model semantics and visual position at the same time; later relayout may not match the user’s drop intent.
- Desired outcome: the capability is reparented, the drop position is preserved, the destination parent is Manual for child positioning when needed, and invalid targets remain rejected.
- Observable success: the node’s `parentId` changes, its visible position is near the drop location, the destination parent’s children are not immediately rearranged by automatic layout, and cycles/text-label parent cases remain blocked.

### Use Case 3: User adds a child under a manually arranged parent

- Actor: capability modeler.
- Trigger: the user selects a parent that is already Manual and chooses Add child.
- Current pain or limitation: adding a child can trigger automatic relayout and disrupt carefully arranged siblings.
- Desired outcome: the new child is placed in a deterministic available area inside the parent without moving existing siblings.
- Observable success: existing siblings have unchanged coordinates after Add child, the new child is on canvas, no sibling overlap is introduced when avoidable, and parent containment remains valid unless the parent is intentionally preserved/locked.

### Use Case 4: User applies automatic layout to a mixed manual/automatic diagram

- Actor: modeler or presentation author.
- Trigger: the user clicks Apply auto layout or changes an automatic layout mode.
- Current pain or limitation: it can be unclear which areas will move and which will be preserved.
- Desired outcome: automatic layout arranges eligible areas and preserves Manual and Preserve/locked areas, with diagnostics/status explaining partial layout when applicable.
- Observable success: eligible nodes move as expected, Manual children and preserved/locked subtrees do not move, and diagnostics report partial/no-op behavior when relevant.

### Use Case 5: User works in Freeform layout mode

- Actor: presentation author polishing a view.
- Trigger: the user switches layout mode to Freeform or clicks Apply auto layout while Freeform is active.
- Current pain or limitation: copy can imply forced layout might still rearrange content, while the engine preserves positions.
- Desired outcome: Freeform is clearly communicated as position-preserving; Apply auto layout in Freeform does not pretend to rearrange nodes.
- Observable success: UI help text and diagnostics say Freeform preserves positions; clicking Apply auto layout in Freeform produces no geometry changes and communicates that another automatic mode is required to rearrange nodes.

## 6. Scope

### 6.1 In Scope

- Add or update a repository documentation artifact that records the canvas modeling UX/correctness review and action semantics matrix.
- Add a small pure TypeScript policy/helper layer that determines layout intent for direct canvas actions without importing React.
- Apply the policy to direct move paths: pointer drag, keyboard nudge, and numeric X/Y movement from the Layout tab.
- Apply the policy to drag-based reparenting so drop position preservation updates the destination parent’s Manual positioning state when required.
- Make Add child behavior parent-mode-aware: automatic parent uses automatic layout; Manual parent preserves existing child coordinates and places the new child deterministically.
- Align Freeform mode UI/help text and diagnostics with actual position-preserving behavior.
- Improve Layout tab guidance so users can distinguish Auto layout, Manual child positioning, and Preserve/locked subtree behavior.
- Add unit and component/integration tests for the above behavior.
- Preserve existing local-first behavior, visual view behavior, undo/redo, autosave gating, and import/export contracts.

### 6.2 Out of Scope

- Do not replace the existing layout engine or introduce a new layout algorithm family.
- Do not replace the existing command transaction system.
- Do not replace Zustand stores or alter the three-store ownership model.
- Do not move transient drag/resize state into `documentStore` or persisted UI state.
- Do not introduce a backend, database, authentication, authorization, collaboration, telemetry, analytics, or external service.
- Do not change export format behavior except where tests expose an unavoidable regression caused by this task.
- Do not redesign the full canvas UI, toolbar, inspector, settings drawer, or view drawer.
- Do not add a schema migration unless implementation truly requires a persisted document shape change; prefer existing fields.
- Do not change unrelated UI components.
- Do not commit, push, create branches, or open pull requests unless the user explicitly asks.

### 6.3 Later Phases

- Guided onboarding/tutorial for Manual vs Auto vs Preserve.
- Visual overlays that highlight which parent will become Manual during drag before pointer-up.
- A dedicated “layout intent inspector” for complex diagrams.
- More granular per-view-only Manual positioning if the current source/view distinction proves too coarse.
- Advanced conflict prompts for adding children to preserved/locked parents.
- Large-diagram virtualization or rendering optimization beyond regressions introduced by this task.
- Collaboration/cloud sync semantics for concurrent layout edits.

## 7. Known Facts, Assumptions, and Open Questions

### 7.1 Known Facts

- The repository discovered during spec generation is `ThomasRohde/capability-canvas`, default branch `master`.
- The repository includes `AGENTS.md` with instructions to preserve local-first operation, pure domain logic, command transactions, strict import direction, and three Zustand stores.
- The package uses TypeScript, React, Vite, Zustand, Vitest, Testing Library, Playwright, Tailwind CSS, Zod, `idb`, `elkjs`, and `pptxgenjs`.
- The document model uses `CapabilityDocument`, `CapabilityNode`, `nodesById`, `childrenByParentId`, and `ROOT_PARENT_ID = "__root__"`.
- Layout modes are currently typed as `"uniform" | "flow" | "adaptive" | "balanced" | "free"`.
- Node-level layout flags include `isManualPositioningEnabled`, `isLockedAsIs`, and visual-view state fields including `lockedForView` and `isManualPositioningEnabled`.
- Current default layout has `mode: "uniform"`, `isUserArranged: false`, and `preservePositions: true`.
- The current layout engine returns no geometry patches in `free` mode and emits a `free-layout-preserved` diagnostic.
- Current canvas drag behavior is implemented in `src/features/canvas/useCanvasNodeInteractions.ts` and commits through domain commands such as `moveNodes` and `reparentNode`.
- Current keyboard movement is implemented through `src/features/commands/useEditorActions.ts` and calls `moveNodes`.
- Current numeric X/Y movement in the inspector Layout tab calls `moveNodes`.
- Current Add child behavior is implemented in `src/domain/commands/capabilityOps.ts` and can trigger relayout of the parent scope.
- Current Layout tab exposes Auto layout, Manual, and Preserve buttons for a selected node.
- Current Settings drawer exposes layout mode selection and Apply auto layout.
- Existing docs already establish that manual and locked layouts must be preserved through save/load and layout recalculation.
- Existing tests cover layout, commands, canvas workflows, inspector behavior, visual views, import/export, and selection.

### 7.2 Assumptions

#### Assumption 1: This spec targets the current `capability-canvas` repository.

- Why it is reasonable: a matching accessible repository was discovered and its README/product docs match the request.
- How Codex can verify it in the repository: inspect `README.md`, `AGENTS.md`, `package.json`, and the Git remote/name.
- What Codex should do if the assumption is wrong: update the Repository Discovery section with the actual repository context, then map the requirements to equivalent files and conventions without fabricating paths.

#### Assumption 2: “Manual” means parent-level child-positioning behavior, not merely global Freeform layout.

- Why it is reasonable: the domain model uses `isManualPositioningEnabled` on nodes, and docs describe children of manual parents as protected from automatic layout.
- How Codex can verify it in the repository: inspect `src/domain/document/types.ts`, `src/domain/layout/`, `src/features/inspector/LayoutTab.tsx`, and tests referencing manual positioning.
- What Codex should do if the assumption is wrong: document the actual semantics and adapt the policy layer to the repository’s terms while preserving observable behavior from this spec.

#### Assumption 3: Direct movement of a child under an automatic parent should convert the arranging parent to Manual positioning.

- Why it is reasonable: direct placement is an explicit user layout intent; preserving that intent is more intuitive than allowing later automatic layout to overwrite it silently.
- How Codex can verify it in the repository: review existing UX copy, tests, and domain docs for manual preservation expectations.
- What Codex should do if the assumption is wrong: keep the policy helper and tests for explicit action semantics, but adjust the default to emit a warning/notice rather than converting the parent.

#### Assumption 4: The smallest safe scope for preserving direct movement is the direct parent of the moved root node.

- Why it is reasonable: `isManualPositioningEnabled` controls children of a parent; converting ancestors or descendants would be broader than the user action.
- How Codex can verify it in the repository: inspect layout scope normalization, selection rules, and move/reparent command tests.
- What Codex should do if the assumption is wrong: choose the smallest scope that preserves the user-visible placement and record the decision in the Decision Log.

#### Assumption 5: The implementation can avoid document schema changes.

- Why it is reasonable: existing fields already encode layout mode, user-arranged metadata, manual positioning, and locked/preserved behavior.
- How Codex can verify it in the repository: inspect schemas, parsers, serializers, migrations, and visual view normalization.
- What Codex should do if the assumption is wrong: add a migration only if unavoidable, include round-trip tests, and document the migration in this spec before coding it.

#### Assumption 6: Non-modal feedback is sufficient when the app converts a parent to Manual positioning.

- Why it is reasonable: modal confirmations during drag would interrupt modeling and were rejected for this task.
- How Codex can verify it in the repository: inspect existing diagnostics, toast, and `showSelectionNotice` patterns.
- What Codex should do if the assumption is wrong: use the repository’s existing non-modal diagnostic/status pattern; do not add a blocking modal.

### 7.3 Open Questions

#### Open Question 1: Should automatic-to-Manual conversion be active-view-specific or source-model-wide?

- Whether Codex can proceed without the answer: yes.
- Safe default if Codex must proceed: use the existing command/view conventions. Prefer active-view-specific behavior if the repository already supports it cleanly; otherwise use source-model behavior but keep the implementation minimal and reversible.
- Where Codex might find the answer: `src/domain/visual/workspace.ts`, `src/domain/commands/visualViewOps.ts`, `src/app/stores/documentStore.ts`, and existing visual-view tests.

#### Open Question 2: Should Add child under a preserved/locked parent be blocked if the child would not fit?

- Whether Codex can proceed without the answer: yes.
- Safe default if Codex must proceed: preserve current Add child behavior for locked parents unless this task’s tests reveal a regression; document it as a later-phase improvement.
- Where Codex might find the answer: `docs/domain-model.md`, `docs/interaction-contracts.md`, `src/domain/layout/containment.ts`, and command tests for locked nodes.

#### Open Question 3: Should Freeform mode disable the Apply auto layout button?

- Whether Codex can proceed without the answer: yes.
- Safe default if Codex must proceed: keep the button available but update help text/status/diagnostics so users understand it preserves positions in Freeform. Disabling the button is acceptable only if tests and UI patterns support disabled-action explanations.
- Where Codex might find the answer: `src/features/settings/SettingsDrawer.tsx`, diagnostics rendering, and command palette behavior.

#### Open Question 4: Should direct resize of a child under an automatic parent also convert the arranging parent to Manual?

- Whether Codex can proceed without the answer: yes.
- Safe default if Codex must proceed: do not convert solely for size changes unless the resize operation also changes the node’s position. Ensure the resized node’s explicit size is preserved and future automatic layout uses that size.
- Where Codex might find the answer: layout measure code, resize command tests, and current inspector behavior.

#### Open Question 5: Does Codex have local Playwright browser dependencies available?

- Whether Codex can proceed without the answer: yes.
- Safe default if Codex must proceed: run unit/component tests and document if `npm run test:e2e` cannot run due to local environment constraints.
- Where Codex might find the answer: Playwright config, package scripts, installed browser status, and CI configuration.

## 8. Repository Discovery Instructions

Codex must inspect the repository before editing. At minimum, inspect:

- Repository root.
- `AGENTS.md`, if present.
- `README.md` and relevant docs under `docs/`.
- `package.json` and lock files.
- Test configuration, including Vitest and Playwright configuration.
- Lint/typecheck configuration.
- Existing feature folders related to the change.
- Routing/API definitions, if any.
- Database/schema/migration folders, if relevant.
- Existing tests for commands, layout, canvas, inspector, settings, visual views, and e2e smoke workflows.
- CI configuration, if present.

Codex must update this section after discovery with:

- Actual tech stack.
- Relevant directories.
- Existing patterns to follow.
- Files likely to change.
- Commands discovered.
- Any conflicts between repo conventions and this spec.

Spec-generation discovery found the following likely repository details. Codex must verify them locally before implementation:

- Actual tech stack likely includes TypeScript, React, Vite, Zustand, Vitest, Testing Library, Playwright, Tailwind CSS, Zod, `idb`, `elkjs`, and `pptxgenjs`.
- Relevant directories likely include:
  - `src/domain/document/`
  - `src/domain/layout/`
  - `src/domain/commands/`
  - `src/domain/visual/`
  - `src/domain/selection/`
  - `src/app/stores/`
  - `src/features/canvas/`
  - `src/features/commands/`
  - `src/features/inspector/`
  - `src/features/settings/`
  - `src/features/editor/`
  - `src/test/`
  - `tests/e2e/`
  - `docs/`
- Existing patterns likely to follow:
  - Keep `src/domain/` pure TypeScript with no React imports.
  - Use command transactions for committed model changes.
  - Keep high-frequency drag/resize preview state in `useTransientStore`, not `documentStore`.
  - Use `useDocumentStore.execute()` for committed transactions.
  - Tests assert diagnostic `.code` values rather than human message text.
  - Avoid direct use of `node.color` in visual/export rendering; use heatmap-aware helpers where relevant.
- Files likely to change:
  - `docs/canvas-modeling-ux-correctness-review.md` or similar new docs file.
  - `src/domain/layout/` or `src/domain/commands/` for policy and command helpers.
  - `src/domain/commands/geometryOps.ts`.
  - `src/domain/commands/capabilityOps.ts`.
  - `src/features/canvas/useCanvasNodeInteractions.ts`.
  - `src/features/commands/useEditorActions.ts`.
  - `src/features/inspector/LayoutTab.tsx`.
  - `src/features/settings/SettingsDrawer.tsx`.
  - Existing tests near layout, commands, canvas, inspector, and settings.
- Commands likely available:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test:run`
  - `npm run build`
  - `npm run test:e2e`

## 9. Functional Requirements

### FR-001: Add a canvas modeling UX/correctness review artifact

- Requirement: add a Markdown document under `docs/` that records the Manual/Automatic/Freeform/Preserve action semantics matrix for canvas modeling actions.
- Rationale: future maintainers and agents need a stable review artifact so behavior is not inferred from scattered UI event handlers.
- Acceptance criteria:
  - The document exists under `docs/` with a clear name such as `docs/canvas-modeling-ux-correctness-review.md`.
  - It defines the terms Automatic layout mode, Freeform layout mode, Manual positioning, and Preserve/locked subtree.
  - It includes a table covering at least these actions: Add root, Add child, drag/move, keyboard nudge, numeric X/Y move, resize, reparent by drag, align, distribute, same size, Fit parent, Apply auto layout, change layout mode, toggle Manual, toggle Preserve, collapse/expand in view, Remove from active view, and Delete from model.
  - For each covered action, the table states expected behavior in automatic modes, Freeform mode, Manual parent state, and Preserve/locked state where applicable.
  - The document references real repository terms and files after Codex discovery; it must not invent paths that do not exist.
- Validation method:
  - Manual file review.
  - `npm run test:run` if docs are included in any docs validation; otherwise no automated validation required for the file itself.

### FR-002: Introduce a pure layout-action policy/helper

- Requirement: implement a small pure TypeScript helper that computes canvas layout intent for direct modeling actions without importing React.
- Rationale: direct placement behavior should be centralized and testable rather than duplicated across drag, keyboard, and inspector handlers.
- Acceptance criteria:
  - The helper lives in a domain-appropriate folder, likely under `src/domain/layout/` or `src/domain/commands/`.
  - It has no React imports and no direct store imports.
  - It accepts enough input to evaluate at least: action type, active resolved document, selected root node ids, current parent ids, optional target parent id, active layout mode, Manual flags, Preserve/locked flags, and text-label constraints where relevant.
  - It returns a deterministic result containing at least: whether the action is allowed, parent ids that should become Manual to preserve direct placement, optional diagnostic/status code, and whether automatic relayout should be skipped or requested.
  - It distinguishes automatic modes (`adaptive`, `balanced`, `flow`, `uniform`) from `free` mode.
  - It distinguishes moving a selected root node from moving descendants that are visually previewed as part of that subtree.
  - It does not mutate the document.
  - Unit tests cover automatic parent, Manual parent, Freeform mode, preserved/locked node, text-label target rejection, root movement, child movement, multi-select siblings, and drag reparent.
- Validation method:
  - Run targeted Vitest tests for the new helper.
  - Run `npm run test:run` before final completion.

### FR-003: Preserve direct movement intent for pointer drag, keyboard nudge, and numeric X/Y movement

- Requirement: when a user directly moves one or more selected root nodes that are children of an automatic parent, the commit must also switch the arranging parent to Manual positioning in the same undoable transaction.
- Rationale: a direct move is a clear manual layout action; the app should preserve it in the smallest affected scope.
- Acceptance criteria:
  - Pointer drag of a child under a non-Manual parent moves the node and sets that direct parent’s Manual positioning state to true.
  - Keyboard nudge of a child under a non-Manual parent moves the node and sets that direct parent’s Manual positioning state to true.
  - Numeric X/Y movement from the Layout tab moves the selected node and sets that direct parent’s Manual positioning state to true.
  - Moving a root node does not attempt to set a parent Manual flag because roots have no parent.
  - Moving a parent node inside its own parent sets the moved node’s direct parent Manual, but does not set Manual on the moved node merely because its descendants moved with it.
  - Multi-select movement sets Manual only on the shared arranging parent or valid root scope according to existing selection rules.
  - Undo reverts both geometry changes and any Manual-state conversion in one history step.
  - Redo reapplies both geometry changes and any Manual-state conversion in one history step.
  - The implementation does not write transient drag state into the committed document during pointer movement; it commits only on pointer-up.
- Validation method:
  - Add/update domain command tests for movement and undo/redo.
  - Add/update component tests for canvas drag and keyboard nudge.
  - Add/update inspector tests for numeric X/Y movement if feasible.
  - Run `npm run test:run`.

### FR-004: Preserve drop position and Manual intent for drag reparenting

- Requirement: when a user drags a node into a different valid parent, the reparent commit must preserve the drop position and switch the destination parent to Manual positioning when needed.
- Rationale: drag reparenting is both a semantic modeling action and a visual placement action; the destination parent should not immediately auto-arrange away the user’s drop position.
- Acceptance criteria:
  - Dragging a single node into a valid non-text parent changes the node’s parent and preserves visible drop coordinates within existing drag precision.
  - If the destination parent is not Manual and is not otherwise protected by Freeform behavior, it becomes Manual in the same undoable transaction.
  - If the destination parent is already Manual, no redundant state change is recorded.
  - Invalid targets, including text-label targets and cycle-creating targets, remain rejected by existing validation.
  - Undo restores parent relationship, geometry, and any Manual-state conversion in one history step.
  - Drag preview behavior remains transient and unchanged except for any optional status/target hint added by this task.
- Validation method:
  - Add/update component tests in the existing canvas test area.
  - Add/update domain command tests if a new reparent-with-layout-intent operation is introduced.
  - Run `npm run test:run`.

### FR-005: Make Add child behavior parent-mode-aware

- Requirement: Add child must respect the selected parent’s current child-positioning mode.
- Rationale: adding a child under a manually arranged parent must not disrupt existing manual sibling placement.
- Acceptance criteria:
  - Under an automatic parent, Add child may use the existing automatic relayout behavior for that parent scope.
  - Under a Manual parent, Add child does not move existing visible children.
  - Under a Manual parent, the new child is placed deterministically on canvas, preferably in the first available non-overlapping slot using existing grid/spacing settings.
  - If a non-overlapping slot cannot be found cheaply, the new child is still placed deterministically and any containment/overlap limitation is documented in diagnostics or a test note; do not add expensive layout search.
  - Parent containment remains valid for non-locked, non-preserved parents.
  - Undo removes the new child and restores any parent geometry that changed due to containment repair.
  - Existing source-model validation still prevents text labels from becoming parents.
- Validation method:
  - Add/update command tests for Add child under automatic and Manual parents.
  - Add/update component test for Add child from the context menu or command action under a Manual parent.
  - Run `npm run test:run`.

### FR-006: Align Freeform layout copy and diagnostics with actual behavior

- Requirement: Freeform mode UI copy and diagnostics must state that Freeform preserves current positions and does not apply automatic arrangement.
- Rationale: users should not think “Apply auto layout” will force a rearrangement when the engine intentionally returns no geometry patches in Freeform mode.
- Acceptance criteria:
  - The Settings drawer Freeform help text accurately describes the behavior: positions are preserved; choose an automatic mode to rearrange nodes.
  - Applying auto layout while Freeform is active produces no geometry changes.
  - Applying auto layout while Freeform is active surfaces a clear diagnostic/status message using the repository’s existing diagnostic/status pattern.
  - Existing `free-layout-preserved` diagnostic behavior is preserved or improved; tests should assert diagnostic code when possible, not exact message text.
  - No new layout algorithm is added for Freeform mode.
- Validation method:
  - Add/update settings/component tests if the repository has tests for settings copy or diagnostics.
  - Add/update layout/domain tests asserting no geometry patches in Freeform.
  - Run `npm run test:run`.

### FR-007: Improve Layout tab guidance for Auto, Manual, and Preserve

- Requirement: update the selected-node Layout tab so users can understand the difference between automatic layout, Manual child positioning, and Preserve/locked subtree behavior.
- Rationale: current labels are compact but can be misunderstood; the user needs to know which children will be arranged and which will be preserved.
- Acceptance criteria:
  - The Layout tab explains that Auto layout means the selected parent’s children may be arranged by the active automatic layout mode.
  - The Layout tab explains that Manual means the selected parent’s children keep direct canvas positions and are skipped by automatic layout.
  - The Layout tab explains that Preserve means the selected subtree is skipped by automatic layout and cannot be resized, while deliberate movement remains possible if that is current product behavior.
  - The explanation uses existing UI components/styles and does not create a large marketing panel.
  - The controls remain keyboard accessible and retain appropriate labels/titles.
  - Existing tests for inspector layout fields continue to pass.
- Validation method:
  - Add/update component tests for visible guidance text or accessible descriptions.
  - Run `npm run test:run`.

### FR-008: Provide concise non-modal feedback on automatic-to-Manual conversion

- Requirement: when a direct movement or drag reparent converts a parent to Manual positioning, the UI must show a short non-modal notice or diagnostic.
- Rationale: the conversion is beneficial but should not be invisible.
- Acceptance criteria:
  - The notice appears after the committed action, not during every pointermove.
  - The notice identifies the behavior, for example: “Parent switched to Manual so your placement is preserved.” Exact copy can follow repository style.
  - The notice does not block continued modeling.
  - The notice is accessible through the repository’s existing status/notice/diagnostic pattern.
  - The notice is not emitted when no parent Manual-state conversion occurs.
- Validation method:
  - Add/update component tests that perform a movement and assert a status/notice/diagnostic appears.
  - Run `npm run test:run`.

### FR-009: Preserve automatic layout usefulness in mixed diagrams

- Requirement: automatic layout must still arrange eligible areas while preserving Manual parents and Preserve/locked subtrees.
- Rationale: converting a parent to Manual should not make the whole diagram effectively unlayoutable.
- Acceptance criteria:
  - Applying automatic layout after a child movement does not move children of the newly Manual parent.
  - Applying automatic layout can still move other eligible automatic areas in the same document/view.
  - Preserve/locked subtrees remain skipped by automatic layout.
  - Diagnostics report partial/no-op layout through existing diagnostic codes where possible.
  - No unrelated roots or hidden visual-view nodes are unexpectedly restored, removed, or moved.
- Validation method:
  - Add/update layout or document store tests with a mixed manual/automatic fixture.
  - Run `npm run test:run`.

### FR-010: Keep visual-view state and source-model state consistent

- Requirement: layout-intent changes must respect existing visual-view semantics and must not delete source model data or corrupt view overrides.
- Rationale: saved visual views are a major product feature; canvas layout fixes must not collapse view/source separation.
- Acceptance criteria:
  - Movement, reparent, and Add child behavior operate on the active visual document according to existing command/view conventions.
  - Removing from active view and deleting from model remain separate behaviors.
  - Existing visual view tests pass without broad rewrites.
  - JSON export/import preserves Manual and Preserve flags as before.
  - No hidden nodes are made visible unless the user action already did so under existing behavior.
- Validation method:
  - Run existing visual view tests.
  - Add regression tests only where this task changes view behavior.
  - Run `npm run test:run`.

### FR-011: Maintain command transaction and history semantics

- Requirement: every user-intent operation modified by this task must commit as a single transaction and a single undo history entry.
- Rationale: adding policy side effects such as Manual conversion must not fragment undo/redo.
- Acceptance criteria:
  - Drag movement with Manual conversion creates one history entry.
  - Keyboard nudge with Manual conversion creates one history entry.
  - Numeric X/Y movement with Manual conversion creates one history entry.
  - Drag reparent with destination Manual conversion creates one history entry.
  - Add child under Manual parent creates one history entry.
  - Failed operations leave the document unchanged except for allowed diagnostics/status updates.
- Validation method:
  - Add/update command and store tests that inspect `past.length` and undo/redo behavior.
  - Run `npm run test:run`.

### FR-012: Preserve existing safety and validation constraints

- Requirement: existing hierarchy and selection constraints must continue to hold after the new policy and operations are implemented.
- Rationale: UX improvements cannot weaken model correctness.
- Acceptance criteria:
  - Text labels cannot become parents.
  - Reparenting cannot create cycles.
  - Multi-select movement remains constrained by existing selection rules.
  - Locked/preserved nodes cannot be resized through existing disabled controls.
  - Parent containment validation/repair behavior remains consistent with current domain rules.
  - Heatmap rendering, export rendering, and labels are not affected by this task.
- Validation method:
  - Existing validation, selection, command, layout, and canvas tests pass.
  - Add targeted tests only for new/changed behavior.

## 10. Non-Functional Requirements

### 10.1 Reliability Requirements

- Direct canvas actions must be deterministic for the same input document, selection, viewport, and drag/nudge delta.
- Failed policy checks must leave the committed document unchanged.
- Undo/redo must restore complete state for geometry and layout-intent side effects.
- The implementation must not rely on timing-sensitive UI state for committed layout decisions.

### 10.2 Performance Requirements

- Drag pointermove must remain transient and must not execute document transactions repeatedly during movement.
- Policy evaluation must be lightweight: use selected root ids, parent lookup, and existing indexes/helpers rather than full expensive layout unless already required.
- Add child under Manual parent may use a bounded search for an open slot; do not implement unbounded packing.
- Existing large-diagram behavior must not regress measurably due to policy checks.

### 10.3 Accessibility Requirements

- New guidance, notices, and diagnostics must be accessible through existing labels, roles, status regions, or diagnostic patterns.
- Keyboard movement behavior must match pointer movement behavior for Manual conversion.
- Existing keyboard navigation and focus return behavior must not regress.
- Do not rely on color alone to communicate Auto, Manual, Freeform, or Preserve state.

### 10.4 Maintainability Requirements

- Domain logic must remain in pure TypeScript modules without React imports.
- UI components should call domain helpers or command operations rather than reimplementing policy logic inline.
- Tests should assert behavior and diagnostic codes, not brittle exact copy except where copy itself is the requirement.
- Keep implementation additive and localized.

### 10.5 Backward Compatibility Requirements

- Existing saved documents must continue to import without migration if possible.
- Existing exports must remain compatible unless explicitly changed by this task; no export change is intended.
- Existing layout modes and node flags must remain supported.
- Existing public GitHub Pages/static deployment model must remain unchanged.

### 10.6 Security, Privacy, and Compliance Requirements

- Data classification assumptions: diagrams may contain confidential business architecture information, sensitive operating model details, system names, metadata, or other enterprise context. Treat document content and node metadata as sensitive.
- Authorization checks: no backend authorization is in scope because the core app is local-first. Do not add network calls or server-side behavior.
- Input validation: preserve existing document validation for imports and command transactions. New helpers must not bypass validation.
- Logging restrictions: do not log document content, node labels, descriptions, metadata, full JSON documents, user-entered text, or imported/exported payloads to console or external services.
- Audit requirements: no external audit logging is required for this local-first feature. Existing command history/undo labels are sufficient for local user feedback.
- PII handling: assume metadata may contain PII even though the product does not require it. Do not expose metadata in new diagnostics unless existing patterns already do and tests require it.
- Failure behavior: on failed movement/reparent/add-child operations, leave the document unchanged and surface a concise local diagnostic/status message.
- Backward compatibility: do not add required persisted fields unless accompanied by schema migration and round-trip tests.
- What must not be logged: node labels, descriptions, metadata, document JSON, imported file contents, export output, clipboard contents, and business capability hierarchy data.

## 11. Architecture and Design

Recommended design:

### Components involved

- Domain document model: existing `CapabilityDocument`, `CapabilityNode`, layout flags, hierarchy helpers.
- Domain commands: existing command transactions plus new or adjusted operations for movement, reparenting, and Add child intent.
- Domain layout policy/helper: new pure helper that determines the smallest layout-intent side effect for direct actions.
- Layout engine: existing engine remains in place; do not replace it.
- App stores: existing `useDocumentStore`, `useUiStore`, and `useTransientStore` continue to own committed document, UI state, and transient preview respectively.
- Canvas UI: existing pointer drag and context menu handlers consume command operations.
- Commands UI: existing keyboard nudge path consumes command operations.
- Inspector Layout tab: existing numeric X/Y movement and guidance copy are updated.
- Settings drawer: Freeform copy and auto-layout status are updated.
- Tests: domain/unit tests plus component/integration tests.

### Data flow

1. User starts a drag, keyboard nudge, numeric movement, reparent, or Add child action.
2. UI gathers action inputs: selected root ids, target parent if any, delta/position, active resolved document, and current mode.
3. UI calls a command operation or helper-backed command factory.
4. The policy determines whether any direct parent must become Manual to preserve user placement.
5. The command transaction applies geometry/model changes and Manual-state changes together.
6. Existing transaction validation and containment repair run.
7. Document store records a single history entry and autosave sees only the committed, validated document state.
8. UI optionally shows a non-modal notice/diagnostic if a parent was converted to Manual.

### Control flow

- Pointermove remains preview-only through transient state.
- Pointerup commits one transaction.
- Keyboard nudge commits one transaction per nudge event, matching current behavior, but with policy-backed Manual conversion when applicable.
- Numeric X/Y commit occurs on field commit/blur, matching current behavior, but with policy-backed Manual conversion when applicable.
- Add child chooses parent-mode behavior before attaching relayout metadata.

### State management

- Keep high-frequency preview state in `useTransientStore`.
- Keep committed model state in `useDocumentStore`.
- Keep selection, viewport, drawers, and notices in `useUiStore` or existing UI state patterns.
- Do not add a fourth store for this task.

### API boundaries

No HTTP API endpoints are involved. The only contracts are TypeScript functions, command transactions, diagnostics, UI props, and persisted JSON behavior.

### Integration points

- Existing `moveNodes` may become a lower-level primitive or be replaced at call sites by a new intent-aware operation.
- Existing `reparentNode` may remain a lower-level primitive; drag reparent should use an intent-aware wrapper if needed.
- Existing `addChild` may inspect parent mode to decide relayout behavior.
- Existing `layoutDocument` behavior in Freeform should remain no-op; UI copy should match it.

### Error handling

- Policy-rejected operations should emit existing diagnostics/status notices and leave the document unchanged.
- Existing transaction validation should remain the final guardrail.
- If a target parent is missing after drag, fail safely without committing.
- If a target parent is text or would create a cycle, preserve existing rejection behavior.

### Validation strategy

- Unit-test pure policy decisions.
- Unit-test command transaction outcomes.
- Component-test canvas and inspector workflows.
- Keep e2e as smoke-level unless the repository already has a focused e2e pattern for this behavior.

### Dependency choices

- Do not add dependencies for this task.
- Use existing TypeScript, Vitest, Testing Library, and Playwright infrastructure.

### Alternatives considered

- Alternative: add a modal confirmation before converting a parent to Manual.
  - Rejected because it interrupts direct manipulation and makes frequent modeling actions slow.
- Alternative: convert the whole document/view to Freeform after any direct drag.
  - Rejected because it destroys automatic layout usefulness beyond the affected area.
- Alternative: leave behavior unchanged and only update help text.
  - Rejected because the core issue is behavioral correctness, not just documentation.
- Alternative: rewrite layout engine to understand every direct edit as constraints.
  - Rejected as too large for this task.

## 12. Interfaces and Contracts

No backend API endpoints, request shapes, response shapes, environment variables, or database migrations are expected.

### Type/interface contract to introduce or confirm

Codex should confirm actual naming during discovery. A conceptual shape is:

```ts
type CanvasLayoutAction =
  | "move"
  | "keyboard-nudge"
  | "numeric-position"
  | "reparent"
  | "add-child"
  | "resize"
  | "auto-layout";

interface CanvasLayoutIntentInput {
  doc: CapabilityDocument;
  action: CanvasLayoutAction;
  rootNodeIds: NodeId[];
  targetParentId?: NodeId | null;
}

interface CanvasLayoutIntentResult {
  allowed: boolean;
  manualParentIdsToEnable: NodeId[];
  diagnosticCode?: string;
  notice?: string;
  skipAutoRelayout?: boolean;
}
```

The exact names can differ. The required contract is observable behavior, purity, and test coverage.

### Command contracts

Codex may implement one of these patterns after discovery:

- Add intent-aware command factories such as `moveNodesWithLayoutIntent`, `reparentNodeWithLayoutIntent`, and/or `addChildWithLayoutIntent`.
- Or update existing command factories if doing so is safe and all call sites still behave correctly.

Whichever pattern is chosen:

- A direct move with Manual conversion must be one transaction.
- Drag reparent with Manual conversion must be one transaction.
- Add child under Manual parent must be one transaction.
- Diagnostics must use existing `Diagnostic` conventions.
- Tests should assert diagnostic codes where practical.

### Events

No new browser events are required. Existing pointer, keyboard, and field commit events should be reused.

### Configuration keys

No new environment variables or external configuration keys are required.

### Database changes

No database or IndexedDB schema migration is expected. Existing document fields should be sufficient.

### Feature flags

No feature flag is required unless Codex discovers an existing feature flag pattern that must be used for behavior changes. If a feature flag is introduced, it must default to the new behavior only when tests pass and must be documented here.

### Error contracts

- Missing node: use existing missing-node diagnostics where possible.
- Invalid parent/text-label parent: preserve existing diagnostics.
- Cycle: preserve existing diagnostics.
- Freeform auto layout no-op: preserve or extend `free-layout-preserved` diagnostic.
- Manual conversion notice: use a stable diagnostic/status code such as `manual-positioning-enabled-by-move` if adding a new diagnostic. Exact code is up to Codex but must be tested.

### Validation rules

- The hierarchy remains acyclic.
- Text labels cannot be parents.
- Coordinates and dimensions remain finite.
- Heatmap values remain unchanged by this task.
- Parent containment behavior follows existing domain rules.
- Manual and Preserve flags round-trip through existing JSON import/export.

## 13. Detailed Implementation Plan

### Milestone 1: Repository Discovery and Plan Confirmation

- Goal: verify repository structure, conventions, and exact files before editing.
- Files or areas to inspect:
  - `AGENTS.md`
  - `README.md`
  - `package.json`
  - `docs/README.md`, `docs/domain-model.md`, `docs/interaction-contracts.md`, `docs/agent-implementation-brief.md`
  - `src/domain/document/`
  - `src/domain/layout/`
  - `src/domain/commands/`
  - `src/domain/visual/`
  - `src/app/stores/`
  - `src/features/canvas/`
  - `src/features/commands/`
  - `src/features/inspector/`
  - `src/features/settings/`
  - existing tests
- Files or areas likely to change: none yet, except this spec section updates.
- Concrete implementation steps:
  1. Read repository instructions and package scripts.
  2. Confirm current layout mode names and command/store conventions.
  3. Confirm how visual commands are applied to source model and active view.
  4. Identify current tests that cover movement, reparent, Add child, layout, settings, and inspector.
  5. Update this Repository Discovery section with actual findings.
  6. Confirm or revise the implementation plan.
- Validation commands:
  - No code validation required yet.
  - Optionally run `npm run test:run -- --runInBand` only if repo conventions support it; otherwise wait until coding milestones.
- Expected result: Codex has a repo-specific plan and no fabricated paths remain.
- Acceptance criteria covered: supports all FRs indirectly.
- Rollback or recovery notes: no code changes should be made in this milestone except updating this spec.

### Milestone 2: Add the UX/correctness review artifact and pure policy tests

- Goal: document the intended behavior and create a pure, testable policy contract.
- Files or areas to inspect:
  - `docs/`
  - `src/domain/layout/`
  - `src/domain/commands/`
  - existing layout/command test patterns
- Files or areas likely to change:
  - new docs file under `docs/`
  - new helper file under `src/domain/layout/` or `src/domain/commands/`
  - new/updated unit test file near the helper
- Concrete implementation steps:
  1. Add the docs review artifact from FR-001.
  2. Implement the pure policy/helper from FR-002.
  3. Add focused unit tests for policy decisions.
  4. Keep helper naming aligned with repo conventions.
- Validation commands:
  - Run targeted Vitest command for the new helper tests if available.
  - Run `npm run typecheck` if changes affect exported types.
- Expected result: review doc exists; policy helper tests pass.
- Acceptance criteria covered: FR-001, FR-002.
- Rollback or recovery notes: if the helper shape conflicts with repo conventions, keep the docs file and adapt the helper to the closest existing command/policy module pattern.

### Milestone 3: Implement intent-aware movement and reparent commands

- Goal: ensure direct movement and drag reparent preserve manual layout intent in one transaction.
- Files or areas to inspect:
  - `src/domain/commands/geometryOps.ts`
  - `src/domain/commands/capabilityOps.ts`
  - `src/domain/commands/operations.ts`
  - `src/features/canvas/useCanvasNodeInteractions.ts`
  - `src/features/commands/useEditorActions.ts`
  - `src/features/inspector/LayoutTab.tsx`
  - command/store tests
- Files or areas likely to change:
  - `src/domain/commands/geometryOps.ts`
  - possibly new command helper file
  - `src/features/canvas/useCanvasNodeInteractions.ts`
  - `src/features/commands/useEditorActions.ts`
  - `src/features/inspector/LayoutTab.tsx`
  - tests
- Concrete implementation steps:
  1. Decide whether to add new command factories or adapt existing `moveNodes`/`reparentNode` call paths.
  2. Ensure movement call sites pass selected root node ids, not descendant-expanded ids, for policy decisions.
  3. Preserve descendant preview behavior during drag.
  4. Commit Manual conversion and geometry/model changes in one transaction.
  5. Preserve existing validation for invalid reparenting.
  6. Add tests for drag, keyboard nudge, numeric X/Y, reparent, undo, and redo.
- Validation commands:
  - Run targeted command/canvas/inspector tests.
  - Run `npm run test:run` if feasible after this milestone.
- Expected result: direct movement and reparenting preserve placement intent and undo cleanly.
- Acceptance criteria covered: FR-003, FR-004, FR-008, FR-010, FR-011, FR-012.
- Rollback or recovery notes: if adapting `moveNodes` creates broad regressions, restore it as a primitive and introduce a new intent-aware command used only by UI movement paths.

### Milestone 4: Implement parent-mode-aware Add child

- Goal: prevent Add child under Manual parents from rearranging existing manually placed siblings.
- Files or areas to inspect:
  - `src/domain/commands/capabilityOps.ts`
  - `src/domain/layout/`
  - context menu and command actions that call `addChild`
  - command and component tests
- Files or areas likely to change:
  - `src/domain/commands/capabilityOps.ts`
  - possibly a helper for manual child placement
  - tests
- Concrete implementation steps:
  1. Detect selected parent’s effective Manual positioning state.
  2. For automatic parents, preserve current automatic relayout behavior.
  3. For Manual parents, place the new child deterministically without moving existing children.
  4. Use existing grid and spacing settings where possible.
  5. Keep text-label parent rejection unchanged.
  6. Add tests for automatic parent and Manual parent cases.
- Validation commands:
  - Run targeted command tests.
  - Run `npm run test:run` if feasible.
- Expected result: Add child under Manual parent preserves siblings and remains undoable.
- Acceptance criteria covered: FR-005, FR-010, FR-011, FR-012.
- Rollback or recovery notes: if deterministic non-overlap placement becomes too large, implement deterministic placement and document overlap limitations as allowed by FR-005.

### Milestone 5: Update Freeform and Layout tab UX copy/feedback

- Goal: align UI messaging with actual layout behavior and explain Auto/Manual/Preserve clearly.
- Files or areas to inspect:
  - `src/features/settings/SettingsDrawer.tsx`
  - `src/features/inspector/LayoutTab.tsx`
  - diagnostics/status rendering
  - settings/inspector tests
- Files or areas likely to change:
  - `src/features/settings/SettingsDrawer.tsx`
  - `src/features/inspector/LayoutTab.tsx`
  - tests
- Concrete implementation steps:
  1. Update Freeform help text to match no-op preservation behavior.
  2. Add or adjust status/diagnostic for Apply auto layout in Freeform.
  3. Add concise Layout tab guidance for Auto, Manual, and Preserve.
  4. Ensure guidance is accessible and uses existing style patterns.
  5. Add/update tests for visible or accessible text and diagnostics.
- Validation commands:
  - Run targeted component tests.
  - Run `npm run test:run` if feasible.
- Expected result: users can understand mode semantics from the UI without reading docs.
- Acceptance criteria covered: FR-006, FR-007, FR-008.
- Rollback or recovery notes: if tests are too brittle for exact text, assert stable labels/ARIA descriptions and diagnostic codes while keeping copy manually reviewable.

### Milestone 6: Full validation and final diff review

- Goal: verify the complete implementation and ensure no out-of-scope changes were introduced.
- Files or areas to inspect:
  - all changed files
  - test output
  - final git diff
- Files or areas likely to change: only updates to this spec sections for progress/outcomes.
- Concrete implementation steps:
  1. Run targeted tests that were added/changed.
  2. Run `npm run lint`.
  3. Run `npm run typecheck`.
  4. Run `npm run test:run`.
  5. Run `npm run build`.
  6. Run `npm run test:e2e` if available and practical.
  7. Execute the manual smoke test script.
  8. Review final diff for unrelated files, sensitive logging, or broad architectural changes.
  9. Update Progress, Discoveries, Decision Log, and Outcomes and Retrospective.
- Validation commands:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test:run`
  - `npm run build`
  - `npm run test:e2e` if available
- Expected result: all relevant validation passes or any environment-only failures are documented with evidence.
- Acceptance criteria covered: all FRs and NFRs.
- Rollback or recovery notes: if full validation reveals broad regressions, revert the most invasive change first, keep the policy/doc changes if safe, and document the partial result.

## 14. Testing and Validation Plan

### Unit tests

- What to test: pure policy/helper decisions for automatic, Freeform, Manual parent, preserved/locked, root movement, child movement, multi-select, and reparent.
- Where to add or update the test: near the helper under `src/domain/layout/` or `src/domain/commands/` according to repo convention.
- Command to run: discover targeted Vitest syntax; final full command is `npm run test:run`.
- Expected result: deterministic policy output with no document mutation.
- Requirements covered: FR-002.

### Command transaction tests

- What to test: movement, keyboard-equivalent movement, numeric movement command path if represented in domain, reparent, Add child under Manual parent, undo/redo history entries.
- Where to add or update the test: likely `src/domain/commands/commands.test.ts`, `src/app/stores/documentStore.layout.test.ts`, or equivalent discovered test files.
- Command to run: targeted Vitest command and `npm run test:run`.
- Expected result: document geometry, parent ids, Manual flags, and history behave as specified.
- Requirements covered: FR-003, FR-004, FR-005, FR-011, FR-012.

### Component/integration tests

- What to test: pointer drag, keyboard nudge, Layout tab numeric X/Y movement, Layout tab guidance, Settings drawer Freeform help/status, non-modal notice/diagnostic.
- Where to add or update the test: likely `src/features/editor/editor.canvas.test.tsx`, `src/features/editor/editor.inspector.test.tsx`, or settings tests discovered by Codex.
- Command to run: targeted Vitest command and `npm run test:run`.
- Expected result: UI workflows show expected state changes and accessible notices.
- Requirements covered: FR-003, FR-004, FR-006, FR-007, FR-008.

### End-to-end tests

- What to test: smoke-level modeling flow if existing Playwright patterns make this cheap: create/arrange child, switch layout modes, apply auto layout, verify no obvious regression.
- Where to add or update the test: `tests/e2e/` only if existing coverage pattern supports it without excessive flakiness.
- Command to run: `npm run test:e2e`.
- Expected result: smoke test passes in available environment.
- Requirements covered: FR-003 through FR-009.

### Manual smoke tests

- What to test: user-visible action semantics in a running dev build.
- Where to test: local app via `npm run dev`.
- Command to run: manual script in section 15.
- Expected result: no surprising relayout; notices and guidance visible.
- Requirements covered: all user-visible FRs.

### Regression tests

- What to test: existing import/export, visual views, heatmap, selection rules, validation, and layout tests continue passing.
- Where to add or update the test: existing test suite.
- Command to run: `npm run test:run`, `npm run build`.
- Expected result: no unrelated behavior changed.
- Requirements covered: FR-010, FR-012, NFR backward compatibility.

### Security tests

- What to test: no new logs of document content or metadata; no network calls or telemetry added.
- Where to add or update the test: manual diff review; automated test only if repo has a logging/network test pattern.
- Command to run: `npm run lint`, manual grep/review.
- Expected result: no sensitive content logging and no external service usage.
- Requirements covered: NFR security/privacy/compliance.

### Accessibility tests

- What to test: new notices/guidance have accessible roles/labels and keyboard workflows still pass.
- Where to add or update the test: component tests using Testing Library; e2e if existing accessibility checks exist.
- Command to run: `npm run test:run`.
- Expected result: keyboard and focus behavior remain valid.
- Requirements covered: NFR accessibility.

### Performance checks

- What to test: drag preview does not commit transactions during pointermove; policy helper does not perform expensive layout during high-frequency events.
- Where to add or update the test: component/unit tests if feasible; otherwise manual diff review.
- Command to run: `npm run test:run`; manual review of drag path.
- Expected result: transactions commit only on pointerup or command execution, not on every pointermove.
- Requirements covered: NFR performance.

If any validation command is unknown or unavailable, Codex must discover the correct command and update this section before coding or before final validation.

## 15. Manual Smoke Test Script

### Preconditions

- Dependencies installed with `npm install` if needed.
- App runs locally with `npm run dev`.
- Use a fresh or known sample document. Export important local work first because this app uses local browser persistence.
- Browser dev console should remain free of document-content logging.

### Test data

Use the repository’s default/sample document if available. Otherwise create:

- One root: `Retail Banking`.
- One parent under it: `Customer`.
- Three children under `Customer`: `Digital Onboarding`, `Branch Onboarding`, `Servicing`.
- One second parent under root: `Risk` with two children.

### Steps and expected results

1. Open the app.
   - Expected: canvas loads; no unexpected console errors.

2. Confirm the active layout mode is an automatic mode such as Uniform, Adaptive, Flow, or Balanced.
   - Expected: Settings shows the selected automatic layout mode.

3. Select the `Customer` parent and open the Layout tab.
   - Expected: Auto, Manual, and Preserve controls are visible; guidance explains that Manual applies to children of the selected parent.

4. Drag `Digital Onboarding` to a new position inside `Customer`.
   - Expected: drag preview is immediate; on pointer-up the node remains at the placed position; a non-modal notice or diagnostic says the parent was switched to Manual to preserve placement.

5. With `Customer` selected, inspect the Layout tab.
   - Expected: Manual is active for `Customer`.

6. Apply auto layout.
   - Expected: children inside `Customer` do not move; eligible nodes elsewhere may move depending on layout; diagnostics/status indicate partial layout if applicable.

7. Undo once.
   - Expected: `Digital Onboarding` returns to its previous position and `Customer` returns to its previous Manual/Auto state.

8. Redo once.
   - Expected: movement and Manual conversion are both reapplied.

9. Use arrow-key nudge on `Branch Onboarding` while its parent is Auto in a reset or new parent scenario.
   - Expected: node moves by grid step; its parent becomes Manual; one undo step reverts both.

10. Edit X or Y in the Layout tab for a child under an Auto parent.
    - Expected: node moves to the committed coordinate; direct parent becomes Manual; one undo step reverts both.

11. Drag `Servicing` into the `Risk` parent.
    - Expected: node is reparented, drop position is preserved, `Risk` becomes Manual if it was not already Manual, and invalid targets remain rejected.

12. Select a Manual parent and choose Add child.
    - Expected: existing children do not move; the new child appears in a deterministic position inside the parent; undo removes the new child.

13. Switch layout mode to Freeform and click Apply auto layout.
    - Expected: no nodes move; UI status/diagnostics explain that Freeform preserves positions and that an automatic mode is required to rearrange.

14. Toggle Preserve on a subtree and apply auto layout.
    - Expected: preserved subtree does not move or resize through automatic layout; existing resize restrictions remain.

15. Export JSON, import it again if safe in the workflow.
    - Expected: Manual and Preserve states persist; visible layout remains consistent.

### Cleanup steps

- Undo changes or reload from the exported JSON backup.
- Clear local saved data only if using a disposable test document.
- Stop the dev server.

## 16. Migration, Rollout, and Backward Compatibility

No database migration is expected because this is a local-first static browser app and the necessary layout state appears to already exist in the document model.

Database migration requirements:

- None expected.
- If Codex discovers an IndexedDB schema or document migration is required, it must document why, implement a deterministic migration, and add round-trip tests.

Data migration requirements:

- None expected.
- Existing JSON documents should continue to parse/import.

Feature flag strategy:

- No feature flag is required.
- Use a feature flag only if the repository already has a pattern and Codex discovers a concrete rollout reason.

Safe rollout approach:

- Keep changes additive and localized.
- Preserve existing command transaction and layout engine behavior where possible.
- Validate with unit/component tests before full build.

Backward compatibility constraints:

- Existing documents must keep importing/exporting.
- Existing visual views must keep resolving.
- Existing layout modes must remain valid.
- Existing commands, keyboard shortcuts, and context menu actions must remain available unless explicitly adjusted by this spec.

Rollback plan:

- Revert intent-aware command call-site changes first if movement/reparent regressions appear.
- Keep the review doc and pure policy helper only if they do not affect runtime behavior.
- Re-run validation after rollback.

How to verify old behavior still works:

- Run existing tests.
- Manually verify Add root, Add child under Auto parent, drag, resize, reparent, apply auto layout, visual view switching, Remove from active view, Delete from model, JSON export/import, and undo/redo.

## 17. Idempotence and Recovery

Steps safe to repeat:

- Running tests, lint, typecheck, and build.
- Updating the spec’s Progress, Discoveries, Decision Log, and Outcomes sections.
- Re-running manual smoke tests on a disposable document.
- Re-applying additive documentation changes.

Steps that are destructive or risky:

- Changing document schema or migrations.
- Broadly altering `moveNodes` semantics without checking all call sites.
- Changing `reparentNode` behavior for non-drag call sites without tests.
- Moving transient drag state into committed stores.
- Running local storage clearing on a browser profile with real user data.

How to recover from partial implementation:

- Use git diff to identify runtime changes separate from docs/tests.
- Revert the most invasive runtime changes first.
- Preserve tests that describe intended behavior if they remain valid.
- If validation fails, isolate by running targeted tests for domain policy, commands, and UI separately.

How to clean up temporary files, generated files, or test data:

- Do not commit generated build output unless the repository already tracks it.
- Remove temporary scratch files and test artifacts.
- Do not commit local browser storage or Playwright artifacts unless existing conventions require specific snapshots.

What to do if validation fails:

- Identify whether the failure is an existing baseline failure, an environment issue, or a regression introduced by this task.
- Document the failure in Discoveries During Implementation.
- Fix regressions caused by this task before finalizing.
- For environment-only failures, record command, output summary, and why it could not be resolved locally.

What not to retry blindly:

- Do not repeatedly run flaky e2e tests without inspecting failure output.
- Do not force schema changes to make tests pass.
- Do not silence diagnostics or tests without preserving user-visible correctness.
- Do not suppress lint/typecheck errors without fixing root cause.

## 18. Observability and Operations

This is a local-first browser feature. No backend operational telemetry is in scope.

What should be observable after implementation:

- Local diagnostics/status should indicate Freeform no-op auto layout where applicable.
- Local non-modal notice/status should indicate when a parent was switched to Manual due to direct placement.
- Existing diagnostics UI should continue to show layout errors/warnings/info.
- Undo history labels should remain human-readable and should not fragment a single user action.

Logs:

- Do not add console logs for normal operation.
- If temporary logs are used during development, remove them before final response.

Metrics/traces/alerts/dashboards:

- Not applicable.
- Do not add telemetry.

Audit records:

- Not applicable beyond local undo/redo history and diagnostics.

Error messages:

- Keep messages concise.
- Prefer stable diagnostic codes for tests.
- Do not include sensitive node labels, descriptions, metadata, or full document JSON unless existing diagnostics already intentionally identify a node id.

What must not be logged:

- Document JSON.
- Node labels.
- Node descriptions.
- Node metadata.
- Imported file contents.
- Export contents.
- Clipboard contents.
- Business capability hierarchy details.

## 19. Risks and Mitigations

### Risk 1: Over-converting layout state to Manual

- Impact: automatic layout becomes less useful because too many parents are skipped.
- Mitigation: convert only the direct arranging parent of the selected root node(s), not descendants or ancestors.
- How to validate mitigation: tests for moving a parent with descendants must show only the parent’s own direct parent changes Manual state.

### Risk 2: Undo/redo splits geometry and Manual-state changes

- Impact: users need multiple undo steps to reverse one action, which feels broken.
- Mitigation: group geometry/model change and Manual conversion into one transaction.
- How to validate mitigation: tests inspect one history entry and verify undo/redo restores both geometry and Manual flags.

### Risk 3: Visual-view state diverges from source-model state

- Impact: saved views may display stale or incorrect Manual/geometry overrides.
- Mitigation: follow existing visual command conventions and use `resolveVisualDocument`/`applyResolvedVisualDocument` patterns where applicable.
- How to validate mitigation: existing visual view tests pass; add regression tests for active-view movement if needed.

### Risk 4: Drag performance regresses

- Impact: large diagrams feel laggy during drag.
- Mitigation: evaluate policy at commit time, not on every pointermove; keep preview transient.
- How to validate mitigation: code review confirms no document transactions during pointermove; existing canvas tests pass.

### Risk 5: Add child under Manual parent introduces overlaps

- Impact: users still need to repair layout manually.
- Mitigation: use deterministic bounded placement with existing grid and gap settings; do not run full auto layout for Manual parent.
- How to validate mitigation: tests with common child counts show existing siblings unchanged and new child non-overlapping where feasible.

### Risk 6: Freeform copy and behavior become inconsistent

- Impact: users mistrust Apply auto layout or layout mode names.
- Mitigation: align Settings help text, diagnostics, and layout tests with actual engine behavior.
- How to validate mitigation: test that Freeform Apply auto layout emits no patches and UI text communicates preservation.

### Risk 7: Locked/preserved semantics are weakened

- Impact: preserved layouts may change unexpectedly.
- Mitigation: do not change layout engine locked behavior; preserve existing resize restrictions; treat locked Add child edge cases conservatively.
- How to validate mitigation: locked layout tests pass and manual smoke test verifies preserved subtree is skipped.

## 20. Progress

Codex must add timestamps and notes as work proceeds.

- [ ] Read full spec.
- [ ] Inspect repository instructions.
- [ ] Inspect repository structure.
- [ ] Discover build, test, lint, and typecheck commands.
- [ ] Update Repository Discovery Instructions with actual findings.
- [ ] Confirm or revise implementation plan.
- [ ] Implement Milestone 1.
- [ ] Validate Milestone 1.
- [ ] Implement Milestone 2.
- [ ] Validate Milestone 2.
- [ ] Implement Milestone 3.
- [ ] Validate Milestone 3.
- [ ] Implement Milestone 4.
- [ ] Validate Milestone 4.
- [ ] Implement Milestone 5.
- [ ] Validate Milestone 5.
- [ ] Implement remaining milestones.
- [ ] Run full validation suite.
- [ ] Run manual smoke test.
- [ ] Review final diff for unintended changes.
- [ ] Update Decision Log.
- [ ] Update Outcomes and Retrospective.
- [ ] Produce final implementation summary.

## 21. Discoveries During Implementation

- None yet.

Codex must update this section when it finds:

- Unexpected repository structure.
- Missing commands.
- Failing existing tests.
- Undocumented conventions.
- Conflicts with this spec.
- Dependency constraints.
- Better implementation paths.

## 22. Decision Log

### Decision 1

- Decision: Target the current repository’s local-first modeling implementation rather than changing product positioning.
- Rationale: the discovered repository is an implemented modeling tool with code paths for canvas actions, layout modes, manual positioning, saved visual views, and command transactions.
- Alternatives considered: treating Capability Canvas only as a visual publishing layer; rejected for this task because the current user request explicitly concerns modeling actions on the canvas and the repository supports direct modeling.
- Date/Author: Spec generation / ChatGPT Pro

### Decision 2

- Decision: Use the smallest affected scope for preserving direct movement intent: the direct parent that arranges the moved selected root node(s).
- Rationale: Manual positioning is modeled on the parent whose children are arranged. Converting broader scopes would reduce automatic layout usefulness.
- Alternatives considered: convert the whole view to Freeform; convert all ancestors; do not convert and only warn. These were rejected because they are either too broad or do not preserve direct placement reliably.
- Date/Author: Spec generation / ChatGPT Pro

### Decision 3

- Decision: Keep direct movement non-modal and show concise feedback when conversion to Manual occurs.
- Rationale: modal confirmation during drag/nudge would slow modeling and contradict direct manipulation UX.
- Alternatives considered: blocking confirmation dialog; silent conversion. Blocking confirmation was rejected as disruptive; silent conversion was rejected because users should understand why the parent changed.
- Date/Author: Spec generation / ChatGPT Pro

### Decision 4

- Decision: Do not replace the layout engine or introduce a new graph/canvas library.
- Rationale: existing domain docs and code already establish a custom hierarchy-aware layout engine with manual and locked preservation; this task is a targeted correctness pass.
- Alternatives considered: adopting a graph editor/layout library. Rejected as too invasive and out of scope.
- Date/Author: Spec generation / ChatGPT Pro

### Decision 5

- Decision: Prefer existing persisted fields and avoid schema migration.
- Rationale: layout mode, Manual positioning, Preserve/locked state, user-arranged metadata, and visual view overrides already exist.
- Alternatives considered: adding new persisted layout-intent fields. Rejected unless Codex discovers an unavoidable need.
- Date/Author: Spec generation / ChatGPT Pro

### Decision 6

- Decision: Add a repository documentation artifact for the UX/correctness review.
- Rationale: the requested work is a deep UX/correctness review as well as an implementation handoff; future agents should have a durable matrix in the repo.
- Alternatives considered: only implement code changes. Rejected because it would lose the reviewed action semantics and make future behavior harder to maintain.
- Date/Author: Spec generation / ChatGPT Pro

Codex must append implementation-time decisions here.

## 23. Outcomes and Retrospective

- Not started.

Codex must update this section after implementation.

At completion it must include:

- What was implemented.
- Files changed.
- What changed from the original plan.
- Validation commands run.
- Validation results.
- Manual smoke test result.
- Remaining risks.
- Follow-up recommendations.

## 24. Final Acceptance Checklist

Codex must satisfy this checklist before stopping:

- All in-scope functional requirements are implemented.
- Out-of-scope items were not implemented.
- All acceptance criteria are satisfied.
- Repository instructions were followed.
- Build passes.
- Tests pass.
- Lint passes, if applicable.
- Typecheck passes, if applicable.
- Manual smoke test passes, if applicable.
- Security/privacy/compliance requirements are satisfied or explicitly marked not applicable.
- No sensitive data is logged.
- No unrelated files were changed.
- Final diff was reviewed.
- Progress section was updated.
- Discoveries section was updated.
- Decision Log was updated.
- Outcomes and Retrospective section was updated.
- Final Codex summary includes changed files, commands run, results, risks, and follow-ups.

## 25. Codex Final Response Requirements

Codex’s final response must include:

- Summary of implementation.
- Changed files.
- Validation commands run.
- Results of each command.
- Manual smoke test result, if applicable.
- Deviations from the spec.
- Risks or limitations.
- Suggested next steps.
