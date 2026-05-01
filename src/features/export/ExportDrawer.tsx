import { CheckCircle2, Copy, Download, ExternalLink, RefreshCcw, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { validateDocument } from '../../domain/validation/validate';
import { serializeDocument } from '../../domain/document/serialize';
import { useDocumentStore } from '../../app/stores/documentStore';
import { useUiStore } from '../../app/stores/uiStore';
import { adapterFor, saveExportResult } from '../import-export';
import type { ExportFormat } from '../import-export/types';
import { IconButton } from '../shared/IconButton';

const FORMATS: Array<{ format: ExportFormat; tab: string; desc: string }> = [
  { format: 'json', tab: 'JSON', desc: 'Full fidelity model with manual layout and styling.' },
  { format: 'svg', tab: 'Visual', desc: 'Vector visual export for documents and diagrams.' },
  { format: 'html', tab: 'HTML', desc: 'Standalone browser-readable visual export.' },
  { format: 'pptx', tab: 'PowerPoint', desc: 'Native PowerPoint shapes for slide decks.' },
  { format: 'drawio', tab: 'Draw.io', desc: 'diagrams.net XML with nested containment cells.' },
  { format: 'archimate', tab: 'ArchiMate', desc: 'ArchiMate Open Exchange XML export.' }
];

export function ExportDrawer() {
  const doc = useDocumentStore((state) => state.doc);
  const open = useUiStore((state) => state.activeDrawer === 'export');
  const setActiveDrawer = useUiStore((state) => state.setActiveDrawer);
  const format = useUiStore((state) => state.exportFormat);
  const setFormat = useUiStore((state) => state.setExportFormat);
  const [busy, setBusy] = useState(false);
  const validation = useMemo(() => validateDocument(doc), [doc]);
  if (!open) return null;
  const selected = FORMATS.find((item) => item.format === format)!;
  const viewerUrl = `${window.location.origin}/viewer?doc=${encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(serializeDocument(doc))))))}`;

  return (
    <aside className="cc-export-drawer" aria-label="Export">
      <div className="cc-export-head">
        <div className="cc-panel-title">Export</div>
        <IconButton icon={X} label="Close export drawer" onClick={() => setActiveDrawer(null)} />
      </div>
      <div className="cc-export-tabs">
        {FORMATS.map((item) => (
          <button
            key={item.format}
            className={`cc-tab ${format === item.format ? 'on' : ''}`}
            type="button"
            onClick={() => setFormat(item.format)}
          >
            {item.tab}
          </button>
        ))}
      </div>
      <div className="cc-export-body">
        <div className="cc-field">
          <span className="cc-section-title">Format</span>
          <button className="cc-format-card on" type="button">
            <Download size={18} />
            <span>
              <strong>{selected.tab}</strong>
              <br />
              <span style={{ color: 'var(--cc-slate-600)', fontSize: 11 }}>{selected.desc}</span>
            </span>
          </button>
        </div>
        <div className="cc-field">
          <span className="cc-section-title">Validate</span>
          <button className="cc-btn" type="button">
            <RefreshCcw /> Run validation
          </button>
          {['Hierarchy', 'Duplicate IDs', 'Orphaned nodes', 'Missing labels', 'Manual layout bounds', 'References'].map((name) => (
            <div className="cc-validation-row" key={name}>
              <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                <CheckCircle2 size={16} color="#10b981" /> {name}
              </span>
              <span>{validation.valid ? 'No issues' : `${validation.diagnostics.length} issues`}</span>
            </div>
          ))}
        </div>
        <div className="cc-field">
          <span className="cc-section-title">Viewer link</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="cc-input" value={viewerUrl} readOnly />
            <IconButton icon={Copy} label="Copy viewer link" onClick={() => void navigator.clipboard.writeText(viewerUrl)} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
          <button
            className="cc-btn"
            type="button"
            onClick={() => window.open(viewerUrl, '_blank', 'noopener,noreferrer')}
          >
            Open viewer <ExternalLink size={14} />
          </button>
          <button
            className="cc-btn cc-btn-primary"
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void Promise.resolve(adapterFor(format).exportDocument(doc))
                .then(saveExportResult)
                .finally(() => setBusy(false));
            }}
          >
            <Download /> Export file
          </button>
        </div>
      </div>
    </aside>
  );
}
