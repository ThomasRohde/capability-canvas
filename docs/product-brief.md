# Product Brief

## Purpose

Capability Canvas helps people create, inspect, share, and export hierarchical capability models. A diagram is made of nested nodes that represent business capabilities, domains, bounded contexts, operating areas, systems, products, teams, or other structured concepts.

The app should feel like a practical modeling tool, not a generic drawing board. It should keep the hierarchy valid, reduce layout work through automation, and still allow deliberate manual positioning when the user needs editorial control.

## Target Users

- Enterprise architects mapping business capability models, operating models, or architecture landscapes.
- Product and platform teams organizing domains, subdomains, systems, services, or ownership areas.
- Consultants and analysts producing diagrams that must be shared in documents, presentations, or architecture tools.
- Technical users who need local/offline handling for sensitive business information.

## Core Jobs

1. Build a hierarchy quickly from root concepts to nested children.
2. Let the app arrange the hierarchy automatically with readable spacing and containment.
3. Override layout manually for selected areas without losing hierarchy integrity.
4. Edit labels, descriptions, colors, data values, and appearance settings.
5. Select sibling items and apply PowerPoint-style operations such as alignment, distribution, same size, copy, duplicate, and delete.
6. Import, save, recover, and export diagrams without requiring a backend.
7. Share a read-only diagram through JSON or URL loading while preserving visual fidelity.

## Essential Experience

The first screen should be the usable modeling workspace. It should include a canvas, primary diagram actions, selection-aware editing controls, and access to hierarchy/navigation tools. Avoid a landing page or marketing-first flow.

Creating and editing should be direct:

- Add a root node.
- Add children to selected nodes.
- Double-click or otherwise edit labels in place.
- Use a side panel or inspector for richer properties.
- Pan and zoom across large diagrams.
- Fit the view to the diagram.
- Navigate the hierarchy through an outline/tree.

The user should not need to understand the implementation to trust the result. Invalid hierarchy operations should be prevented or repaired gracefully.

## Non-Negotiable Product Properties

- Local-first operation. Diagrams and preferences must work without a server.
- Durable persistence. Unsaved work should survive reloads where browser storage allows it.
- Portable exports. JSON must round-trip the diagram, and visual exports should preserve the visible layout.
- Valid hierarchy. The data model must not allow cycles, duplicate ids, missing parents, or invalid dimensions.
- Layout integrity. Parent/child containment must remain coherent after automatic layout, manual movement, import, restore, and export.
- Performance on large diagrams. A diagram with around 1,000 nodes must remain usable for viewing, selection, pan, zoom, and common edits.

## Flexible Product Choices

Modern implementations may change:

- The visual style, as long as the app remains a dense, professional modeling tool.
- The exact toolbar/sidebar layout.
- The layout algorithms, as long as they meet the behavior contracts.
- The rendering backend: DOM, SVG, canvas, WebGL, or a hybrid.
- The app state architecture and internal data structures.
- The export implementation details.

## Out Of Scope For The Core

- Mandatory cloud storage or account login.
- Real-time multiplayer editing.
- General vector illustration features unrelated to hierarchical domain modeling.
- Freeform connections as the primary model. Parent-child containment is the primary relationship.
- Server-side rendering as a requirement.

These features can be added later, but they should not complicate the local-first core.
