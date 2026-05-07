import { describe, expect, it } from 'vitest';
import { createSampleDocument } from '../../domain/fixtures/sample';
import { runTransaction, updateDocumentTitle } from '../../domain/commands/operations';
import { resolveVisualDocument } from '../../domain/visual/workspace';
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
    doc.visual.viewsById[doc.visual.activeViewId]!.heatmap.enabled = true;
    const visualDoc = resolveVisualDocument(doc);
    const node = visualDoc.nodesById['digital-onboarding']!;
    const fill = resolveNodeFill(node, visualDoc.heatmap);
    expect(fill.border).toMatch(/^#/);
    expect(svgExport(doc).data).toContain(fill.border);
  });

  it('keeps visual exports out of heatmap mode when heatmap is disabled', () => {
    const doc = createSampleDocument();
    doc.heatmap.enabled = false;
    const node = doc.nodesById['digital-onboarding']!;
    const categoryFill = resolveNodeFill(node, doc.heatmap);
    const heatmapFill = resolveNodeFill(node, { ...doc.heatmap, enabled: true });
    const heatmapScore = `>${node.heatmapValue!.toFixed(2)}</text>`;
    const svg = svgExport(doc).data;
    const html = htmlExport(doc).data;

    expect(categoryFill.border).not.toBe(heatmapFill.border);
    expect(svg).toContain(`stroke="${categoryFill.border}"`);
    expect(svg).not.toContain(`stroke="${heatmapFill.border}"`);
    expect(svg).not.toContain(heatmapScore);
    expect(html).not.toContain(heatmapScore);
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

  it('adds styled description tooltips to HTML exports', () => {
    const doc = createSampleDocument();
    doc.nodesById['digital-onboarding'] = {
      ...doc.nodesById['digital-onboarding']!,
      description: 'Open <accounts> & onboard "new" customers',
    };
    const html = htmlExport(doc).data;

    expect(html).toContain('class="cc-export-tooltip"');
    expect(html).toContain('data-export-surface');
    expect(html).toContain(
      'data-description="Open &lt;accounts&gt; &amp; onboard &quot;new&quot; customers"',
    );
    expect(svgExport(doc).data).not.toContain('data-description=');
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

  it('keeps JSON full-fidelity while active-view exports omit hidden nodes', () => {
    const doc = createSampleDocument();
    doc.visual.viewsById[doc.visual.activeViewId]!.nodeStatesById['digital-onboarding'] = {
      ...doc.visual.viewsById[doc.visual.activeViewId]!.nodeStatesById['digital-onboarding'],
      isOnCanvas: false,
    };

    expect(jsonExport(doc).data).toContain('digital-onboarding');
    expect(svgExport(doc).data).not.toContain('digital-onboarding');
    expect(htmlExport(doc).data).not.toContain('digital-onboarding');
    expect(drawioExport(doc).data).not.toContain('digital-onboarding');
    expect(archimateExport(doc).data).toContain('digital-onboarding');
  });
});
