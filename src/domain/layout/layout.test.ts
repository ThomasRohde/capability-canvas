import { describe, expect, it } from 'vitest';
import { createEmptyDocument, createNode } from '../document/defaults';
import { updateNode } from '../commands/operations';
import { runTransaction } from '../commands/operations';
import { createSampleDocument, createThousandNodeDocument } from '../fixtures/sample';
import { layoutDocument } from './engine';

describe('layout engine', () => {
  it('does not patch locked nodes', () => {
    const doc = runTransaction(createSampleDocument(), updateNode('risk', { isLockedAsIs: true })).doc;
    const result = layoutDocument({ doc, force: false, mode: 'adaptive' });
    expect(result.patches.find((patch) => patch.id === 'risk')).toBeUndefined();
  });

  it('preserves manual child positions under manual parents', () => {
    const doc = runTransaction(createSampleDocument(), updateNode('risk', { isManualPositioningEnabled: true })).doc;
    const result = layoutDocument({ doc, force: false, mode: 'adaptive' });
    expect(result.patches.find((patch) => patch.id === 'credit-risk')).toBeUndefined();
  });

  it('lays out a large fixture within the budget', () => {
    const doc = createThousandNodeDocument();
    const start = performance.now();
    const result = layoutDocument({ doc, force: true, mode: 'adaptive' });
    const elapsed = performance.now() - start;
    expect(result.patches.length).toBeGreaterThan(900);
    expect(elapsed).toBeLessThan(200);
  });

  it('uses global padding and gap settings when node preferences are absent', () => {
    const doc = twoChildDocument();
    doc.settings.containerPaddingLeft = 48;
    doc.settings.containerPaddingTop = 40;
    doc.settings.childGapX = 24;

    const result = layoutDocument({ doc, force: true, mode: 'uniform' });
    expect(result.patches.find((patch) => patch.id === 'child-a')).toMatchObject({ x: 72, y: 92 });
    expect(result.patches.find((patch) => patch.id === 'child-b')).toMatchObject({ x: 264, y: 92 });
  });

  it('lets node-specific layout preferences override global spacing settings', () => {
    const doc = twoChildDocument();
    doc.settings.containerPaddingLeft = 48;
    doc.settings.containerPaddingTop = 40;
    doc.settings.childGapX = 24;
    doc.nodesById.root = {
      ...doc.nodesById.root!,
      layoutPreferences: { marginLeft: 12, marginTop: 16, gapX: 8 }
    };

    const result = layoutDocument({ doc, force: true, mode: 'uniform' });
    expect(result.patches.find((patch) => patch.id === 'child-a')).toMatchObject({ x: 36, y: 68 });
    expect(result.patches.find((patch) => patch.id === 'child-b')).toMatchObject({ x: 212, y: 68 });
  });
});

function twoChildDocument() {
  const doc = createEmptyDocument();
  doc.nodesById.root = createNode({ id: 'root', label: 'Root', type: 'root', w: 300, h: 140 });
  doc.nodesById['child-a'] = createNode({ id: 'child-a', parentId: 'root', label: 'Child A' });
  doc.nodesById['child-b'] = createNode({ id: 'child-b', parentId: 'root', label: 'Child B' });
  doc.childrenByParentId.__root__ = ['root'];
  doc.childrenByParentId.root = ['child-a', 'child-b'];
  doc.childrenByParentId['child-a'] = [];
  doc.childrenByParentId['child-b'] = [];
  return doc;
}
