import {
  Download,
  FileJson,
  FolderOpen,
  Grid3X3,
  LayoutTemplate,
  Minus,
  Plus,
  Copy,
  Redo2,
  Settings,
  Trash2,
  Upload,
  Undo2,
  ZoomIn
} from 'lucide-react';
import { addChild, addRoot, deleteNodes, duplicateNodes } from '../../domain/commands/operations';
import { parseDocumentJson } from '../../domain/document/parse';
import { useDocumentStore } from '../../app/stores/documentStore';
import { useUiStore } from '../../app/stores/uiStore';
import { openDocumentFile, saveDocumentFile } from '../../app/fileSystem';
import { IconButton } from '../shared/IconButton';

export function Toolbar() {
  const doc = useDocumentStore((state) => state.doc);
  const execute = useDocumentStore((state) => state.execute);
  const undo = useDocumentStore((state) => state.undo);
  const redo = useDocumentStore((state) => state.redo);
  const autoLayout = useDocumentStore((state) => state.autoLayout);
  const setDocument = useDocumentStore((state) => state.setDocument);
  const selected = useUiStore((state) => state.selectedNodeIds);
  const viewport = useUiStore((state) => state.viewport);
  const setViewport = useUiStore((state) => state.setViewport);
  const setActiveDrawer = useUiStore((state) => state.setActiveDrawer);
  const selectedNode = selected[0] ? doc.nodesById[selected[0]] : null;

  return (
    <header className="cc-toolbar">
      <div className="cc-brand">
        <img className="cc-brand-mark" src="/favicon.svg" alt="" />
        <span className="cc-brand-name">Capability Canvas</span>
      </div>
      <button className="cc-doc-picker" type="button" title={doc.title}>
        {doc.title}
      </button>
      <span className="cc-divider" />
      <IconButton icon={FolderOpen} label="Open JSON file" onClick={() => void openDocumentFile().then((next) => next && setDocument(next))} />
      <button className="cc-btn" type="button" onClick={() => void saveDocumentFile(doc)}>
        <Upload /> Import
      </button>
      <button className="cc-btn" type="button" onClick={() => setActiveDrawer('export')}>
        <Download /> Export
      </button>
      <span className="cc-divider" />
      <button className="cc-btn" type="button" onClick={() => execute(addRoot())}>
        <Plus /> Add root
      </button>
      <button
        className="cc-btn cc-btn-primary"
        type="button"
        disabled={!selectedNode || selectedNode.isTextLabel}
        onClick={() => selectedNode && execute(addChild(selectedNode.id))}
      >
        <Plus /> Add child
      </button>
      <IconButton icon={Copy} label="Duplicate" disabled={selected.length === 0} onClick={() => execute(duplicateNodes(selected))} />
      <IconButton icon={Trash2} label="Delete" disabled={selected.length === 0} onClick={() => execute(deleteNodes(selected))} />
      <span className="cc-divider" />
      <IconButton icon={Undo2} label="Undo" onClick={undo} />
      <IconButton icon={Redo2} label="Redo" onClick={redo} />
      <span className="cc-divider" />
      <button
        className="cc-btn"
        type="button"
        onClick={() => {
          const bounds = doc.layout.boundingBox;
          if (bounds.w > 0) setViewport({ x: 280 - bounds.x * viewport.zoom, y: 60 - bounds.y * viewport.zoom, zoom: 1 });
        }}
      >
        <ZoomIn /> Fit
      </button>
      <IconButton icon={Minus} label="Zoom out" onClick={() => setViewport({ ...viewport, zoom: Math.max(0.25, viewport.zoom - 0.1) })} />
      <span style={{ minWidth: 54, textAlign: 'center', fontSize: 13 }}>{Math.round(viewport.zoom * 100)}%</span>
      <IconButton icon={Plus} label="Zoom in" onClick={() => setViewport({ ...viewport, zoom: Math.min(2.5, viewport.zoom + 0.1) })} />
      <span className="cc-divider" />
      <button className="cc-btn cc-btn-primary" type="button" onClick={() => autoLayout(true)}>
        <LayoutTemplate /> Auto layout
      </button>
      <button
        className="cc-btn"
        type="button"
        onClick={() =>
          useDocumentStore.getState().execute({
            label: 'Toggle heatmap',
            commands: [
              {
                type: 'toggle-heatmap',
                args: {},
                apply: (current) => ({ doc: { ...current, heatmap: { ...current.heatmap, enabled: !current.heatmap.enabled } }, diagnostics: [] })
              }
            ],
            meta: { source: 'edit' }
          })
        }
      >
        <Grid3X3 /> Heatmap
        <span className={`cc-toggle ${doc.heatmap.enabled ? 'on' : ''}`} />
      </button>
      <span className="cc-spacer" />
      <IconButton icon={FileJson} label="Import pasted JSON" onClick={() => {
        const raw = window.prompt('Paste Capability Canvas JSON');
        if (raw) {
          const parsed = parseDocumentJson(raw);
          if (parsed.doc) setDocument(parsed.doc);
        }
      }} />
      <IconButton
        icon={Settings}
        label="Settings"
        onClick={() => setActiveDrawer('settings')}
      />
    </header>
  );
}
