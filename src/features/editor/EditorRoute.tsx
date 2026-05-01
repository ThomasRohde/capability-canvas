import { useUiStore } from '../../app/stores/uiStore';
import { Canvas } from '../canvas/Canvas';
import { ExportDrawer } from '../export/ExportDrawer';
import { Inspector } from '../inspector/Inspector';
import { Outline } from '../outline/Outline';
import { SettingsDrawer } from '../settings/SettingsDrawer';
import { PanelRail } from './PanelRail';
import { StatusBar } from './StatusBar';
import { Toolbar } from './Toolbar';

export function EditorRoute() {
  const outlineOpen = useUiStore((state) => state.outlineOpen);
  const inspectorOpen = useUiStore((state) => state.inspectorOpen);

  return (
    <div className="cc-app">
      <Toolbar />
      <div className={`cc-workspace cc-editor-workspace ${outlineOpen ? '' : 'outline-closed'} ${inspectorOpen ? '' : 'inspector-closed'}`}>
        <PanelRail />
        {outlineOpen && <Outline />}
        <Canvas />
        {inspectorOpen && <Inspector />}
      </div>
      <StatusBar />
      <ExportDrawer />
      <SettingsDrawer />
    </div>
  );
}
