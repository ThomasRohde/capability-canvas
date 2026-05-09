import { sortedNodes } from './normalize';
import { DOCUMENT_SCHEMA, DOCUMENT_VERSION, type CapabilityDocument, type WireDocument } from './types';

export function serializeDocument(doc: CapabilityDocument): WireDocument {
  return {
    schema: DOCUMENT_SCHEMA,
    version: DOCUMENT_VERSION,
    title: doc.title,
    nodes: sortedNodes(doc).map((node) => ({ ...node, metadata: { ...node.metadata } })),
    settings: { ...doc.settings },
    layout: {
      ...doc.layout,
      boundingBox: { ...doc.layout.boundingBox },
      aspectRatioFrame: doc.layout.aspectRatioFrame
        ? { ...doc.layout.aspectRatioFrame }
        : undefined,
      aspectRatioTarget: doc.layout.aspectRatioTarget
        ? { ...doc.layout.aspectRatioTarget }
        : undefined,
    },
    heatmap: { ...doc.heatmap },
    visual: doc.visual,
    timestamp: doc.timestamp
  };
}

export function stringifyDocument(doc: CapabilityDocument): string {
  return JSON.stringify(serializeDocument(doc), null, 2);
}
