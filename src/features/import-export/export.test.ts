import { describe, expect, it } from 'vitest';
import { createSampleDocument } from '../../domain/fixtures/sample';
import { resolveNodeFill } from '../heatmap/resolveNodeFill';
import { archimateExport } from './archimate';
import { drawioExport } from './drawio';
import { htmlExport } from './html';
import { jsonExport } from './json';
import { svgExport } from './svg';

describe('exports', () => {
  it('exports all static text formats', () => {
    const doc = createSampleDocument();
    expect(jsonExport(doc).data).toContain('capability-canvas.document');
    expect(svgExport(doc).data).toContain('<svg');
    expect(htmlExport(doc).data).toContain('<!doctype html>');
    expect(drawioExport(doc).data).toContain('<mxfile');
    expect(archimateExport(doc).data).toContain('BusinessCapability');
  });

  it('resolves heatmap fills consistently', () => {
    const doc = createSampleDocument();
    doc.heatmap.enabled = true;
    const node = doc.nodesById['digital-onboarding']!;
    const fill = resolveNodeFill(node, doc.heatmap);
    expect(fill.border).toMatch(/^#/);
    expect(svgExport(doc).data).toContain(fill.border);
  });
});

