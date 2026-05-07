import { safeFileBaseName } from '../../domain/document/fileName';
import type { CapabilityDocument } from '../../domain/document/types';
import { resolveVisualDocument } from '../../domain/visual/workspace';
import { escapeXml } from './escape';
import { renderSvg } from './svg';
import type { ExportAdapter, ExportResult } from './types';

export function htmlExport(doc: CapabilityDocument): ExportResult {
  const visualDoc = resolveVisualDocument(doc);
  const svg = renderSvg(visualDoc, { includeDescriptionData: true });
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeXml(visualDoc.title)}</title>
    <style>
      body { margin: 0; background: #f8fafc; color: #0f172a; font-family: Inter, system-ui, sans-serif; }
      main { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
      svg { max-width: 100%; height: auto; border: 1px solid #e2e8f0; background: #f1f5f9; }
      .cc-node[data-description] { cursor: help; }
      .cc-node[data-description]:focus { outline: none; }
      .cc-node[data-description]:focus rect {
        filter: drop-shadow(0 0 0.35rem rgba(20, 184, 166, 0.32));
      }
      .cc-export-tooltip {
        position: fixed;
        top: 0;
        left: 0;
        z-index: 50;
        max-width: min(360px, calc(100vw - 28px));
        padding: 10px 12px;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        background: #fff;
        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08), 0 2px 6px rgba(15, 23, 42, 0.04);
        color: #334155;
        font-size: 12px;
        line-height: 1.45;
        pointer-events: none;
      }
      .cc-export-tooltip[hidden] { display: none; }
    </style>
  </head>
  <body>
    <main data-export-surface>${svg}</main>
    <div class="cc-export-tooltip" data-export-tooltip role="tooltip" hidden></div>
    <script>
      (() => {
        const surface = document.querySelector('[data-export-surface]');
        const tooltip = document.querySelector('[data-export-tooltip]');
        if (!surface || !tooltip) return;

        const nodeFromEvent = (event) =>
          event.target instanceof Element
            ? event.target.closest('g[data-description]')
            : null;

        const hideTooltip = () => {
          tooltip.hidden = true;
        };

        const positionTooltip = (clientX, clientY) => {
          const padding = 12;
          const offset = 14;
          const rect = tooltip.getBoundingClientRect();
          let x = clientX + offset;
          let y = clientY + offset;
          if (x + rect.width > window.innerWidth - padding) x = clientX - rect.width - offset;
          if (y + rect.height > window.innerHeight - padding) y = clientY - rect.height - offset;
          tooltip.style.transform = \`translate(\${Math.max(padding, x)}px, \${Math.max(padding, y)}px)\`;
        };

        const showTooltip = (node, clientX, clientY) => {
          const description = node.getAttribute('data-description');
          if (!description) return;
          tooltip.textContent = description;
          tooltip.hidden = false;
          positionTooltip(clientX, clientY);
        };

        surface.addEventListener('pointerover', (event) => {
          const node = nodeFromEvent(event);
          if (node) showTooltip(node, event.clientX, event.clientY);
        });
        surface.addEventListener('pointermove', (event) => {
          if (!tooltip.hidden) positionTooltip(event.clientX, event.clientY);
        });
        surface.addEventListener('pointerout', (event) => {
          const node = nodeFromEvent(event);
          const relatedNode =
            event.relatedTarget instanceof Element
              ? event.relatedTarget.closest('g[data-description]')
              : null;
          if (node && node !== relatedNode) hideTooltip();
        });
        surface.addEventListener('focusin', (event) => {
          const node = nodeFromEvent(event);
          if (!node) return;
          const rect = node.getBoundingClientRect();
          showTooltip(node, rect.left + rect.width / 2, rect.top + Math.min(rect.height, 32));
        });
        surface.addEventListener('focusout', hideTooltip);
        window.addEventListener('scroll', hideTooltip, true);
        window.addEventListener('blur', hideTooltip);
      })();
    </script>
  </body>
</html>`;
  return {
    format: 'html',
    filename: `${safeFileBaseName(visualDoc.title)}.html`,
    mimeType: 'text/html',
    data: html,
    diagnostics: []
  };
}

export const htmlAdapter: ExportAdapter = {
  format: 'html',
  label: 'HTML',
  description: 'Standalone browser-readable active-view export.',
  scope: 'active-view',
  requiresValidDocument: true,
  hiddenNodes: 'excluded',
  heatmap: 'active-view-display',
  legend: 'not-rendered',
  exportDocument: htmlExport
};
