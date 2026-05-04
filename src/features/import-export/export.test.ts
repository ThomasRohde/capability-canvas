import { describe, expect, it } from 'vitest';
import { createSampleDocument } from '../../domain/fixtures/sample';
import { runTransaction, updateDocumentTitle } from '../../domain/commands/operations';
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
    expect(archimateExport(doc).data).toContain('xsi:type="Capability"');
  });

  it('resolves heatmap fills consistently', () => {
    const doc = createSampleDocument();
    doc.heatmap.enabled = true;
    const node = doc.nodesById['digital-onboarding']!;
    const fill = resolveNodeFill(node, doc.heatmap);
    expect(fill.border).toMatch(/^#/);
    expect(svgExport(doc).data).toContain(fill.border);
  });

  it('uses the configured heatmap palette', () => {
    const doc = createSampleDocument();
    doc.heatmap.enabled = true;
    const node = doc.nodesById['digital-onboarding']!;
    const defaultFill = resolveNodeFill(node, doc.heatmap);
    doc.heatmap.palette = 'mint-amber-coral';
    const alternateFill = resolveNodeFill(node, doc.heatmap);

    expect(alternateFill.border).toMatch(/^#/);
    expect(alternateFill.border).not.toBe(defaultFill.border);
  });

  it('escapes HTML title content and sanitizes filenames', () => {
    const doc = runTransaction(
      createSampleDocument(),
      updateDocumentTitle('Unsafe </title><script>alert(1)</script> / name')
    ).doc;
    const html = htmlExport(doc);

    expect(html.data).toContain(
      '<title>Unsafe &lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt; / name</title>'
    );
    expect(html.filename).toBe('unsafe-title-script-alert-1-script-name.html');
  });

  it('writes nested draw.io geometry relative to the parent cell', () => {
    const doc = createSampleDocument();
    const child = doc.nodesById['digital-onboarding']!;
    const parent = doc.nodesById[child.parentId!]!;
    const xml = drawioExport(doc).data;

    expect(xml).toContain(`id="${child.id}"`);
    expect(xml).toContain(`parent="${parent.id}"`);
    expect(xml).toContain(`x="${child.x - parent.x}"`);
    expect(xml).toContain(`y="${child.y - parent.y}"`);
  });
});
