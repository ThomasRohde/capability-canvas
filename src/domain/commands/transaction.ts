import { cloneDocument } from "../document/normalize";
import {
  hasChildren,
  isCanvasLabelNode,
  isTextLabelNode,
  now,
  type CapabilityDocument,
  type CapabilityNode,
} from "../document/types";
import { ensureParentContainment } from "../layout/containment";
import { computeDocumentBounds } from "../layout/engine";
import { sameBounds } from "../layout/bounds";
import { error, type Diagnostic } from "../validation/diagnostics";
import { validateDocument } from "../validation/validate";
import {
  materializeActiveViewMetadata,
  reconcileVisualWorkspaceWithNodes,
} from "../visual/workspace";
import type { Command, CommandScope, Transaction } from "./types";

type MutableDoc = CapabilityDocument;

export function transaction(
  label: string,
  commands: Command[],
  meta?: Transaction["meta"],
): Transaction {
  return { label, commands, meta };
}

export function runTransaction(
  doc: CapabilityDocument,
  txn: Transaction,
): { doc: CapabilityDocument; diagnostics: Diagnostic[] } {
  let next = cloneDocument(doc);
  const diagnostics: Diagnostic[] = [];
  for (const command of txn.commands) {
    const result = command.apply(next);
    diagnostics.push(...result.diagnostics);
    if (result.diagnostics.some((diag) => diag.severity === "error")) {
      return { doc, diagnostics };
    }
    next = result.doc;
  }
  const typed = refreshHierarchyTypes(next);
  const preContainmentValidation = validateDocument(typed);
  if (!preContainmentValidation.valid) {
    return {
      doc,
      diagnostics: [...diagnostics, ...preContainmentValidation.diagnostics],
    };
  }
  const contained = ensureParentContainment(typed).doc;
  const validation = validateDocument(contained);
  if (!validation.valid) {
    return { doc, diagnostics: [...diagnostics, ...validation.diagnostics] };
  }
  const reconciled = reconcileVisualWorkspaceWithNodes(doc, contained);
  return {
    doc: materializeActiveViewMetadata({
      ...reconciled,
      timestamp: now(),
      layout: layoutMetadataAfterCommand(reconciled),
    }),
    diagnostics,
  };
}

function layoutMetadataAfterCommand(
  doc: CapabilityDocument,
): CapabilityDocument["layout"] {
  const boundingBox = computeDocumentBounds(doc);
  const keepFrame =
    doc.layout.mode === "balanced" &&
    !doc.layout.isUserArranged &&
    sameBounds(doc.layout.boundingBox, boundingBox);
  return {
    ...doc.layout,
    boundingBox,
    aspectRatioFrame: keepFrame
      ? cloneBounds(doc.layout.aspectRatioFrame)
      : undefined,
    aspectRatioTarget: keepFrame
      ? cloneAspectRatioTarget(doc.layout.aspectRatioTarget)
      : undefined,
  };
}

function cloneBounds<
  TBounds extends { x: number; y: number; w: number; h: number },
>(bounds: TBounds | undefined): TBounds | undefined {
  return bounds ? { ...bounds } : undefined;
}

function cloneAspectRatioTarget(
  target: CapabilityDocument["layout"]["aspectRatioTarget"] | undefined,
): CapabilityDocument["layout"]["aspectRatioTarget"] | undefined {
  return target ? { ...target } : undefined;
}

export function command<TArgs>(
  type: string,
  args: TArgs,
  scope: CommandScope,
  apply: (doc: MutableDoc) => {
    doc: CapabilityDocument;
    diagnostics: Diagnostic[];
  },
): Command<TArgs> {
  return { type, args, scope, apply };
}

export function ok(doc: CapabilityDocument) {
  return { doc, diagnostics: [] };
}

export function fail(doc: CapabilityDocument, code: string, message: string) {
  return { doc, diagnostics: [error(code, message)] };
}

export function deriveNodeType(
  doc: CapabilityDocument,
  node: CapabilityNode,
): CapabilityNode["type"] {
  if (isCanvasLabelNode(node)) return "label";
  if (!node.parentId) return "root";
  if (isTextLabelNode(node)) return "text";
  return hasChildren(doc, node.id) ? "parent" : "leaf";
}

function refreshHierarchyTypes(doc: CapabilityDocument): CapabilityDocument {
  let next = doc;
  for (const node of Object.values(doc.nodesById)) {
    const type = deriveNodeType(doc, node);
    if (type === node.type) continue;
    if (next === doc) next = cloneDocument(doc);
    next.nodesById[node.id] = { ...next.nodesById[node.id]!, type };
  }
  return next;
}
