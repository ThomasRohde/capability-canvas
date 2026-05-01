import { Grid3X3, LayoutTemplate, X } from 'lucide-react';
import {
  updateDocumentSettings,
  updateDocumentTitle,
  updateHeatmapSettings
} from '../../domain/commands/operations';
import type { LayoutMode } from '../../domain/document/types';
import { useDocumentStore } from '../../app/stores/documentStore';
import { useUiStore } from '../../app/stores/uiStore';
import { IconButton } from '../shared/IconButton';

const LAYOUT_MODES: Array<{ value: LayoutMode; label: string }> = [
  { value: 'adaptive', label: 'Adaptive' },
  { value: 'flow', label: 'Flow' },
  { value: 'uniform', label: 'Uniform' },
  { value: 'free', label: 'Freeform' }
];

export function SettingsDrawer() {
  const doc = useDocumentStore((state) => state.doc);
  const execute = useDocumentStore((state) => state.execute);
  const autoLayout = useDocumentStore((state) => state.autoLayout);
  const open = useUiStore((state) => state.activeDrawer === 'settings');
  const setActiveDrawer = useUiStore((state) => state.setActiveDrawer);

  if (!open) return null;

  return (
    <aside className="cc-settings-drawer" aria-label="Settings">
      <div className="cc-export-head">
        <div className="cc-panel-title">Settings</div>
        <IconButton icon={X} label="Close settings" onClick={() => setActiveDrawer(null)} />
      </div>
      <div className="cc-export-body">
        <section className="cc-settings-section">
          <div className="cc-section-heading">
            <LayoutTemplate size={16} />
            <span>Document</span>
          </div>
          <div className="cc-field">
            <label htmlFor="document-title">Title</label>
            <input
              id="document-title"
              className="cc-input"
              value={doc.title}
              onChange={(event) => execute(updateDocumentTitle(event.target.value))}
            />
          </div>
          <div className="cc-field">
            <label htmlFor="layout-mode">Layout mode</label>
            <select
              id="layout-mode"
              className="cc-select"
              value={doc.settings.layoutMode}
              onChange={(event) => execute(updateDocumentSettings({ layoutMode: event.target.value as LayoutMode }))}
            >
              {LAYOUT_MODES.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="cc-settings-section">
          <div className="cc-section-heading">
            <Grid3X3 size={16} />
            <span>Canvas</span>
          </div>
          <label className="cc-check-row">
            <input
              type="checkbox"
              checked={doc.settings.gridEnabled}
              onChange={(event) => execute(updateDocumentSettings({ gridEnabled: event.target.checked }))}
            />
            <span>Show grid</span>
          </label>
          <div className="cc-field-row">
            <NumberSetting
              id="leaf-width"
              label="Leaf width"
              value={doc.settings.fixedLeafWidth}
              min={1}
              onChange={(fixedLeafWidth) => execute(updateDocumentSettings({ fixedLeafWidth }))}
            />
            <NumberSetting
              id="leaf-height"
              label="Leaf height"
              value={doc.settings.fixedLeafHeight}
              min={1}
              onChange={(fixedLeafHeight) => execute(updateDocumentSettings({ fixedLeafHeight }))}
            />
            <NumberSetting
              id="parent-width"
              label="Parent width"
              value={doc.settings.defaultParentWidth}
              min={1}
              onChange={(defaultParentWidth) => execute(updateDocumentSettings({ defaultParentWidth }))}
            />
            <NumberSetting
              id="parent-height"
              label="Parent height"
              value={doc.settings.defaultParentHeight}
              min={1}
              onChange={(defaultParentHeight) => execute(updateDocumentSettings({ defaultParentHeight }))}
            />
          </div>
          <div className="cc-section-title">Container padding</div>
          <div className="cc-field-row">
            <NumberSetting
              id="container-padding-top"
              label="Top"
              value={doc.settings.containerPaddingTop}
              onChange={(containerPaddingTop) => execute(updateDocumentSettings({ containerPaddingTop }))}
            />
            <NumberSetting
              id="container-padding-right"
              label="Right"
              value={doc.settings.containerPaddingRight}
              onChange={(containerPaddingRight) => execute(updateDocumentSettings({ containerPaddingRight }))}
            />
            <NumberSetting
              id="container-padding-bottom"
              label="Bottom"
              value={doc.settings.containerPaddingBottom}
              onChange={(containerPaddingBottom) => execute(updateDocumentSettings({ containerPaddingBottom }))}
            />
            <NumberSetting
              id="container-padding-left"
              label="Left"
              value={doc.settings.containerPaddingLeft}
              onChange={(containerPaddingLeft) => execute(updateDocumentSettings({ containerPaddingLeft }))}
            />
          </div>
          <div className="cc-section-title">Child gaps</div>
          <div className="cc-field-row">
            <NumberSetting
              id="child-gap-x"
              label="Horizontal"
              value={doc.settings.childGapX}
              onChange={(childGapX) => execute(updateDocumentSettings({ childGapX }))}
            />
            <NumberSetting
              id="child-gap-y"
              label="Vertical"
              value={doc.settings.childGapY}
              onChange={(childGapY) => execute(updateDocumentSettings({ childGapY }))}
            />
          </div>
          <button className="cc-btn" type="button" onClick={() => autoLayout(true)}>
            <LayoutTemplate /> Apply auto layout
          </button>
        </section>

        <section className="cc-settings-section">
          <div className="cc-section-heading">
            <Grid3X3 size={16} />
            <span>Heatmap</span>
          </div>
          <label className="cc-check-row">
            <input
              type="checkbox"
              checked={doc.heatmap.showLegend}
              onChange={(event) => execute(updateHeatmapSettings({ showLegend: event.target.checked }))}
            />
            <span>Show legend in heatmap mode</span>
          </label>
          <div className="cc-field">
            <label htmlFor="heatmap-palette">Palette</label>
            <select
              id="heatmap-palette"
              className="cc-select"
              value={doc.heatmap.palette}
              onChange={(event) => execute(updateHeatmapSettings({ palette: event.target.value as typeof doc.heatmap.palette }))}
            >
              <option value="green-yellow-red">Green to yellow to red</option>
              <option value="mint-amber-coral">Mint to amber to coral</option>
            </select>
          </div>
        </section>
      </div>
    </aside>
  );
}

function NumberSetting({
  id,
  label,
  value,
  min = 0,
  onChange
}: {
  id: string;
  label: string;
  value: number;
  min?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="cc-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="cc-input"
        type="number"
        min={min}
        step={4}
        value={Math.round(value)}
        onChange={(event) => onChange(Math.max(min, Number(event.target.value) || 0))}
      />
    </div>
  );
}
