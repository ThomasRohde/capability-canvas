import { createEmptyDocument, createNode, DEFAULT_SETTINGS } from '../document/defaults';
import { ROOT_PARENT_ID, type CapabilityDocument, type NodeId } from '../document/types';
import { ensureParentContainment } from '../layout/containment';
import { createVisualWorkspaceFromDocument, materializeActiveViewMetadata } from '../visual/workspace';

const root = 'retail-banking';

export function createSampleDocument(): CapabilityDocument {
  const doc = createEmptyDocument('Retail Bank Capability Model');
  const boxes = createSampleLayout();
  const sampleNode = (partial: Parameters<typeof createNode>[0]) => {
    const box = boxes[partial.id];
    if (!box) throw new Error(`Missing sample layout for ${partial.id}`);
    return createNode({ ...partial, ...box });
  };
  const nodes = [
    sampleNode({
      id: root,
      label: 'Retail Banking',
      type: 'root',
      color: 'mint',
      description: 'Retail banking capability model for customer, risk, operations and channels.'
    }),
    sampleNode({
      id: 'customer',
      parentId: root,
      label: 'Customer',
      type: 'parent',
      color: 'mint',
      heatmapValue: 0.58
    }),
    sampleNode({
      id: 'channels',
      parentId: 'customer',
      label: 'Channels',
      type: 'parent',
      color: 'mint',
      heatmapValue: 0.61
    }),
    sampleNode({
      id: 'digital',
      parentId: 'channels',
      label: 'Digital',
      type: 'parent',
      color: 'mint',
      heatmapValue: 0.62
    }),
    sampleNode({
      id: 'digital-onboarding',
      parentId: 'digital',
      label: 'Digital Onboarding',
      type: 'leaf',
      color: 'mint',
      heatmapValue: 0.72,
      description: 'Enables customers to open accounts and complete onboarding through digital channels.',
      metadata: {
        id: 'CAP-CH-DIG-ONBOARD',
        owner: 'Digital Banking',
        source: 'Capability Catalogue v3.2',
        status: 'Active'
      }
    }),
    sampleNode({
      id: 'digital-servicing',
      parentId: 'digital',
      label: 'Digital Servicing',
      type: 'leaf',
      color: 'mint',
      heatmapValue: 0.65
    }),
    sampleNode({
      id: 'digital-sales',
      parentId: 'digital',
      label: 'Digital Sales',
      type: 'leaf',
      color: 'mint',
      heatmapValue: 0.48
    }),
    sampleNode({
      id: 'branch',
      parentId: 'channels',
      label: 'Branch',
      type: 'parent',
      color: 'mint',
      heatmapValue: 0.55
    }),
    sampleNode({
      id: 'branch-experience',
      parentId: 'branch',
      label: 'Branch Experience',
      type: 'leaf',
      color: 'mint',
      heatmapValue: 0.59
    }),
    sampleNode({
      id: 'branch-operations',
      parentId: 'branch',
      label: 'Branch Operations',
      type: 'leaf',
      color: 'mint',
      heatmapValue: 0.51
    }),
    sampleNode({
      id: 'servicing',
      parentId: 'customer',
      label: 'Servicing',
      type: 'parent',
      color: 'sky',
      heatmapValue: 0.65
    }),
    sampleNode({
      id: 'account-management',
      parentId: 'servicing',
      label: 'Account Management',
      type: 'leaf',
      color: 'sky',
      heatmapValue: 0.66
    }),
    sampleNode({
      id: 'customer-support',
      parentId: 'servicing',
      label: 'Customer Support',
      type: 'leaf',
      color: 'sky',
      heatmapValue: 0.68
    }),
    sampleNode({
      id: 'communications',
      parentId: 'servicing',
      label: 'Communications',
      type: 'leaf',
      color: 'sky',
      heatmapValue: 0.6
    }),
    sampleNode({
      id: 'risk',
      parentId: root,
      label: 'Risk',
      type: 'parent',
      color: 'coral',
      heatmapValue: 0.46
    }),
    sampleNode({
      id: 'credit-risk',
      parentId: 'risk',
      label: 'Credit Risk',
      type: 'leaf',
      color: 'coral',
      heatmapValue: 0.44
    }),
    sampleNode({
      id: 'fraud-risk',
      parentId: 'risk',
      label: 'Fraud Risk',
      type: 'leaf',
      color: 'coral',
      heatmapValue: 0.41
    }),
    sampleNode({
      id: 'operational-risk',
      parentId: 'risk',
      label: 'Operational Risk',
      type: 'leaf',
      color: 'coral',
      heatmapValue: 0.52
    }),
    sampleNode({
      id: 'operations',
      parentId: root,
      label: 'Operations',
      type: 'parent',
      color: 'amber',
      heatmapValue: 0.6
    }),
    sampleNode({
      id: 'process-management',
      parentId: 'operations',
      label: 'Process Management',
      type: 'leaf',
      color: 'amber',
      heatmapValue: 0.62
    }),
    sampleNode({
      id: 'data-management',
      parentId: 'operations',
      label: 'Data Management',
      type: 'leaf',
      color: 'amber',
      heatmapValue: 0.64
    }),
    sampleNode({
      id: 'technology-operations',
      parentId: 'operations',
      label: 'Technology Operations',
      type: 'leaf',
      color: 'amber',
      heatmapValue: 0.63
    }),
    sampleNode({
      id: 'vendor-management',
      parentId: 'operations',
      label: 'Vendor Management',
      type: 'leaf',
      color: 'amber',
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

interface SampleBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface SampleLayoutNode {
  id: NodeId;
  rows?: SampleLayoutNode[][];
}

interface SampleLayoutResult {
  w: number;
  h: number;
  boxes: Record<NodeId, SampleBox>;
}

function createSampleLayout(): Record<NodeId, SampleBox> {
  const tree: SampleLayoutNode = {
    id: root,
    rows: [
      [
        {
          id: 'customer',
          rows: [
            [
              {
                id: 'channels',
                rows: [
                  [
                    {
                      id: 'digital',
                      rows: [
                        [{ id: 'digital-onboarding' }, { id: 'digital-servicing' }],
                        [{ id: 'digital-sales' }]
                      ]
                    },
                    {
                      id: 'branch',
                      rows: [[{ id: 'branch-experience' }, { id: 'branch-operations' }]]
                    }
                  ]
                ]
              }
            ],
            [
              {
                id: 'servicing',
                rows: [[{ id: 'account-management' }, { id: 'customer-support' }, { id: 'communications' }]]
              }
            ]
          ]
        }
      ],
      [
        {
          id: 'risk',
          rows: [[{ id: 'credit-risk' }, { id: 'fraud-risk' }, { id: 'operational-risk' }]]
        },
        {
          id: 'operations',
          rows: [
            [{ id: 'process-management' }, { id: 'data-management' }],
            [{ id: 'technology-operations' }, { id: 'vendor-management' }]
          ]
        }
      ]
    ]
  };
  const layout = layoutSampleNode(tree);
  const origin = 24;
  return Object.fromEntries(
    Object.entries(layout.boxes).map(([id, box]) => [
      id,
      { ...box, x: box.x + origin, y: box.y + origin }
    ])
  );
}

function layoutSampleNode(node: SampleLayoutNode): SampleLayoutResult {
  const settings = DEFAULT_SETTINGS;
  if (!node.rows) {
    const box = {
      x: 0,
      y: 0,
      w: settings.fixedLeafWidth,
      h: settings.fixedLeafHeight
    };
    return { w: box.w, h: box.h, boxes: { [node.id]: box } };
  }

  const boxes: Record<NodeId, SampleBox> = {};
  let rowY = settings.containerPaddingTop + settings.containerTitleHeight;
  let maxRight = 0;
  let contentBottom = rowY;

  for (const row of node.rows) {
    let columnX = settings.containerPaddingLeft;
    let rowHeight = 0;
    for (const child of row) {
      const childLayout = layoutSampleNode(child);
      for (const [id, box] of Object.entries(childLayout.boxes)) {
        boxes[id] = {
          ...box,
          x: box.x + columnX,
          y: box.y + rowY
        };
      }
      rowHeight = Math.max(rowHeight, childLayout.h);
      maxRight = Math.max(maxRight, columnX + childLayout.w);
      columnX += childLayout.w + settings.childGapX;
    }
    contentBottom = rowY + rowHeight;
    rowY = contentBottom + settings.childGapY;
  }

  const box = {
    x: 0,
    y: 0,
    w: Math.max(settings.defaultParentWidth, maxRight + settings.containerPaddingRight),
    h: Math.max(settings.defaultParentHeight, contentBottom + settings.containerPaddingBottom)
  };
  return {
    w: box.w,
    h: box.h,
    boxes: { [node.id]: box, ...boxes }
  };
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
