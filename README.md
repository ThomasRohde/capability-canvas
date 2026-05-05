# Capability Canvas

Local-first capability modeling for people who need structured diagrams without handing sensitive business context to a server.

![Capability Canvas workspace](docs/assets/capability-canvas-screenshot.png)

Capability Canvas is a browser-based editor for hierarchical capability models. It keeps parent-child containment as the core relationship, helps arrange large models automatically, and still lets users take manual control where a diagram needs editorial polish.

## Highlights

- **Local-first by default**: diagrams, preferences, undo history, and autosave live in the browser.
- **Hierarchy-aware canvas**: roots, parent capabilities, leaves, and text labels are modeled as structured data rather than generic shapes.
- **Deterministic auto layout**: uniform, flow, and adaptive modes arrange nested capabilities while preserving locked and manually positioned areas.
- **Manual editing tools**: drag, resize, reparent, align, distribute, duplicate, copy, delete, and make sibling nodes the same size.
- **Heatmap overlays**: color capabilities by score while keeping editor, viewer, and export colors consistent.
- **Portable exports**: JSON, SVG, standalone HTML, PowerPoint, diagrams.net/draw.io, and ArchiMate Open Exchange.
- **Read-only sharing**: generate viewer links or load exported JSON into a read-only canvas.

## Quick Start

```bash
npm install
npm run dev
```

Open the local Vite URL printed by the dev server, usually `http://localhost:5173`.

## Common Commands

```bash
npm run dev          # Start the Vite dev server
npm run build        # Type-check and build for production
npm run typecheck    # Type-check without emit
npm run lint         # ESLint with zero warnings
npm run test:run     # Vitest, single pass
npm run test:e2e     # Playwright smoke tests
```

## How It Works

Capability Canvas uses a normalized document model: `nodesById` for direct lookup and `childrenByParentId` for ordered hierarchy traversal. The root list is stored under `childrenByParentId["__root__"]`; there is no synthetic root node.

The codebase is intentionally layered:

| Layer | Responsibility |
| --- | --- |
| `src/domain/` | Pure TypeScript document model, commands, validation, layout, selection rules |
| `src/app/` | Zustand stores, persistence, routing, autosave coordination |
| `src/features/` | React feature shells for canvas, outline, inspector, export, settings, viewer |
| `src/test/` | Shared fixtures and test support |

The domain layer has no React dependency. All model changes go through command transactions, which keeps undo/redo, validation, autosave, and layout repair predictable.

## Data And Persistence

- Autosave uses IndexedDB for the committed document.
- UI preferences such as panel state use LocalStorage.
- Drag, resize, and selection previews are transient state and are never persisted.
- JSON export is the full-fidelity round-trip format.

## Exports

Use the export drawer to validate the current model and write:

- `.json` for full-fidelity backup and round-trip import.
- `.svg` or `.html` for documents, wiki pages, and browser-readable visuals.
- `.pptx` for editable PowerPoint shapes.
- `.drawio` for diagrams.net workflows.
- ArchiMate Open Exchange XML for architecture tooling.

## Documentation

The product and engineering contracts live in [`docs/README.md`](docs/README.md):

- [Product brief](docs/product-brief.md)
- [Domain model](docs/domain-model.md)
- [Interaction contracts](docs/interaction-contracts.md)
- [Tech stack](docs/tech-stack.md)
- [Agent implementation brief](docs/agent-implementation-brief.md)

## License

Capability Canvas is available under the [MIT License](LICENSE).

## Project Status

Capability Canvas is an actively evolving single-developer project. Work is done directly on `master` unless a branch or pull request is explicitly requested.
