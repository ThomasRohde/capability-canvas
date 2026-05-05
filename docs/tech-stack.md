# Tech Stack

## Position

Capability Canvas should be built as a local-first, browser-based modeling tool with a pure TypeScript domain core and a responsive canvas editing surface. The stack should make hierarchy correctness, layout determinism, import/export reliability, and large-diagram performance easier to maintain.

This document recommends defaults. They are not hard constraints unless a decision is called out as required.

## Recommended Default Stack

- **Language**: TypeScript with strict compiler settings.
- **UI runtime**: React.
- **Build tool**: Vite.
- **Styling**: Tailwind CSS plus a small design-token layer.
- **Icons**: Lucide React.
- **Outline tree**: `@headless-tree/react` for the hierarchy navigator, with custom row rendering against the design tokens.
- **State shell**: Zustand or an equivalent small external store.
- **Domain core**: pure TypeScript modules with no React imports.
- **Document validation**: Zod or another typed schema validator.
- **Persistence**: IndexedDB through `idb`.
- **PWA**: `vite-plugin-pwa` and Workbox for install/offline behavior.
- **Unit testing**: Vitest.
- **Component testing**: Testing Library.
- **Browser testing**: Playwright for canvas, export, and large-diagram smoke tests.
- **Export support**: native JSON/SVG/HTML generation, `pptxgenjs` for PowerPoint.

## Architecture Shape

Prefer layered ownership:

1. **Domain core**
   - Owns node types, hierarchy invariants, selection rules, command validation, document schema, and pure layout inputs/outputs.
   - Must be framework-independent.

2. **Document store**
   - Owns the active document, undo/redo, persistence lifecycle, and schema migrations.
   - Can use Zustand, Redux Toolkit, Jotai, signals, or a custom command store. The store should not contain the core business rules directly.

3. **Layout engine**
   - Owns deterministic auto-layout, manual layout preservation, locked subtree behavior, and layout diagnostics.
   - Should be testable without a browser.

4. **Interaction controller**
   - Owns pointer, keyboard, selection box, drag preview, resize preview, reparent hover, and command commit behavior.
   - Should keep high-frequency preview state separate from committed document state.

5. **Renderer**
   - Owns the visible canvas, node rendering, overlays, hit targets, minimap, and viewport transforms.
   - Should consume derived view models rather than raw mutable domain state.

6. **Adapters**
   - Own import/export formats, CSV heatmap import, PowerPoint generation, and HTML/SVG generation.

## Rendering Recommendation

Start with a custom renderer rather than a generic graph library. Capability Canvas is primarily a containment and hierarchy editor, not an edge-first graph editor.

Recommended first implementation:

- Use DOM or SVG for nodes and labels.
- Use CSS transforms for pan, zoom, and drag previews.
- Maintain render indexes for depth, descendants, bounds, visibility, z-order, and selection membership.
- Add viewport culling or render batching if 1,000-node diagrams show measurable lag.

Possible later optimization:

- Move dense background, selection overlays, minimap, or heatmap layers to canvas.
- Keep semantic controls and editable text in DOM where accessibility and text editing matter.

Avoid adopting a graph canvas library unless it can preserve nested containment, manual/locked layout rules, and export fidelity without heavy workarounds.

## State And Commands

Recommended approach:

- Store the canonical document in a normalized model such as `nodesById` plus ordered child lists.
- Derive render order, parent/child maps, subtree bounds, depths, and selection lookup sets through memoized selectors.
- Represent model-changing actions as commands or transactions.
- Commit one undo history entry per user-intent operation.
- Keep transient drag/resize/selection preview state outside the persisted document.
- Auto-save only committed, validated document states.

Zustand is a good default for the application shell because it is small and explicit. It should not become a dumping ground for domain logic.

## Layout

Use a custom pure TypeScript layout engine. The core requirements are specific enough that a generic layout package is unlikely to be sufficient by itself.

The layout engine should:

- Accept a typed layout request.
- Return geometry patches and diagnostics.
- Preserve manual and locked areas by default.
- Recalculate affected subtrees incrementally where practical.
- Be deterministic for the same input.
- Include unit tests for edge cases such as empty parents, one child, mixed sizes, locked descendants, and imported coordinates.

Optional helper libraries can be evaluated for specific algorithms, but the product should own the final layout contract.

## Document Format And Validation

Use JSON as the primary round-trip format.

Recommended validation stack:

- Zod schemas for document, node, settings, heatmap, and layout metadata.
- Explicit migration functions between schema versions.
- A repair path for common non-destructive issues.
- Clear diagnostics for duplicate ids, missing parents, cycles, invalid geometry, and out-of-range heatmap values.

The internal model does not need to match the exported JSON shape.

## Persistence

Use local browser storage by responsibility:

- IndexedDB for active document autosave, recovery snapshots, and larger persisted state.
- LocalStorage only for small user preferences when convenient.
- File System Access API as progressive enhancement for explicit save/open workflows.

Autosave should pause or debounce during high-frequency interactions and imports. It should never persist half-applied operations.

## Export And Integration

Required exports:

- JSON for full round-trip.
- SVG for vector embedding.
- HTML for shareable interactive or static views.
- PowerPoint via `pptxgenjs`.

Recommended exports:

- Draw.io/diagrams.net XML.
- ArchiMate Tool format if enterprise architecture workflows remain central.
- CSV import for heatmap values.

Export code should be adapter-based and tested against stable fixtures.

## Testing Stack

Use layered testing:

- **Vitest** for pure domain, selection, validation, layout, command, and migration tests.
- **Testing Library** for inspector, toolbar, modal, and selection UI behavior.
- **Playwright** for end-to-end workflows: create hierarchy, pan, zoom, fit view, drag, resize, import, export, and viewer mode.
- **Large-diagram smoke fixtures** around 1,000 nodes.
- **Round-trip tests** for JSON, heatmap, manual positions, locked layouts, and export metadata.

Tests should focus on invariants and user workflows rather than implementation details.

## Tooling

Recommended scripts:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint . --max-warnings 0",
    "typecheck": "tsc --noEmit",
    "test": "vitest",
    "test:run": "vitest run",
    "test:e2e": "playwright test"
  }
}
```

Recommended quality settings:

- Strict TypeScript.
- ESLint with zero-warning CI policy.
- Prettier or an equivalent formatter if the team wants automatic formatting.
- CI that runs lint, typecheck, unit tests, browser smoke tests, and production build.

## Deployment

A static deployment target is sufficient for the core product:

- GitHub Pages, Cloudflare Pages, Netlify, Vercel, or equivalent static hosting.
- PWA enabled for production builds.
- No backend required for core editing, saving, import, export, or viewer workflows.

If collaboration or cloud storage is added later, keep it behind explicit sync adapters so local-first editing remains intact.

## Dependency Posture

Prefer small, boring dependencies for infrastructure and own the product-specific domain logic.

Good candidates:

- React, React DOM, Vite, TypeScript.
- Tailwind CSS.
- Lucide React.
- `@headless-tree/react` for the outline tree.
- Zustand or another small store.
- Immer if it simplifies command reducers.
- idb.
- Zod.
- vite-plugin-pwa and Workbox.
- Vitest, Testing Library, Playwright.
- pptxgenjs.

Be cautious with:

- Large graph editors that are edge-first rather than containment-first.
- Heavy drag/drop libraries if custom pointer handling is clearer.
- Tree components that own row markup or styling — the outline must hit the exact 30 px row, 11 px swatch, score-aligned spec in `DESIGN.md`, which is why `@headless-tree/react` (headless) is preferred over batteries-included alternatives.
- Layout engines that cannot express manual, locked, and containment constraints.
- Dependencies that make export fidelity depend on browser screenshots.

## Recommended Project Structure

```text
src/
  app/
    routes/
    shell/
  domain/
    document/
    hierarchy/
    layout/
    selection/
    commands/
    validation/
  features/
    canvas/
    inspector/
    outline/
    heatmap/
    import-export/
    viewer/
  shared/
    components/
    hooks/
    styles/
    utils/
  test/
```

The exact folders can change, but keep domain logic independent from React and keep import/export adapters separate from the editor UI.

## Scope Note

This stack is intentionally domain-led. React, TypeScript, Vite, PWA support, local persistence, and strong testing are useful foundations, but they should serve the document model, hierarchy invariants, deterministic layout, canvas interactions, and export fidelity rather than define the product architecture.
