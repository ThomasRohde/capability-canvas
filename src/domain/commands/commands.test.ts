import { describe, expect, it } from 'vitest';
import { addChild, alignNodes, reparentNode, runTransaction } from './operations';
import { createSampleDocument } from '../fixtures/sample';

describe('commands', () => {
  it('adds children transactionally', () => {
    const doc = createSampleDocument();
    const result = runTransaction(doc, addChild('risk', 'New risk capability'));
    expect(result.diagnostics).toHaveLength(0);
    expect(Object.values(result.doc.nodesById).some((node) => node.label === 'New risk capability')).toBe(true);
  });

  it('rejects reparenting into a descendant', () => {
    const doc = createSampleDocument();
    const result = runTransaction(doc, reparentNode('channels', 'digital-onboarding'));
    expect(result.doc).toBe(doc);
    expect(result.diagnostics.some((diag) => diag.code === 'cycle')).toBe(true);
  });

  it('aligns sibling selections as one transaction', () => {
    const doc = createSampleDocument();
    const result = runTransaction(doc, alignNodes(['credit-risk', 'fraud-risk', 'operational-risk'], 'top'));
    expect(result.diagnostics).toHaveLength(0);
    expect(result.doc.nodesById['credit-risk']!.y).toBe(result.doc.nodesById['fraud-risk']!.y);
  });
});

