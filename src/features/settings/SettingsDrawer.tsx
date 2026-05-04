import { Grid3X3, LayoutTemplate, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  updateDocumentSettings,
  updateDocumentTitle,
  updateHeatmapSettings,
} from "../../domain/commands/operations";
import type { LayoutMode } from "../../domain/document/types";
import { executeMany, useDocumentStore } from "../../app/stores/documentStore";
import { useUiStore } from "../../app/stores/uiStore";
import { importHeatmapCsv } from "../heatmap/csvImport";
import { IconButton } from "../shared/IconButton";

const LAYOUT_MODES: Array<{ value: LayoutMode; label: string }> = [
  { value: "adaptive", label: "Adaptive" },
  { value: "flow", label: "Flow" },
  { value: "uniform", label: "Uniform" },
  { value: "free", label: "Freeform" },
];

export function SettingsDrawer() {
  const doc = useDocumentStore((state) => state.doc);
  const execute = useDocumentStore((state) => state.execute);
  const updateSettings = useDocumentStore((state) => state.updateSettings);
  const autoLayout = useDocumentStore((state) => state.autoLayout);
  const setDiagnostics = useDocumentStore((state) => state.setDiagnostics);
  const isAutoLayoutRunning = useDocumentStore(
    (state) => state.isAutoLayoutRunning,
  );
  const open = useUiStore((state) => state.activeDrawer === "settings");
  const setActiveDrawer = useUiStore((state) => state.setActiveDrawer);

  if (!open) return null;

  return (
    <aside className="cc-settings-drawer" aria-label="Settings">
      <div className="cc-export-head">
        <div className="cc-panel-title">Settings</div>
        <IconButton
          icon={X}
          label="Close settings"
          onClick={() => setActiveDrawer(null)}
        />
      </div>
      <div className="cc-export-body">
        <section className="cc-settings-section">
          <div className="cc-section-heading">
            <LayoutTemplate size={16} />
            <span>Document</span>
          </div>
          <div className="cc-field">
            <label htmlFor="document-title">Title</label>
            <TextSetting
              id="document-title"
              value={doc.title}
              onCommit={(title) => execute(updateDocumentTitle(title))}
            />
          </div>
          <div className="cc-field">
            <label htmlFor="layout-mode">Layout mode</label>
            <select
              id="layout-mode"
              className="cc-select"
              value={doc.settings.layoutMode}
              disabled={isAutoLayoutRunning}
              onChange={(event) =>
                void updateSettings(
                  { layoutMode: event.target.value as LayoutMode },
                  { autoLayout: true },
                )
              }
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
              onChange={(event) =>
                execute(
                  updateDocumentSettings({ gridEnabled: event.target.checked }),
                )
              }
            />
            <span>Show grid</span>
          </label>
          <NumberSetting
            id="grid-size"
            label="Grid size"
            value={doc.settings.gridSize}
            min={4}
            onChange={(gridSize) =>
              execute(updateDocumentSettings({ gridSize }))
            }
          />
          <label className="cc-check-row">
            <input
              type="checkbox"
              checked={doc.settings.resizeSnapToGrid}
              onChange={(event) =>
                execute(
                  updateDocumentSettings({
                    resizeSnapToGrid: event.target.checked,
                  }),
                )
              }
            />
            <span>Snap resizing to grid</span>
          </label>
          <div className="cc-field-row">
            <NumberSetting
              id="leaf-width"
              label="Leaf width"
              value={doc.settings.fixedLeafWidth}
              min={1}
              onChange={(fixedLeafWidth) =>
                void updateSettings({ fixedLeafWidth }, { autoLayout: true })
              }
            />
            <NumberSetting
              id="leaf-height"
              label="Leaf height"
              value={doc.settings.fixedLeafHeight}
              min={1}
              onChange={(fixedLeafHeight) =>
                void updateSettings({ fixedLeafHeight }, { autoLayout: true })
              }
            />
          </div>
          <div className="cc-section-title">New parent defaults</div>
          <div className="cc-field-row">
            <NumberSetting
              id="parent-width"
              label="Width"
              value={doc.settings.defaultParentWidth}
              min={1}
              onChange={(defaultParentWidth) =>
                void updateSettings(
                  { defaultParentWidth },
                  { autoLayout: true },
                )
              }
            />
            <NumberSetting
              id="parent-height"
              label="Height"
              value={doc.settings.defaultParentHeight}
              min={1}
              onChange={(defaultParentHeight) =>
                void updateSettings(
                  { defaultParentHeight },
                  { autoLayout: true },
                )
              }
            />
          </div>
          <div className="cc-section-title">Container padding</div>
          <div className="cc-field-row">
            <NumberSetting
              id="container-padding-top"
              label="Top"
              value={doc.settings.containerPaddingTop}
              onChange={(containerPaddingTop) =>
                void updateSettings(
                  { containerPaddingTop },
                  { autoLayout: true },
                )
              }
            />
            <NumberSetting
              id="container-padding-right"
              label="Right"
              value={doc.settings.containerPaddingRight}
              onChange={(containerPaddingRight) =>
                void updateSettings(
                  { containerPaddingRight },
                  { autoLayout: true },
                )
              }
            />
            <NumberSetting
              id="container-padding-bottom"
              label="Bottom"
              value={doc.settings.containerPaddingBottom}
              onChange={(containerPaddingBottom) =>
                void updateSettings(
                  { containerPaddingBottom },
                  { autoLayout: true },
                )
              }
            />
            <NumberSetting
              id="container-padding-left"
              label="Left"
              value={doc.settings.containerPaddingLeft}
              onChange={(containerPaddingLeft) =>
                void updateSettings(
                  { containerPaddingLeft },
                  { autoLayout: true },
                )
              }
            />
            <NumberSetting
              id="container-title-height"
              label="Title area"
              value={doc.settings.containerTitleHeight}
              onChange={(containerTitleHeight) =>
                void updateSettings(
                  { containerTitleHeight },
                  { autoLayout: true },
                )
              }
            />
            <NumberSetting
              id="container-label-offset-top"
              label="Label top offset"
              value={doc.settings.containerLabelOffsetTop}
              onChange={(containerLabelOffsetTop) =>
                execute(updateDocumentSettings({ containerLabelOffsetTop }))
              }
            />
          </div>
          <div className="cc-section-title">Child gaps</div>
          <div className="cc-field-row">
            <NumberSetting
              id="child-gap-x"
              label="Horizontal"
              value={doc.settings.childGapX}
              onChange={(childGapX) =>
                void updateSettings({ childGapX }, { autoLayout: true })
              }
            />
            <NumberSetting
              id="child-gap-y"
              label="Vertical"
              value={doc.settings.childGapY}
              onChange={(childGapY) =>
                void updateSettings({ childGapY }, { autoLayout: true })
              }
            />
          </div>
          <button
            className="cc-btn"
            type="button"
            disabled={isAutoLayoutRunning}
            onClick={() => void autoLayout(true)}
          >
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
              onChange={(event) =>
                execute(
                  updateHeatmapSettings({ showLegend: event.target.checked }),
                )
              }
            />
            <span>Show legend in heatmap mode</span>
          </label>
          <div className="cc-field">
            <label htmlFor="heatmap-palette">Palette</label>
            <select
              id="heatmap-palette"
              className="cc-select"
              value={doc.heatmap.palette}
              onChange={(event) =>
                execute(
                  updateHeatmapSettings({
                    palette: event.target.value as typeof doc.heatmap.palette,
                  }),
                )
              }
            >
              <option value="green-yellow-red">Green to yellow to red</option>
              <option value="mint-amber-coral">Mint to amber to coral</option>
            </select>
          </div>
          <div className="cc-field">
            <span className="cc-section-title">Data</span>
            <label className="cc-btn cc-file-label" htmlFor="heatmap-csv">
              <Upload /> Import CSV
            </label>
            <input
              id="heatmap-csv"
              className="cc-file-input-hidden"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.currentTarget.value = "";
                if (!file) return;
                void file.text().then((csv) => {
                  const result = importHeatmapCsv(doc, csv);
                  const transactionDiagnostics =
                    result.transactions.length > 0
                      ? executeMany(
                          "Import heatmap CSV",
                          result.transactions,
                          "import",
                        )
                      : [];
                  if (result.transactions.length > 0) {
                    setDiagnostics([
                      ...result.diagnostics,
                      ...transactionDiagnostics,
                    ]);
                  } else {
                    setDiagnostics(result.diagnostics);
                  }
                });
              }}
            />
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
  step = 1,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min?: number;
  step?: number | "any";
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(() => String(Math.max(min, value)));
  const skipCommit = useRef(false);
  useEffect(() => {
    setDraft(String(Math.max(min, value)));
  }, [min, value]);
  const commit = () => {
    if (skipCommit.current) {
      skipCommit.current = false;
      return;
    }
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(Math.max(min, value)));
      return;
    }
    const next = Math.max(min, parsed);
    setDraft(String(next));
    if (next !== value) onChange(next);
  };
  return (
    <div className="cc-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="cc-input"
        type="number"
        min={min}
        step={step}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            (event.target as HTMLInputElement).blur();
          }
          if (event.key === "Escape") {
            skipCommit.current = true;
            setDraft(String(Math.max(min, value)));
            (event.target as HTMLInputElement).blur();
          }
        }}
      />
    </div>
  );
}

function TextSetting({
  id,
  value,
  onCommit,
}: {
  id: string;
  value: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const skipCommit = useRef(false);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  const commit = () => {
    if (skipCommit.current) {
      skipCommit.current = false;
      return;
    }
    if (draft !== value) onCommit(draft);
  };
  return (
    <input
      id={id}
      className="cc-input"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          (event.target as HTMLInputElement).blur();
        }
        if (event.key === "Escape") {
          skipCommit.current = true;
          setDraft(value);
          (event.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}
