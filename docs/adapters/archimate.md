# ArchiMate Export Adapter

The ArchiMate export writes a one-way Open Exchange XML document with capability nodes as `BusinessCapability` elements and hierarchy as `CompositionRelationship` entries.

Known lossy fields:

- Canvas geometry is not represented in the exchange model.
- UI state, undo history, and local preferences are not exported.
- Capability Canvas colors and heatmap state are not semantically represented in ArchiMate.
- Use JSON export for full round-trip fidelity.

