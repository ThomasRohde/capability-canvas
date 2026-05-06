import { Download, Layers3, PanelLeft, PanelRight, Settings } from 'lucide-react';
import { useUiStore } from '../../app/stores/uiStore';

export function PanelRail() {
  const outlineOpen = useUiStore((state) => state.outlineOpen);
  const inspectorOpen = useUiStore((state) => state.inspectorOpen);
  const activeDrawer = useUiStore((state) => state.activeDrawer);
  const toggleOutline = useUiStore((state) => state.toggleOutline);
  const toggleInspector = useUiStore((state) => state.toggleInspector);
  const setActiveDrawer = useUiStore((state) => state.setActiveDrawer);

  return (
    <nav className="cc-panel-rail" aria-label="Workspace tools">
      <button
        className={`cc-rail-btn ${outlineOpen ? 'active' : ''}`}
        type="button"
        aria-label="Toggle outline"
        aria-pressed={outlineOpen}
        title="Outline"
        onClick={toggleOutline}
      >
        <PanelLeft />
      </button>
      <button
        className={`cc-rail-btn ${inspectorOpen ? 'active' : ''}`}
        type="button"
        aria-label="Toggle inspector"
        aria-pressed={inspectorOpen}
        title="Inspector"
        onClick={toggleInspector}
      >
        <PanelRight />
      </button>
      <button
        className={`cc-rail-btn ${activeDrawer === 'views' ? 'active' : ''}`}
        type="button"
        aria-label="Open views"
        aria-pressed={activeDrawer === 'views'}
        title="Views"
        onClick={() => setActiveDrawer(activeDrawer === 'views' ? null : 'views')}
      >
        <Layers3 />
      </button>
      <span className="cc-rail-separator" />
      <button
        className={`cc-rail-btn ${activeDrawer === 'settings' ? 'active' : ''}`}
        type="button"
        aria-label="Open settings"
        aria-pressed={activeDrawer === 'settings'}
        title="Settings"
        onClick={() => setActiveDrawer(activeDrawer === 'settings' ? null : 'settings')}
      >
        <Settings />
      </button>
      <button
        className={`cc-rail-btn ${activeDrawer === 'export' ? 'active' : ''}`}
        type="button"
        aria-label="Open export"
        aria-pressed={activeDrawer === 'export'}
        title="Export"
        onClick={() => setActiveDrawer(activeDrawer === 'export' ? null : 'export')}
      >
        <Download />
      </button>
    </nav>
  );
}
