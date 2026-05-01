import { HelpCircle, Layers, MessageSquare, Users } from 'lucide-react';
import { useDocumentStore } from '../../app/stores/documentStore';
import { useUiStore } from '../../app/stores/uiStore';
import { IconButton } from '../shared/IconButton';

export function StatusBar({ readonly = false }: { readonly?: boolean }) {
  const doc = useDocumentStore((state) => state.doc);
  const selected = useUiStore((state) => state.selectedNodeIds);
  const diagnostics = useDocumentStore((state) => state.lastDiagnostics);
  return (
    <footer className="cc-status">
      <span className="cc-dot" />
      <span>{readonly ? 'Loaded from URL' : 'Local autosaved'}</span>
      <span className="cc-divider" style={{ height: 14 }} />
      <span>{readonly ? 'Read-only' : 'All changes saved locally'}</span>
      {diagnostics.length > 0 && (
        <>
          <span className="cc-divider" style={{ height: 14 }} />
          <span>{diagnostics.length} diagnostics</span>
        </>
      )}
      <span className="cc-spacer" />
      <span>{readonly ? `${Object.keys(doc.nodesById).length} capabilities` : `${selected.length} selected`}</span>
      <IconButton icon={Layers} label="Layers" />
      <IconButton icon={MessageSquare} label="Notifications" />
      <IconButton icon={HelpCircle} label="Help" />
      <IconButton icon={Users} label="Account" />
    </footer>
  );
}

