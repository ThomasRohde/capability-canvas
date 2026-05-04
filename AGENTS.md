# Capability Canvas — Agent Instructions

Local-first hierarchical capability modeling tool. See [docs/README.md](docs/README.md) for the full document map.

## Commands

```bash
npm run dev          # Vite dev server
npm run build        # tsc + vite build
npm run typecheck    # Type-check without emit
npm run lint         # ESLint (zero warnings policy)
npm run test         # Vitest (watch)
npm run test:run     # Vitest (CI, single pass)
npm run test:e2e     # Playwright E2E
```

## Git / Deployment Workflow

This is a single-developer project. Work directly on `master` for future
changes unless the user explicitly asks for a branch or PR.

- Do not create feature branches or PRs by default.
- Commit intended changes on `master`.
- Do not push `master` after every change.
- Publishing is triggered by an explicit user request for a version bump.
- When the user asks for a version bump, run the appropriate version script
  (`npm run version:patch`, `npm run version:minor`, or
  `npm run version:major`), commit the version bump and intended changes on
  `master`, then push `master` to `origin`.
- GitHub Pages is triggered by pushes to `master` via
  `.github/workflows/pages.yml`.
- After a version-bump push, check the Pages workflow and confirm the public
  site updates.

## Architecture

Five layers with strict import direction (no upward imports):

```
src/domain/       → Pure TypeScript — NO React imports
src/app/          → Zustand stores, IndexedDB persistence, shell routing
src/features/     → React feature shells (canvas, editor, inspector, etc.)
src/test/         → Test fixtures only
```

All core logic lives in `src/domain/`. React features only orchestrate domain calls through the stores.

## Three-Store Zustand Rule

**Never conflate these stores** — mixing them breaks autosave:

| Store | File | What it owns | Persisted? |
|-------|------|--------------|------------|
| `useDocumentStore` | `src/app/stores/documentStore.ts` | Committed model, undo/redo history | Yes (IndexedDB) |
| `useUiStore` | `src/app/stores/uiStore.ts` | Selection, viewport, panel open/close | Yes (LocalStorage) |
| `useTransientStore` | `src/app/stores/transientStore.ts` | Active drag/resize/selection-rect preview | **Never** |

Autosave fires only when `dirty && transientStore.isIdle`. Adding high-frequency state to `documentStore` or `uiStore` will cause save thrashing or dropped saves.

## Domain Model

See [docs/domain-model.md](docs/domain-model.md) for invariants. Key types in `src/domain/document/types.ts`:

- `CapabilityDocument` — root model; hierarchy stored as `nodesById` + `childrenByParentId`
- `ROOT_PARENT_ID = "__root__"` — children of this key are the top-level roots
- `CapabilityNode` — extends `Bounds` (`x, y, w, h`) with `id, parentId, label, type, color, …`
- `NodeId = string`

Commands must return a **new immutable document** — never mutate in place.

## Command System

See `src/domain/commands/` — all mutations go through `Transaction → execute()` on `documentStore`.

```typescript
// Pattern for a new operation
export function myOperation(args): Transaction {
  return {
    label: 'Human-readable label for undo history',
    commands: [/* Command[] */],
  };
}
```

- `apply(doc)` must return `{ doc, diagnostics }` — on error, return the prior `doc` with an error diagnostic
- `ensureParentContainment` runs automatically after every transaction; do not call it inside a command
- All existing operations are in `src/domain/commands/operations.ts`

## Layout System

See `src/domain/layout/` and [docs/agent-implementation-brief.md](docs/agent-implementation-brief.md).

- `layoutDocument(request): Promise<LayoutResult>` — async because ELK runs in a worker
- Modes: `"uniform" | "flow" | "adaptive" | "free"`
- Locked nodes (`isLockedAsIs`) and children of `isManualPositioningEnabled` parents are never patched
- `ensureParentContainment` only expands parents — it never shrinks or moves them

## Import / Export

All adapters in `src/features/import-export/` implement `ExportAdapter`. When adding a new format:
1. Create `src/features/import-export/<format>.ts` exporting a default `ExportAdapter`
2. Register it in `src/features/import-export/index.ts`
3. Call `resolveNodeFill(node, heatmap)` for node colors — never use `node.color` directly in renderers

## Validation / Diagnostics

`Diagnostic` codes are string constants (e.g., `'cycle'`, `'missing-parent'`). Tests assert on `.code`, not message text.

## Testing Conventions

- **Unit tests**: alongside source, e.g., `commands.test.ts` next to `commands.ts`; use `vitest`
- **Component tests**: `@testing-library/react`; use `createSampleDocument()` from `src/domain/fixtures/sample.ts`
- **E2E**: `tests/e2e/` with Playwright; smoke tests only
- Snapshot exports with `expect(result).toMatchSnapshot()` for serialization regressions

## Key Pitfalls

- **Do not import React in `src/domain/`** — layout, commands, and validation are framework-free
- **Do not read `node.color` directly in export/render** — use `resolveNodeFill` to respect heatmap mode
- **Do not write to `documentStore` during drag** — use `transientStore` for preview state, commit on end
- **`childrenByParentId["__root__"]`** is the root list — there is no explicit "root" node object
- Wire format (`WireDocument`) uses an array of nodes; internal format uses `nodesById` map — convert at the parse/serialize boundary only
