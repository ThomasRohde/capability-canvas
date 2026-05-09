import type {
  CapabilityDocument,
  CapabilityNode,
} from "../../domain/document/types";

export function capabilityPathLabels(
  doc: CapabilityDocument,
  node: CapabilityNode,
): string[] {
  const labels = [node.label];
  const seen = new Set([node.id]);
  let current = node.parentId ? doc.nodesById[node.parentId] : undefined;
  while (current && !seen.has(current.id)) {
    labels.unshift(current.label);
    seen.add(current.id);
    current = current.parentId ? doc.nodesById[current.parentId] : undefined;
  }
  return labels;
}

export function nextMetadataKey(metadata: Record<string, unknown>): string {
  if (!Object.hasOwn(metadata, "key")) return "key";
  let index = 2;
  while (Object.hasOwn(metadata, `key${index}`)) index += 1;
  return `key${index}`;
}

export function commonValue<T>(values: T[]): T | "" {
  if (values.length === 0) return "";
  const first = values[0]!;
  return values.every((value) => Object.is(value, first)) ? first : "";
}
