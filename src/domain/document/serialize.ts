import { sortedNodes } from './normalize';
import { DOCUMENT_SCHEMA, DOCUMENT_VERSION, type CapabilityDocument, type WireDocument } from './types';

export function serializeDocument(doc: CapabilityDocument): WireDocument {
  return {
    schema: DOCUMENT_SCHEMA,
    version: DOCUMENT_VERSION,
    title: doc.title,
    nodes: sortedNodes(doc).map((node) => ({ ...node, metadata: { ...node.metadata } })),
    settings: { ...doc.settings },
    layout: { ...doc.layout, boundingBox: { ...doc.layout.boundingBox } },
    heatmap: { ...doc.heatmap },
    timestamp: doc.timestamp
  };
}

export function stringifyDocument(doc: CapabilityDocument): string {
  return JSON.stringify(serializeDocument(doc), null, 2);
}

