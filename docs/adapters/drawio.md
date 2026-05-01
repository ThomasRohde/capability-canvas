# Draw.io Export Adapter

The draw.io export writes a one-way diagrams.net XML document. Capability nodes are represented as rounded `mxCell` vertices, with parent-child containment represented by cell parent ids.

Known lossy fields:

- Command history and undo state are not exported.
- Local browser preferences are not exported.
- Rich metadata is preserved only as visible labels where draw.io supports it in the current adapter.
- Draw.io imports should be treated as visual/diagram interchange, not authoritative round-trip data.

