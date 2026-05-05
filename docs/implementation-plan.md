# Capability Canvas — Implementation Plan

## Context

Capability Canvas is a greenfield local-first browser app for hierarchical capability modeling — nested business capabilities, domains, services, ownership areas. The repo at `C:\Users\thoma\Projects\capability-canvas` currently contains only `docs/` (six design documents) and `.git/`. No code yet.

**Why we are building it.** The product brief calls out a specific gap: existing diagramming tools are edge-first (graph editors) or freeform (Visio/draw.io), but capability modeling is *containment-first* — parents visually contain children, hierarchy is the primary semantic, and users alternate between trusting auto-layout and asserting manual editorial control. The product must keep hierarchy invariants valid at all times, preserve manual/locked layouts across save/load, and remain usable at ~1,000 nodes. It must work fully offline.

**Hard constraints (from `docs/agent-implementation-brief.md`).** Local-first; versioned JSON round-trip; hierarchy invariants always valid; manual + locked layouts preserved through save/load; heatmap visual fidelity across all export targets; file-based import/export sharing; ~1,000-node responsiveness; undo/redo for every model-changing op.

**Scope decisions (confirmed).** v1 includes text labels, draw.io export, ArchiMate export, and File System Access API. All required exports land before ship: JSON, SVG, HTML, PowerPoint, draw.io, ArchiMate. Stack follows `docs/tech-stack.md` defaults: TypeScript strict + React + Vite + Tailwind + Zustand + Zod + idb + vite-plugin-pwa + Vitest + Testing Library + Playwright + pptxgenjs + Lucide.

**Intended outcome.** A static-deployed PWA that an enterprise architect can open offline, build a 3-level capability hierarchy in minutes, lock parts of it, share by JSON export, and export to PowerPoint with visual fidelity — without losing any manual placement to an automatic relayout.

---

## Architectural Spine

These decisions are locked across all milestones. They are the spine the plan hangs from.

### Layered ownership (per `docs/tech-stack.md`)

```
domain/        pure TS, no React imports, framework-free
  document/    types, normalized model, JSON adapter, Zod schemas, migrations
  hierarchy/   tree ops, traversal, validation
  selection/   selection rules, multi-selection constraints
  commands/    Command, Transaction, undo/redo infrastructure
  layout/      pure deterministic layout engine, returns patches
  validation/  diagnostics for malformed/import data

features/      React-aware feature shells
  canvas/      renderer, viewport, pan/zoom, hit-testing, render indexes
  inspector/   selection-aware property panel
  outline/     hierarchy tree navigator
  heatmap/     palette, legend, CSV import, value resolver
  import-export/ adapters: JSON, SVG, HTML, PPTX, drawio, archimate
  viewer/      read-only route

shared/        components, hooks, design tokens, utils
app/           routes, shell, providers
test/          fixtures (incl. 1k-node), helpers
```

Domain code never imports React. Adapters never import the renderer. Renderer never mutates document state directly.

### Data model

Internal canonical shape (different from wire format):
- `nodesById: Map<NodeId, Node>` for direct lookup.
- `childrenByParentId: Map<NodeId | null, NodeId[]>` for ordered hierarchy traversal (root parent = `null`).
- Settings, heatmap, layout metadata as separate slices.

Wire format (`docs/domain-model.md` §"Document Format") is a thin boundary translation. **Never let the internal model collapse into the wire format** — document the boundary explicitly in code.

### Commands and undo

Three rules that prevent M5 from being a refactor:

```ts
interface Command<TArgs = unknown> {
  type: string;
  args: TArgs;
  apply(doc: Document): { doc: Document; inverse: Command };
  coalesceKey?: (args: TArgs) => string | null;
}

interface Transaction {
  commands: Command[];
  label: string;
  meta?: { source: 'drag' | 'bulk' | 'edit' | 'import' };
}
```

1. **Transactions, not commands, are the undo unit.** A drag, a 20-node align, and a subtree paste are each one transaction. Bulk ops in M5 compose primitives written in M2 — no new infra required.
2. **Coalescing at commit time, not emit time.** Pointermove emits N `MoveNode` commands; only the last commits a transaction; intermediate previews live in the transient store. `coalesceKey` collapses release-then-redrag inside a short window into one undo entry.
3. **Commands return new immutable documents** (Immer under the hood is acceptable). Inverse computation is patch-based. Failed ops cannot leave invalid state because they return `{ doc: priorDoc, ... }` on rejection.

### Three-store separation (locked at M4)

- **Document store** — committed model + undo/redo stacks + persistence lifecycle. Autosave reads from here only.
- **UI store** — selection, viewport (pan/zoom/fit), panel layout. Persisted to LocalStorage.
- **Transient store** — drag preview, resize preview, reparent hover, selection box. **Never persisted, never autosaved.** This is what prevents the "autosave persists half-applied drag" failure mode called out in the docs.

### Render indexes (built at M4, not retrofitted)

Memoized selectors with explicit invalidation keys: depth map, descendants set, bounds cache, visible-set predicate (viewport ∩ bounds), z-order list, selection membership set. These are how selectors are *shaped* — retrofitting them in a perf milestone means rewriting every selector and memoized renderer. They are not optimization; they are architecture.

### Single fill resolver (locked at M4, used everywhere from M7+)

`resolveNodeFill(node, heatmapState, palette, settings) -> Color` is the single source of truth for what color a node renders as. The editor renderer, SVG export, HTML export, PPTX export, and viewer route all call it. This is the only way to keep heatmap fidelity consistent across export targets — a failure mode flagged explicitly in `docs/agent-implementation-brief.md`.

---

## Sequencing rationale

Depth-first, not walking-skeleton. The single highest-risk failure mode in the docs is "layout overwriting manual positions" — and walking-skeleton tempts you to ship a canvas calling a stub layout, then retrofit preservation rules into an API the UI has already committed against. Build the layout engine with locked/manual preservation tests **before** any canvas DOM exists. The product brief's "Layout integrity" non-negotiable wins over the optics of an early demo.

The 10-step sequence in `docs/agent-implementation-brief.md` is followed, grouped into 10 milestones, with three deliberate adjustments: (a) M1 split into model-and-schema vs commands-and-ops, (b) render indexes baked in at M4 (renderer birth) not deferred to a final perf pass, (c) Playwright stood up at M4 for the memoization-vs-interaction-state bug class.

---

## Milestones

### M0 — Scaffolding

**Scope.** Vite + React + TS strict; Tailwind + minimal design-token layer; Lucide; ESLint zero-warning + Prettier; Vitest + Testing Library; Playwright config (no tests yet); folder structure above; `npm scripts` per `docs/tech-stack.md` §Tooling; CI running lint + typecheck + test:run + build.

**Key files.** `vite.config.ts`, `tsconfig.json` (strict), `tailwind.config.ts`, `playwright.config.ts`, `.github/workflows/ci.yml`, `package.json`, empty stub modules in each `src/domain/*/`.

**Exit.** `npm run lint && npm run typecheck && npm run test:run && npm run build && npm run test:e2e` all green on a hello-world commit. CI passes.

**Risk.** Premature dependencies. Do not add `idb`, `pptxgenjs`, `vite-plugin-pwa`, `zustand`, or `zod` until the milestone that uses them — adding now creates unused-import drift.

---

### M1 — Document model, schema, validation, JSON I/O

**Scope.** Pure TS in `src/domain/document/` and `src/domain/validation/`. Internal normalized model (`nodesById`, `childrenByParentId`, ordered sibling arrays). Zod schemas for the document v1.0 wire format per `docs/domain-model.md`: document, node, settings, heatmap, layout metadata. Migration framework (`migrate(json) -> Document`) — even though only v1.0 exists, the framework lands now. JSON import/export adapters as the boundary translation. Repair path for non-destructive issues. Diagnostics for duplicate ids, missing parents, cycles, invalid geometry, out-of-range heatmap values.

**Key files.**
- `src/domain/document/types.ts` — internal `Document`, `Node`, settings, heatmap, layout-meta types.
- `src/domain/document/schema.ts` — Zod schemas for wire format.
- `src/domain/document/migrate.ts` — versioned migration registry.
- `src/domain/document/serialize.ts` — internal → wire.
- `src/domain/document/parse.ts` — wire → internal (with validation + repair).
- `src/domain/validation/diagnostics.ts` — structured diagnostic types.
- `src/test/fixtures/` — small, medium, and 1k-node fixtures.

**Exit.** Random fixture → JSON → import → JSON round-trips byte-identical. Malformed inputs produce structured diagnostics with codes. The 1k-node fixture loads in <100ms (Vitest perf assert). Property test: every valid fixture survives a parse/serialize round-trip preserving unknown metadata.

**Risk.** Coupling internal model to wire format (collapsing into the same shape). Mitigation: code comments + a test that asserts the internal model has the normalized shape after parse, not the wire shape.

---

### M2 — Commands, hierarchy ops, selection

**Scope.** This is the highest-risk milestone in the project. Land the `Command` and `Transaction` infra first. Then build every operation in `docs/domain-model.md` §"Core Operations" as a command: `addRoot`, `addChild`, `addTextLabel`, `editLabel`, `editDescription`, `editColor`, `setHeatmapValue`, `clearHeatmapValue`, `deleteNode` (with descendant cleanup), `reparentNode` (cycle + text-label-as-parent rejection), `moveNode`, `resizeNode`, `fitParentToChildren`, `lockSubtree`, `unlockSubtree`, `setManualPositioning`. Selection rules in `src/domain/selection/`: single-parent constraint for multi-select, root-with-root, text-label exclusion, alignment ≥2, distribution ≥3. **Bulk ops as primitive composers** wired to debug entry points (no UI yet): `alignSelection(direction)`, `distributeSelection(axis)`, `sameSize(anchorId)` — each commits one Transaction.

**Key files.**
- `src/domain/commands/types.ts` — `Command`, `Transaction`, `CommandStack`.
- `src/domain/commands/stack.ts` — undo/redo + coalescing.
- `src/domain/commands/primitives/*.ts` — one file per primitive.
- `src/domain/commands/composites/*.ts` — `align`, `distribute`, `sameSize`, `duplicate`, `paste`.
- `src/domain/hierarchy/traverse.ts`, `validate.ts`, `reparent.ts`.
- `src/domain/selection/rules.ts`, `state.ts`.

**Exit.** Every operation in §Core Operations is a tested command. Cycle creation rejected. Text-label-as-parent rejected. Orphans impossible (delete cleans up). Bulk ops commit one undo entry. Undo/redo stacks are immutable patches. ~95% line coverage in `domain/commands` and `domain/hierarchy`.

**Risk.** Command system that can't naturally express bulk ops or preview/commit separation forces M4-M5 refactor. Mitigation: write `align`/`distribute`/`sameSize` in this milestone wired to debug entry points; if they feel awkward to compose, fix the infra now.

---

### M3 — Layout engine

**Scope.** Pure TS in `src/domain/layout/`, no browser. Three modes (uniform/flow/adaptive) behind one interface: `layout(request) -> { patches, diagnostics }`. Request: nodes + hierarchy + global settings + locked/manual flags + affected-subtree ids. Output is a patch set, never a mutation. Locked nodes: zero patch entries. `isManualPositioningEnabled=true` parents: child positions preserved. Parent grow-to-fit. Deterministic: same input → byte-identical output. Incremental: editing subtree X never patches unrelated roots.

**Key files.**
- `src/domain/layout/types.ts` — `LayoutRequest`, `LayoutResult`, `LayoutPatch`.
- `src/domain/layout/engine.ts` — orchestrator.
- `src/domain/layout/modes/uniform.ts`, `flow.ts`, `adaptive.ts`.
- `src/domain/layout/preserve.ts` — locked + manual + imported preservation.
- `src/test/layout/*.test.ts` — edge cases per `docs/tech-stack.md` §Layout (empty parents, one child, mixed sizes, locked descendants, imported coords).

**Exit.** Lock subtree → relayout → patches contain zero entries for locked node ids. Manual children → relayout → positions unchanged. 1k-node layout completes <200ms. Determinism test: 100 runs produce identical output for the same input. Three smoke fixtures (uniform tree, flow hierarchy, adaptive mixed) with golden outputs.

**Risk.** Layout API leaking browser assumptions. Mitigation: `domain/layout` Vitest-only, no React or DOM imports. Add an ESLint rule blocking `react`, `react-dom`, `window` imports under `src/domain/`.

---

### M4 — Editor shell + renderer + render indexes + Playwright bootstrap

**Scope.** Three-store Zustand split (document / UI / transient — see Architectural Spine). Canvas component with pan/zoom/fit using CSS transforms. Node rendering from derived view models — render indexes (depth, descendants, bounds, visibility, z-order, selection) baked in here as memoized selectors with explicit invalidation keys. Outline tree + inspector skeletons (no editing yet, just wiring). Toolbar with primary actions stubbed. Grid toggle. Playwright e2e harness stood up with first three smoke tests: create root node, pan/zoom, single-select.

**Key files.**
- `src/app/shell/AppShell.tsx`, `routes/EditorRoute.tsx`.
- `src/features/canvas/Canvas.tsx`, `Viewport.tsx`, `NodeView.tsx`, `selectors.ts`.
- `src/features/canvas/indexes/depth.ts`, `descendants.ts`, `bounds.ts`, `visible.ts`, `zOrder.ts`.
- `src/features/outline/Outline.tsx`.
- `src/features/inspector/Inspector.tsx`.
- `src/app/stores/documentStore.ts`, `uiStore.ts`, `transientStore.ts`.
- `tests/e2e/smoke-create-pan-select.spec.ts`.

**Exit.** Three Playwright smokes pass. Renderer reads only from view models (no direct store access in render path). Transient store changes do not trigger document store re-renders (assert via render-count instrumentation). Render indexes have invalidation tests. ESLint rule: `domain/` cannot import from `features/` or `app/`.

**Risk.** Memoized renderers ignoring interaction state — explicitly include hover/drag/select flags in view-model selector keys. Add a Playwright test that drag-highlights a node and asserts the visual update. This is the bug class unit tests cannot catch; that is why Playwright lands here, not in M9.

---

### M5 — Full editing: drag, resize, reparent, multi-select, bulk ops, keyboard

**Scope.** Inline label edit (double-click → contenteditable or input overlay). Inspector wiring for color, description, layout flags, text-label styling, heatmap value. Drag/resize using transient store for preview, single Transaction commit on pointerup. Reparent with hover validation + cycle/text-label rejection + locked-target rejection. Multi-select via rubber-band + modifier-click respecting selection rules. Bulk-op UI commands (align L/C/R/T/M/B, distribute H/V, same-size from anchor, copy/paste/duplicate, bulk-delete, bulk-color) — each commits one Transaction (composers from M2). Keyboard shortcuts: delete, undo, redo, copy, paste, arrow-nudge (where movement allowed), escape (cancel transient), `f` for fit-view. Undo/redo wired to UI affordances.

**Key files.**
- `src/features/canvas/interaction/drag.ts`, `resize.ts`, `reparent.ts`, `rubberband.ts`.
- `src/features/canvas/keyboard.ts`.
- `src/features/inspector/forms/*.tsx`.
- `src/features/canvas/labelEdit.ts`.
- `tests/e2e/smoke-1-create-three-level.spec.ts`, `smoke-2-manual-position-roundtrip.spec.ts` (skeleton — full assertion in M6 once persistence lands), `smoke-4-multi-select-align-distribute.spec.ts`.

**Exit.** Acceptance smoke tests 1, 3, 4 from `docs/interaction-contracts.md` pass via Playwright. Drag of a 50-node subtree maintains 60fps (Playwright + perf trace). Bulk align of 20 siblings produces exactly one undo entry (asserted via command-history test). Reparenting a node into its own descendant rejected with diagnostic.

**Risk.** Drag preview leaking into autosave (M6 issue but the gate must exist now: autosave subscribes to documentStore only). Bulk ops accidentally committing per-node Transactions (assert `transaction.commands.length > 1` after a multi-node align in tests).

---

### M6 — Persistence + JSON file I/O + visual exports + File System Access

**Scope.** IndexedDB autosave via `idb` — debounced 500ms, gated on transient store empty. Recovery snapshot on reload. "Clear saved data" affordance in settings. JSON file save/open via File System Access API with `<input type=file>` fallback for unsupported browsers. SVG export adapter (foreignObject for text, inline styles, no external CSS). HTML export (single self-contained file with embedded SVG). LocalStorage for small UI prefs (panel widths, last layout mode). Adapter pattern in `src/features/import-export/` so M7 and M8 plug in cleanly.

**Key files.**
- `src/app/persistence/autosave.ts`, `recovery.ts`, `clear.ts`.
- `src/app/persistence/fileSystem.ts` — FS Access API with fallback.
- `src/features/import-export/json.ts` — wraps M1 serialize/parse with file plumbing.
- `src/features/import-export/svg.ts`, `html.ts`.
- `src/features/import-export/types.ts` — `ExportAdapter` interface.

**Exit.** Acceptance smoke 2 (manual positions, save, reload, preserve) passes. SVG export of 200-node fixture round-trips visually (snapshot test). HTML export opens standalone in a fresh browser process (Playwright). Autosave never persists during active drag (instrumentation: persistence module asserts `transientStore.isIdle === true` before write, throws in dev if violated). FS Access API path works in Chrome; fallback path works under Playwright Firefox config.

**Risk.** Autosave persisting transient drag state — single explicit gate function `canAutosave(): boolean` reading both stores; log every skip in dev mode; unit test the gate.

---

### M7 — Heatmap + viewer mode + CSV import + PowerPoint

**Scope.** Heatmap palette presets + custom palette editing + legend + per-node value editing in inspector. Heatmap toggle in global settings. CSV import (id-keyed or label-keyed, configurable column mapping). Viewer route renders read-only with pan/zoom/fit/heatmap. PowerPoint export via `pptxgenjs` — slide-per-root or single-slide modes, native shapes (not screenshots). **`resolveNodeFill` factored out** as the single fill source for editor + SVG + HTML + PPTX + viewer.

**Key files.**
- `src/features/heatmap/palette.ts`, `legend.tsx`, `csvImport.ts`, `valueResolver.ts`.
- `src/features/heatmap/resolveNodeFill.ts` — **the single fill source**.
- `src/features/viewer/ViewerRoute.tsx`, `urlLoader.ts`.
- `src/features/import-export/pptx.ts`.
- `src/app/routes.tsx` — `/`, `/viewer`.

**Exit.** Acceptance smoke 5 (viewer + heatmap fidelity) passes. Heatmap colors byte-identical across editor / SVG / HTML / PPTX / viewer (snapshot test on `resolveNodeFill` plus visual snapshots per adapter using a shared fixture). CSV import validates ranges, reports out-of-range values, preserves untouched node values. PowerPoint export of the medium fixture opens in PowerPoint and Keynote without errors (manual verification documented).

**Risk.** Heatmap inconsistency across export targets — every adapter must call `resolveNodeFill`; add a test that fails if any adapter reads `node.color` directly when heatmap is active.

---

### M8 — Compatibility adapters: draw.io + ArchiMate

**Scope.** Draw.io / diagrams.net XML export adapter (mxGraph cell hierarchy mirroring containment, geometry from internal coords). ArchiMate Open Exchange XML export adapter (capability elements, composition relationships). Stable fixture-based round-trip tests where round-trip is meaningful; one-way export with snapshot tests where it isn't. Documented lossy fields per adapter.

**Key files.**
- `src/features/import-export/drawio.ts`, `drawio.fixtures.ts`.
- `src/features/import-export/archimate.ts`, `archimate.fixtures.ts`.
- `docs/adapters/drawio.md`, `archimate.md` — lossy-field documentation.

**Exit.** Hand-authored fixture exports open cleanly in diagrams.net web app and Archi tool (manual verification documented in `docs/adapters/`). Fixture-based snapshot tests in CI. Both adapters call `resolveNodeFill`.

**Risk.** Format drift over time as upstream tools change schemas — pin fixture snapshots, document each adapter's lossy fields explicitly so future changes are diff-visible.

---

### M9 — Performance, PWA, accessibility, full e2e, deploy

**Scope.** Viewport culling using M4 bounds index (only render nodes in viewport ∩ bounds). Minimap (separate canvas, reads same bounds index). Node search with jump-to (label substring, optional metadata search). `vite-plugin-pwa` + Workbox for install/offline behavior. Accessibility pass: focus rings, ARIA labels on all interactive elements, keyboard traps audited, color contrast (including all heatmap palettes) checked with axe-core. 1000-node smoke fixture committed; Playwright test asserts interaction latency budgets (drag start <16ms, pan <16ms, fit-view <100ms). Static deploy config (GitHub Pages or Cloudflare Pages — chosen at start of M9).

**Key files.**
- `src/features/canvas/cull.ts`.
- `src/features/canvas/minimap/Minimap.tsx`.
- `src/features/canvas/search/Search.tsx`.
- `vite.config.ts` — PWA plugin config.
- `public/manifest.webmanifest`, icons.
- `tests/e2e/smoke-7-thousand-nodes.spec.ts`.
- `tests/e2e/a11y/*.spec.ts` — axe-core checks on editor + viewer.
- `.github/workflows/deploy.yml`.

**Exit.** Acceptance smoke 7 (1000 nodes responsive) passes with measured latencies under budget. Lighthouse PWA score passes. axe-core reports no critical violations on `/` and `/viewer`. Deployed URL serves the production build with PWA install prompt.

**Risk.** Late performance surprises — if M4 indexes were sloppy, this milestone explodes. The render-index discipline at M4 is what keeps M9 small. If smoke 7 fails, do not patch M9; revisit M4 selectors.

---

## Cross-cutting concerns

### Test strategy by milestone

| Milestone | Vitest unit | Testing Library | Playwright | 1k smoke |
|-----------|-------------|-----------------|------------|----------|
| M0 | harness | harness | config only | — |
| M1 | heavy (schema, round-trip, migrations, diagnostics) | — | — | load-time only |
| M2 | heavy (commands, hierarchy, selection, undo, coalescing) | — | — | — |
| M3 | heavy (layout determinism, locked/manual preservation, modes) | — | — | layout-time |
| M4 | selectors, indexes, store separation | inspector + outline skeletons | **stand up** + smokes 1,2,3 | render-time |
| M5 | bulk-op composers | inspector forms, label edit | smokes 1, 3, 4 | drag perf |
| M6 | export adapters (JSON, SVG, HTML) | persistence UI | smoke 2 with reload | autosave timing |
| M7 | heatmap resolver, CSV, viewer URL loader | heatmap inspector UI | smoke 5 | — |
| M8 | drawio + archimate fixtures | — | adapter round-trip | — |
| M9 | — | — | smoke 7 + a11y | full latency budget |

### Performance budget (M9 measured against this)

- Drag start latency: <16ms
- Pan/zoom frame: <16ms
- Fit-view of 1k nodes: <100ms
- Layout recalculation of 1k nodes: <200ms (M3 enforces this)
- JSON parse + validate of 1k-node fixture: <100ms (M1 enforces this)
- Initial editor load (cold cache): <2s on a mid-tier laptop
- Autosave write: <50ms (debounced, off the interaction path)

### Persistence rules (locked from M6 onward)

1. Autosave reads documentStore only.
2. Autosave gated on transientStore.isIdle.
3. Autosave debounced 500ms.
4. UI state (selection, viewport, panels) → LocalStorage.
5. Document recovery → IndexedDB.
6. Explicit save/open → File System Access API with fallback.
7. Migrations run on every parse, including recovery snapshots.

### Files referenced from docs (do not duplicate logic)

- `docs/domain-model.md` defines invariants — implementation references this section, does not redefine.
- `docs/interaction-contracts.md` §"Acceptance Smoke Tests" → Playwright spec names map 1:1.
- `docs/agent-implementation-brief.md` §"Common Failure Modes" → each failure mode has a corresponding test or architectural gate noted in the milestone risks above.

---

## Verification plan

**Per-milestone verification.** Each milestone has explicit Exit criteria above. Before declaring a milestone complete:

1. `npm run lint && npm run typecheck && npm run test:run && npm run build` all green.
2. Playwright smokes for that milestone (where applicable) green.
3. Exit-criteria assertions documented as tests, not just claims.
4. No regression in earlier milestones' smokes.

**End-to-end product verification (after M9).** All seven acceptance smoke tests in `docs/interaction-contracts.md` §"Acceptance Smoke Tests" pass via Playwright in CI:

1. Create three-level hierarchy → JSON export → import → structure + layout preserved.
2. Manual positioning → move children → save → reload → positions preserved.
3. Lock subtree → change global fixed dimensions → locked sizes stable.
4. Multi-select sibling leaves → align → distribute → undo → redo.
5. Viewer mode loads JSON with heatmap → expected colors + legend.
6. (Implicit across M7+M8) Export to SVG, HTML, PPTX, drawio, ArchiMate from the same fixture; visual fidelity preserved.
7. 1000-node diagram → pan/zoom/select without obvious lag (latency budgets above).

**Manual verification gates.**
- M7: PowerPoint export opens in PowerPoint and Keynote without errors or missing shapes.
- M8: drawio export opens in diagrams.net; ArchiMate export opens in Archi tool.
- M9: Lighthouse PWA score ≥90; axe-core no critical violations.

**Hard-constraint audit (final).** Walk every bullet in `docs/agent-implementation-brief.md` §"Hard Constraints" and produce a one-line evidence reference (test name, file, or PR) per bullet.
