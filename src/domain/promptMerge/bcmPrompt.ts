import {
  childrenOf,
  subtreeNodeIds,
  type CapabilityDocument,
  type CapabilityNode,
  type NodeId,
} from "../document/types";
import { PROMPT_MERGE_SCHEMA, PROMPT_MERGE_VERSION } from "./payload";

export function buildBcmPrompt(
  doc: CapabilityDocument,
  targetId: NodeId,
): string {
  const target = doc.nodesById[targetId];
  if (!target) throw new Error("Select a valid capability before prompting.");
  if (target.isTextLabel || target.type === "text") {
    throw new Error("Text labels cannot be expanded with BCM prompts.");
  }

  const childIds = childrenOf(doc, targetId);
  const isLeaf = childIds.length === 0;
  const context = {
    documentTitle: doc.title,
    selectedPath: capabilityPath(doc, targetId),
    selectedCapability: capabilitySummary(target),
    existingSelectedSubtree: isLeaf
      ? []
      : subtreeNodeIds(doc, targetId).map((nodeId) =>
          capabilitySummary(doc.nodesById[nodeId]!),
        ),
  };
  const exampleParentId = isLeaf
    ? targetId
    : childIds[0] ?? targetId;
  const exampleName = isLeaf
    ? "Example Child Capability"
    : "Example Existing Or New Child";
  const outputShape = {
    schema: PROMPT_MERGE_SCHEMA,
    version: PROMPT_MERGE_VERSION,
    targetId,
    capabilities: [
      {
        id: "stable-kebab-case-id",
        name: exampleName,
        parentId: exampleParentId,
        description: "One concise sentence describing the business outcome.",
        metadata: {
          rationale: "Why this capability belongs at this level.",
        },
      },
    ],
  };

  return [
    "You are helping build a Business Capability Model (BCM) in Capability Canvas.",
    "",
    isLeaf
      ? "Task: create child capabilities under the selected leaf capability. The selected capability will become a parent when the JSON is imported."
      : "Task: merge generated children with existing children under the selected capability. Preserve existing capabilities that are not mentioned, and refine only capabilities you explicitly include.",
    "",
    "BCM modeling rules:",
    "- Use noun-based capability names, not process, project, team, application, or system names.",
    "- Name stable business outcomes or abilities, not implementation steps.",
    "- Keep sibling capabilities MECE: no duplicates, overlaps, or mixed abstraction levels.",
    "- Keep every generated sibling group at one level of abstraction.",
    "- Prefer 3-7 children for a decomposition unless the selected scope clearly needs fewer or more.",
    "- Use concise descriptions that explain the business outcome, not operational procedure.",
    "- Use stable kebab-case ids. Reuse an existing id when refining an existing capability.",
    "",
    "Import contract:",
    `- Return schema "${PROMPT_MERGE_SCHEMA}" with version "${PROMPT_MERGE_VERSION}".`,
    `- Set targetId to "${targetId}".`,
    "- Put direct children of the selected capability under parentId equal to targetId, or omit parentId.",
    "- Put deeper descendants under the id of their generated or existing parent capability.",
    "- Do not include the selected target capability itself in capabilities.",
    "- Do not delete existing capabilities by omission; the importer preserves anything absent from your payload.",
    "",
    "Current context:",
    JSON.stringify(context, null, 2),
    "",
    "Return exactly one Markdown fenced code block using json, and no text outside the fence.",
    "The code block content must be a JSON object shaped like this:",
    "```json",
    JSON.stringify(outputShape, null, 2),
    "```",
  ].join("\n");
}

function capabilityPath(doc: CapabilityDocument, targetId: NodeId): string[] {
  const path: string[] = [];
  let current: CapabilityNode | undefined = doc.nodesById[targetId];
  const seen = new Set<NodeId>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current.label);
    current = current.parentId ? doc.nodesById[current.parentId] : undefined;
  }
  return path;
}

function capabilitySummary(node: CapabilityNode) {
  return {
    id: node.id,
    name: node.label,
    parentId: node.parentId,
    description: node.description,
    metadata: node.metadata,
  };
}
