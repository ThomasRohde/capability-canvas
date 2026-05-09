import { describe, expect, it } from 'vitest';
import { createSampleDocument } from '../../domain/fixtures/sample';
import { runTransaction, updateDocumentTitle } from '../../domain/commands/operations';
import { createEmptyDocument, createNode } from '../../domain/document/defaults';
import { ROOT_PARENT_ID, type CapabilityDocument } from '../../domain/document/types';
import {
  createVisualWorkspaceFromDocument,
  materializeActiveViewMetadata,
  resolveVisualDocument,
} from '../../domain/visual/workspace';
import { resolveNodeFill } from '../heatmap/resolveNodeFill';
import { archimateExport } from './archimate';
import { drawioExport } from './drawio';
import { htmlAdapter, htmlExport } from './html';
import { jsonExport } from './json';
import { pptxAdapter, pptxExport } from './pptx';
import { buildVisualExportModel } from './renderModel';
import { svgAdapter, svgExport } from './svg';

describe('exports', () => {
  it('exports all static text formats', () => {
    const doc = createSampleDocument();
    expect(jsonExport(doc).data).toContain('capability-canvas.document');
    expect(svgExport(doc).data).toContain('<svg');
    expect(htmlExport(doc).data).toContain('<!doctype html>');
    expect(drawioExport(doc).data).toContain('<mxfile');
    expect(archimateExport(doc).data).toContain('xsi:type="Capability"');
  });

  it('exports PPTX native shapes without snapshotting binary output', async () => {
    const result = await pptxExport(createExportFixture());

    expect(result.format).toBe('pptx');
    expect(result.filename).toBe('export-fidelity.pptx');
    expect(result.data).toBeInstanceOf(Blob);
  });

  it('reports active-view legend rendering for visual adapters that render it', () => {
    expect(svgAdapter.legend).toBe('active-view-display');
    expect(htmlAdapter.legend).toBe('active-view-display');
    expect(pptxAdapter.legend).toBe('active-view-display');
  });

  it('snapshots SVG normal color mode fidelity', () => {
    expect(svgExport(createExportFixture()).data).toMatchSnapshot();
  });

  it('snapshots SVG heatmap scores and legend fidelity', () => {
    const doc = createExportFixture();
    const view = doc.visual.viewsById[doc.visual.activeViewId]!;
    view.heatmap = {
      ...view.heatmap,
      enabled: true,
      showLegend: true,
      legendPosition: 'bottom-right',
    };

    expect(svgExport(doc).data).toMatchSnapshot();
  });

  it('snapshots SVG active-view visibility filtering', () => {
    const doc = createExportFixture();
    doc.visual.viewsById[doc.visual.activeViewId]!.nodeStatesById.leaf = {
      ...doc.visual.viewsById[doc.visual.activeViewId]!.nodeStatesById.leaf,
      isOnCanvas: false,
    };

    expect(svgExport(doc).data).toMatchSnapshot();
  });

  it('snapshots the shared render model used by PPTX', () => {
    const doc = createExportFixture();
    const view = doc.visual.viewsById[doc.visual.activeViewId]!;
    view.heatmap = {
      ...view.heatmap,
      enabled: true,
      showLegend: true,
      legendPosition: 'top-right',
    };

    expect(buildVisualExportModel(doc)).toMatchSnapshot();
  });

  it('uses the balanced aspect-ratio frame as visual export bounds', () => {
    const doc = createExportFixture();
    const view = doc.visual.viewsById[doc.visual.activeViewId]!;
    view.layout = {
      ...view.layout,
      mode: 'balanced',
      isUserArranged: false,
      boundingBox: { x: 0, y: 0, w: 260, h: 140 },
      aspectRatioFrame: { x: -24, y: -40, w: 320, h: 180 },
      aspectRatioTarget: { w: 16, h: 9 },
    };

    expect(buildVisualExportModel(doc).documentBounds).toEqual({
      x: -24,
      y: -40,
      w: 320,
      h: 180,
    });
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

  it('computes each visual export fill through resolveNodeFill', () => {
    const doc = createSampleDocument();
    doc.visual.viewsById[doc.visual.activeViewId]!.heatmap.enabled = true;
    const visualDoc = resolveVisualDocument(doc);
    const model = buildVisualExportModel(doc);

    for (const nodeModel of model.nodes) {
      const node = visualDoc.nodesById[nodeModel.id]!;
      expect(nodeModel.fill).toEqual(resolveNodeFill(node, visualDoc.heatmap));
    }
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

  it('keeps explicit zero heatmap scores distinct from unscored nodes', () => {
    const doc = createSampleDocument();
    doc.visual.viewsById[doc.visual.activeViewId]!.heatmap.enabled = true;
    doc.nodesById['digital-onboarding'] = {
      ...doc.nodesById['digital-onboarding']!,
      heatmapValue: 0,
    };
    const explicitZeroSvg = svgExport(doc).data;

    doc.nodesById['digital-onboarding'] = {
      ...doc.nodesById['digital-onboarding']!,
      heatmapValue: undefined,
    };
    const unscoredSvg = svgExport(doc).data;

    expect(explicitZeroSvg).toContain('>0.00</text>');
    expect(unscoredSvg).not.toContain('>0.00</text>');
  });

  it('keeps long exported labels bounded with deterministic ellipsis', () => {
    const model = buildVisualExportModel(createExportFixture());
    const leaf = model.nodes.find((node) => node.id === 'leaf')!;

    expect(leaf.label.lines).toMatchSnapshot();
    expect(Math.max(...leaf.label.lines.map((line) => line.length))).toBeLessThanOrEqual(15);
    expect(leaf.label.lines.at(-1)).toMatch(/\.\.\.$/);
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

function createExportFixture(): CapabilityDocument {
  const doc = createEmptyDocument('Export Fidelity');
  const root = createNode({
    id: 'root',
    label: 'Root Capability',
    type: 'root',
    color: 'mint',
    x: 0,
    y: 0,
    w: 260,
    h: 140,
    heatmapValue: 0.35,
  });
  const leaf = createNode({
    id: 'leaf',
    parentId: 'root',
    label: 'Very long onboarding capability name that should fit',
    type: 'leaf',
    color: 'sky',
    x: 24,
    y: 72,
    w: 120,
    h: 40,
    heatmapValue: 0,
  });

  doc.nodesById = {
    root,
    leaf,
  };
  doc.childrenByParentId = {
    [ROOT_PARENT_ID]: ['root'],
    root: ['leaf'],
    leaf: [],
  };
  doc.layout = {
    ...doc.layout,
    isUserArranged: true,
    preservePositions: true,
    boundingBox: { x: 0, y: 0, w: 260, h: 140 },
  };
  doc.visual = createVisualWorkspaceFromDocument(doc);
  return materializeActiveViewMetadata(doc);
}
