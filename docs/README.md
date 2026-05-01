# Capability Canvas Design Docs

These docs define the greenfield product and engineering contracts for Capability Canvas. They are written for coding agents and human maintainers who need enough product and domain context to build a strong implementation without inheriting assumptions from any earlier codebase.

The docs describe the stable behavior and domain model. Implementation choices such as component structure, state management, rendering technology, layout internals, styling systems, and file organization are intentionally open.

## Document Map

- [Product Brief](./product-brief.md): the purpose, users, workflows, and quality bar.
- [Domain Model](./domain-model.md): the stable entities, invariants, operations, and document format requirements.
- [Interaction Contracts](./interaction-contracts.md): the user-facing behavior that should remain recognizable.
- [Tech Stack](./tech-stack.md): recommended implementation stack and engineering posture.
- [Agent Implementation Brief](./agent-implementation-brief.md): guidance for modern coding agents, including where they have freedom and where they do not.
- [Implementation Plan](./implementation-plan.md): milestone roadmap (M0–M9) for executing the build.

## How To Use These Docs

Start with the product brief to understand why the app exists. Then read the domain model before writing code, because the hierarchy and layout invariants are the most important part of the product. Use the interaction contracts as acceptance criteria for the editing surface. Use the agent brief to choose a modern implementation approach.

## Design Principle

Capability Canvas is a local-first, high-trust canvas for modeling hierarchical business capabilities where automatic structure and manual control can coexist without corrupting the model.
