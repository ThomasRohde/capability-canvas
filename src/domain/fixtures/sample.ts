import { createEmptyDocument, createNode } from '../document/defaults';
import { ROOT_PARENT_ID, type CapabilityDocument, type NodeId } from '../document/types';
import { ensureParentContainment } from '../layout/containment';
import { createVisualWorkspaceFromDocument, materializeActiveViewMetadata } from '../visual/workspace';

const root = 'retail-banking';

export function createSampleDocument(): CapabilityDocument {
  const doc = createEmptyDocument('Retail Bank Capability Model');
  const nodes = [
    createNode({
      id: root,
      label: 'Retail Banking',
      type: 'root',
      color: 'mint',
      x: 48,
      y: 48,
      w: 960,
      h: 888,
      description: 'Retail banking capability model for customer, risk, operations and channels.'
    }),
    createNode({
      id: 'customer',
      parentId: root,
      label: 'Customer',
      type: 'parent',
      color: 'mint',
      x: 80,
      y: 112,
      w: 928,
      h: 552,
      heatmapValue: 0.58
    }),
    createNode({
      id: 'channels',
      parentId: 'customer',
      label: 'Channels',
      type: 'parent',
      color: 'mint',
      x: 112,
      y: 176,
      w: 864,
      h: 304,
      heatmapValue: 0.61
    }),
    createNode({
      id: 'digital',
      parentId: 'channels',
      label: 'Digital',
      type: 'parent',
      color: 'mint',
      x: 144,
      y: 240,
      w: 400,
      h: 208,
      heatmapValue: 0.62
    }),
    createNode({
      id: 'digital-onboarding',
      parentId: 'digital',
      label: 'Digital Onboarding',
      type: 'leaf',
      color: 'mint',
      x: 176,
      y: 304,
      w: 160,
      h: 52,
      heatmapValue: 0.72,
      description: 'Enables customers to open accounts and complete onboarding through digital channels.',
      metadata: {
        id: 'CAP-CH-DIG-ONBOARD',
        owner: 'Digital Banking',
        source: 'Capability Catalogue v3.2',
        status: 'Active'
      }
    }),
    createNode({
      id: 'digital-servicing',
      parentId: 'digital',
      label: 'Digital Servicing',
      type: 'leaf',
      color: 'mint',
      x: 352,
      y: 304,
      w: 160,
      h: 52,
      heatmapValue: 0.65
    }),
    createNode({
      id: 'digital-sales',
      parentId: 'digital',
      label: 'Digital Sales',
      type: 'leaf',
      color: 'mint',
      x: 176,
      y: 364,
      w: 160,
      h: 52,
      heatmapValue: 0.48
    }),
    createNode({
      id: 'branch',
      parentId: 'channels',
      label: 'Branch',
      type: 'parent',
      color: 'mint',
      x: 544,
      y: 240,
      w: 400,
      h: 180,
      heatmapValue: 0.55
    }),
    createNode({
      id: 'branch-experience',
      parentId: 'branch',
      label: 'Branch Experience',
      type: 'leaf',
      color: 'mint',
      x: 576,
      y: 304,
      w: 160,
      h: 52,
      heatmapValue: 0.59
    }),
    createNode({
      id: 'branch-operations',
      parentId: 'branch',
      label: 'Branch Operations',
      type: 'leaf',
      color: 'mint',
      x: 752,
      y: 304,
      w: 160,
      h: 52,
      heatmapValue: 0.51
    }),
    createNode({
      id: 'servicing',
      parentId: 'customer',
      label: 'Servicing',
      type: 'parent',
      color: 'sky',
      x: 112,
      y: 512,
      w: 864,
      h: 120,
      heatmapValue: 0.65
    }),
    createNode({
      id: 'account-management',
      parentId: 'servicing',
      label: 'Account Management',
      type: 'leaf',
      color: 'sky',
      x: 144,
      y: 576,
      w: 200,
      h: 56,
      heatmapValue: 0.66
    }),
    createNode({
      id: 'customer-support',
      parentId: 'servicing',
      label: 'Customer Support',
      type: 'leaf',
      color: 'sky',
      x: 384,
      y: 576,
      w: 200,
      h: 56,
      heatmapValue: 0.68
    }),
    createNode({
      id: 'communications',
      parentId: 'servicing',
      label: 'Communications',
      type: 'leaf',
      color: 'sky',
      x: 624,
      y: 576,
      w: 200,
      h: 56,
      heatmapValue: 0.6
    }),
    createNode({
      id: 'risk',
      parentId: root,
      label: 'Risk',
      type: 'parent',
      color: 'coral',
      x: 80,
      y: 704,
      w: 444,
      h: 152,
      heatmapValue: 0.46
    }),
    createNode({
      id: 'credit-risk',
      parentId: 'risk',
      label: 'Credit Risk',
      type: 'leaf',
      color: 'coral',
      x: 112,
      y: 768,
      w: 116,
      h: 48,
      heatmapValue: 0.44
    }),
    createNode({
      id: 'fraud-risk',
      parentId: 'risk',
      label: 'Fraud Risk',
      type: 'leaf',
      color: 'coral',
      x: 244,
      y: 768,
      w: 116,
      h: 48,
      heatmapValue: 0.41
    }),
    createNode({
      id: 'operational-risk',
      parentId: 'risk',
      label: 'Operational Risk',
      type: 'leaf',
      color: 'coral',
      x: 376,
      y: 768,
      w: 116,
      h: 48,
      heatmapValue: 0.52
    }),
    createNode({
      id: 'operations',
      parentId: root,
      label: 'Operations',
      type: 'parent',
      color: 'amber',
      x: 556,
      y: 704,
      w: 420,
      h: 200,
      heatmapValue: 0.6
    }),
    createNode({
      id: 'process-management',
      parentId: 'operations',
      label: 'Process Management',
      type: 'leaf',
      color: 'amber',
      x: 588,
      y: 768,
      w: 160,
      h: 48,
      heatmapValue: 0.62
    }),
    createNode({
      id: 'data-management',
      parentId: 'operations',
      label: 'Data Management',
      type: 'leaf',
      color: 'amber',
      x: 764,
      y: 768,
      w: 160,
      h: 48,
      heatmapValue: 0.64
    }),
    createNode({
      id: 'technology-operations',
      parentId: 'operations',
      label: 'Technology Operations',
      type: 'leaf',
      color: 'amber',
      x: 588,
      y: 824,
      w: 160,
      h: 48,
      heatmapValue: 0.63
    }),
    createNode({
      id: 'vendor-management',
      parentId: 'operations',
      label: 'Vendor Management',
      type: 'leaf',
      color: 'amber',
      x: 764,
      y: 824,
      w: 160,
      h: 48,
      heatmapValue: 0.52
    })
  ];

  for (const node of nodes) {
    doc.nodesById[node.id] = node;
    doc.childrenByParentId[node.id] = [];
  }
  doc.childrenByParentId[ROOT_PARENT_ID] = [root];
  for (const node of nodes) {
    if (node.parentId) {
      doc.childrenByParentId[node.parentId] ??= [];
      doc.childrenByParentId[node.parentId]!.push(node.id);
    }
  }
  const contained = ensureParentContainment(doc).doc;
  contained.layout = {
    ...contained.layout,
    isUserArranged: true,
    preservePositions: true
  };
  contained.visual = createVisualWorkspaceFromDocument(contained);
  return materializeActiveViewMetadata(contained);
}

export function createThousandNodeDocument(): CapabilityDocument {
  const doc = createEmptyDocument('1,000 node capability model');
  const rootIds: NodeId[] = [];
  let count = 0;
  for (let r = 0; r < 10; r += 1) {
    const rootId = `root-${r}`;
    rootIds.push(rootId);
    doc.nodesById[rootId] = createNode({
      id: rootId,
      label: `Domain ${r + 1}`,
      type: 'root',
      color: ['mint', 'sky', 'coral', 'amber', 'lavender', 'peach'][r % 6] as never,
      x: 0,
      y: 0,
      w: 900,
      h: 420
    });
    doc.childrenByParentId[rootId] = [];
    for (let p = 0; p < 9; p += 1) {
      const parentId = `root-${r}-parent-${p}`;
      doc.nodesById[parentId] = createNode({
        id: parentId,
        parentId: rootId,
        label: `Capability group ${r + 1}.${p + 1}`,
        type: 'parent',
        color: doc.nodesById[rootId]!.color,
        x: 0,
        y: 0,
        w: 300,
        h: 180,
        heatmapValue: ((r + p) % 10) / 10
      });
      doc.childrenByParentId[rootId]!.push(parentId);
      doc.childrenByParentId[parentId] = [];
      for (let l = 0; l < 10; l += 1) {
        const leafId = `${parentId}-leaf-${l}`;
        doc.nodesById[leafId] = createNode({
          id: leafId,
          parentId,
          label: `Capability ${++count}`,
          type: 'leaf',
          color: doc.nodesById[rootId]!.color,
          x: 0,
          y: 0,
          heatmapValue: (l % 10) / 10
        });
        doc.childrenByParentId[parentId]!.push(leafId);
        doc.childrenByParentId[leafId] = [];
      }
    }
  }
  doc.childrenByParentId[ROOT_PARENT_ID] = rootIds;
  doc.visual = createVisualWorkspaceFromDocument(doc);
  return doc;
}
