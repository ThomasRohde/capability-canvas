import {
  childrenOf,
  subtreeNodeIds,
  type CapabilityDocument,
  type CapabilityNode,
  type NodeId,
} from "../document/types";
import { PROMPT_MERGE_SCHEMA, PROMPT_MERGE_VERSION } from "./payload";

export const DEFAULT_PROMPT_CHILD_COUNT = 5;
export const MIN_PROMPT_CHILD_COUNT = 1;
export const MAX_PROMPT_CHILD_COUNT = 12;

export interface BcmPromptOptions {
  childCount?: number;
}

export function buildBcmPrompt(
  doc: CapabilityDocument,
  targetId: NodeId,
  options: BcmPromptOptions = {},
): string {
  const target = doc.nodesById[targetId];
  if (!target) throw new Error("Select a valid capability before prompting.");
  if (target.isTextLabel || target.type === "text") {
    throw new Error("Text labels cannot be expanded with AI prompts.");
  }

  const childIds = childrenOf(doc, targetId);
  const isLeaf = childIds.length === 0;
  const childCount = normalizePromptChildCount(options.childCount);
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
        description:
          "One concise, varied sentence describing the business outcome.",
        metadata: {
          rationale: "Why this capability belongs at this level.",
        },
      },
    ],
  };

  return [
    "Role: You are a business capability modeling assistant for Capability Canvas.",
    "",
    "# Goal",
    isLeaf
      ? `Create ${childCount} direct child capabilities under the selected leaf capability. The selected capability will become a parent when the JSON is imported.`
      : `Create or refine ${childCount} direct child capabilities under the selected capability. Preserve existing capabilities that are not mentioned, and refine only capabilities you explicitly include.`,
    "",
    "# Success criteria",
    `- Return exactly ${childCount} direct child capabilities for targetId "${targetId}".`,
    "- Keep sibling capabilities MECE: no duplicates, overlaps, or mixed abstraction levels.",
    "- Name stable business outcomes, not implementation steps, projects, teams, applications, or systems.",
    "- Use concise, varied descriptions that explain business outcomes.",
    "- Reuse an existing id only when refining an existing direct child.",
    "",
    "# Constraints",
    "- Use noun-based capability names, not process, project, team, application, or system names.",
    "- Keep every generated sibling group at one level of abstraction.",
    "- Capabilities already imply ability; do not begin descriptions with \"The ability to\", \"Ability to\", or similarly repetitive boilerplate.",
    "- Use stable kebab-case ids. Reuse an existing id when refining an existing capability.",
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
    "# Output",
    "Return raw JSON only. Do not wrap it in Markdown. Do not include commentary before or after the JSON.",
    "The JSON object must be shaped like this:",
    JSON.stringify(outputShape, null, 2),
  ].join("\n");
}

export function normalizePromptChildCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_PROMPT_CHILD_COUNT;
  }
  return Math.min(
    MAX_PROMPT_CHILD_COUNT,
    Math.max(MIN_PROMPT_CHILD_COUNT, Math.round(value)),
  );
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
