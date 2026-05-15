import {
  FileDown,
  Grid3X3,
  LayoutTemplate,
  Palette,
  Settings2,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  updateActiveViewExportSettings,
  updateActiveViewHeatmapSettings,
  updateDocumentSettings,
  updateDocumentTitle,
  updateHeatmapSettings,
} from "../../domain/commands/operations";
import type { Transaction } from "../../domain/commands/types";
import type {
  CapabilityColor,
  ColorPalette,
  DiagramSettings,
  LayoutAspectRatioPreset,
  LayoutMode,
} from "../../domain/document/types";
import { useActiveVisualState } from "../../app/activeVisualState";
import { useDocumentStore } from "../../app/stores/documentStore";
import { useUiStore } from "../../app/stores/uiStore";
import { useFocusReturn } from "../shared/a11y";
import { ColorSwatchMatrix } from "../shared/ColorSwatchMatrix";
import { IconButton } from "../shared/IconButton";
import {
  buildSettingsPatch,
  GRID_SIZE_FIELD,
  LAYOUT_NUMERIC_SETTING_GROUPS,
  MODEL_DEFAULT_NUMERIC_SETTING_GROUPS,
  type NumericSettingsField,
  type NumericSettingsGroup,
  type SettingsAutoLayoutPolicy,
} from "./settingsFields";

const LAYOUT_MODES: Array<{ value: LayoutMode; label: string; help: string }> = [
  {
    value: "adaptive",
    label: "Adaptive",
    help: "Balances compact placement with parent containment.",
  },
  {
    value: "balanced",
    label: "Balanced",
    help: "Creates calm, centered rows with export-ready framing.",
  },
  {
    value: "flow",
    label: "Flow",
    help: "Arranges capabilities in a left-to-right reading flow.",
  },
  {
    value: "uniform",
    label: "Uniform",
    help: "Keeps peer groups aligned with consistent spacing.",
  },
  {
    value: "free",
    label: "Freeform",
    help: "Preserves current positions. Choose an automatic mode to rearrange nodes.",
  },
];

const COLOR_PALETTES: Array<{ value: ColorPalette; label: string }> = [
  { value: "default", label: "Default" },
  { value: "darker", label: "Darker" },
];

const LAYOUT_ASPECT_RATIO_PRESETS: Array<{
  value: LayoutAspectRatioPreset;
  label: string;
}> = [
  { value: "auto", label: "Auto" },
  { value: "16:9", label: "16:9" },
  { value: "4:3", label: "4:3" },
  { value: "1:1", label: "1:1" },
  { value: "custom", label: "Custom" },
];

const EXPORT_PAGE_PRESETS = [
  { value: "", label: "None" },
  { value: "16:9", label: "16:9 widescreen" },
  { value: "4:3", label: "4:3 standard" },
  { value: "A4", label: "A4" },
];

export function SettingsDrawer() {
  const doc = useDocumentStore((state) => state.doc);
  const execute = useDocumentStore((state) => state.execute);
  const updateSettings = useDocumentStore((state) => state.updateSettings);
  const autoLayout = useDocumentStore((state) => state.autoLayout);
  const isAutoLayoutRunning = useDocumentStore(
    (state) => state.isAutoLayoutRunning,
  );
  const open = useUiStore((state) => state.activeDrawer === "settings");
  const setActiveDrawer = useUiStore((state) => state.setActiveDrawer);
  const gridPatternVisible = useUiStore((state) => state.gridPatternVisible);
  const setGridPatternVisible = useUiStore(
    (state) => state.setGridPatternVisible,
  );
  const closeRef = useRef<HTMLButtonElement>(null);
  const { activeView } = useActiveVisualState({ doc });
  const selectedLayoutHelp =
    LAYOUT_MODES.find((mode) => mode.value === doc.settings.layoutMode)?.help ??
    "";
  const layoutModeNotice =
    doc.settings.layoutMode === "free"
      ? "Freeform preserves positions; Apply auto layout will not rearrange nodes."
      : "Layout changes may move unlocked nodes in the active view.";
  const commitNumericDocumentSetting = (
    field: NumericSettingsField,
    value: number,
  ) =>
    commitDocumentSetting({
      key: field.key,
      value,
      autoLayout: field.autoLayout,
      execute,
      updateSettings,
    });

  useFocusReturn({ active: open, initialFocusRef: closeRef });

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector("[aria-modal='true']"))
        setActiveDrawer(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, setActiveDrawer]);

  if (!open) return null;

  return (
    <aside className="cc-settings-drawer" aria-label="Settings">
      <div className="cc-export-head">
        <div className="cc-panel-title">Settings</div>
        <IconButton
          ref={closeRef}
          icon={X}
          label="Close settings"
          onClick={() => setActiveDrawer(null)}
        />
      </div>
      <div className="cc-export-body">
        <SettingsSection icon={<Settings2 size={16} />} title="Document">
          <TextSetting
            id="document-title"
            label="Title"
            value={doc.title}
            onCommit={(title) => execute(updateDocumentTitle(title))}
          />
        </SettingsSection>

        <SettingsSection icon={<Palette size={16} />} title="Model defaults">
          <SettingField id="color-palette" label="Color palette">
            <select
              id="color-palette"
              className="cc-select"
              value={doc.settings.colorPalette}
              onChange={(event) =>
                execute(
                  updateDocumentSettings({
                    colorPalette: event.target.value as ColorPalette,
                  }),
                )
              }
            >
              {COLOR_PALETTES.map((palette) => (
                <option key={palette.value} value={palette.value}>
                  {palette.label}
                </option>
              ))}
            </select>
          </SettingField>
          <ColorSetting
            label="Default leaf color"
            value={doc.settings.leafColor}
            colorPalette={doc.settings.colorPalette}
            onChange={(leafColor) =>
              execute(updateDocumentSettings({ leafColor }))
            }
          />
          {MODEL_DEFAULT_NUMERIC_SETTING_GROUPS.map((group) => (
            <NumberSettingGroup
              key={group.id}
              group={group}
              settings={doc.settings}
              onChange={commitNumericDocumentSetting}
            />
          ))}
        </SettingsSection>

        <SettingsSection icon={<LayoutTemplate size={16} />} title="Layout">
          <SettingField
            id="layout-mode"
            label="Layout mode"
            hint={selectedLayoutHelp}
          >
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
          </SettingField>
          <SettingField
            id="layout-aspect-ratio"
            label="Aspect ratio"
            hint="Used by Balanced layout and export framing."
          >
            <select
              id="layout-aspect-ratio"
              className="cc-select"
              value={doc.settings.layoutAspectRatioPreset}
              disabled={isAutoLayoutRunning}
              onChange={(event) =>
                void updateSettings(
                  {
                    layoutAspectRatioPreset: event.target
                      .value as LayoutAspectRatioPreset,
                  },
                  { autoLayout: doc.settings.layoutMode === "balanced" },
                )
              }
            >
              {LAYOUT_ASPECT_RATIO_PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label}
                </option>
              ))}
            </select>
          </SettingField>
          {doc.settings.layoutAspectRatioPreset === "custom" && (
            <div className="cc-field-row">
              <NumberSetting
                id="layout-aspect-ratio-width"
                label="Width ratio"
                value={doc.settings.customLayoutAspectRatioWidth}
                min={0.01}
                step="any"
                disabled={isAutoLayoutRunning}
                onChange={(customLayoutAspectRatioWidth) =>
                  void updateSettings(
                    { customLayoutAspectRatioWidth },
                    { autoLayout: doc.settings.layoutMode === "balanced" },
                  )
                }
              />
              <NumberSetting
                id="layout-aspect-ratio-height"
                label="Height ratio"
                value={doc.settings.customLayoutAspectRatioHeight}
                min={0.01}
                step="any"
                disabled={isAutoLayoutRunning}
                onChange={(customLayoutAspectRatioHeight) =>
                  void updateSettings(
                    { customLayoutAspectRatioHeight },
                    { autoLayout: doc.settings.layoutMode === "balanced" },
                  )
                }
              />
            </div>
          )}
          <div className="cc-settings-warning">{layoutModeNotice}</div>
          {isAutoLayoutRunning && (
            <div className="cc-settings-status" role="status">
              Auto layout running...
            </div>
          )}
          <CheckSetting
            label="Show grid pattern"
            checked={gridPatternVisible}
            onChange={setGridPatternVisible}
          />
          <CheckSetting
            label="Snap movement to grid"
            checked={doc.settings.gridEnabled}
            onChange={(gridEnabled) =>
              execute(updateDocumentSettings({ gridEnabled }))
            }
          />
          <div className="cc-field-row">
            <NumberSetting
              id={GRID_SIZE_FIELD.id}
              label={GRID_SIZE_FIELD.label}
              value={doc.settings[GRID_SIZE_FIELD.key]}
              min={GRID_SIZE_FIELD.min}
              max={GRID_SIZE_FIELD.max}
              step={GRID_SIZE_FIELD.step}
              onChange={(value) =>
                commitNumericDocumentSetting(GRID_SIZE_FIELD, value)
              }
            />
            <CheckSetting
              label="Snap resizing to grid"
              checked={doc.settings.resizeSnapToGrid}
              onChange={(resizeSnapToGrid) =>
                execute(updateDocumentSettings({ resizeSnapToGrid }))
              }
            />
          </div>
          {LAYOUT_NUMERIC_SETTING_GROUPS.map((group) => (
            <NumberSettingGroup
              key={group.id}
              group={group}
              settings={doc.settings}
              onChange={commitNumericDocumentSetting}
            />
          ))}
          <button
            className="cc-btn"
            type="button"
            disabled={isAutoLayoutRunning}
            onClick={() => void autoLayout(true)}
          >
            <LayoutTemplate /> Apply auto layout
          </button>
        </SettingsSection>

        <SettingsSection icon={<SlidersHorizontal size={16} />} title="Active view">
          <CheckSetting
            label="Enable heatmap colors"
            checked={doc.heatmap.enabled}
            onChange={(enabled) =>
              execute(updateActiveViewHeatmapSettings({ enabled }))
            }
          />
          <CheckSetting
            label="Show heatmap legend"
            checked={doc.heatmap.showLegend}
            onChange={(showLegend) =>
              execute(updateActiveViewHeatmapSettings({ showLegend }))
            }
          />
          <CheckSetting
            label="Show value pills"
            checked={doc.heatmap.showValuePills}
            onChange={(showValuePills) =>
              execute(updateActiveViewHeatmapSettings({ showValuePills }))
            }
          />
        </SettingsSection>

        <SettingsSection icon={<Grid3X3 size={16} />} title="Heatmap data">
          <SettingField id="heatmap-palette" label="Palette">
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
          </SettingField>
          <ColorSetting
            label="Fallback color"
            value={doc.heatmap.fallbackColor}
            colorPalette={doc.settings.colorPalette}
            onChange={(fallbackColor) =>
              execute(updateHeatmapSettings({ fallbackColor }))
            }
          />
        </SettingsSection>

        <SettingsSection icon={<FileDown size={16} />} title="Export defaults">
          <SettingField id="export-page-preset" label="Page preset">
            <select
              id="export-page-preset"
              className="cc-select"
              value={activeView?.export.pagePreset ?? ""}
              disabled={!activeView}
              onChange={(event) =>
                execute(
                  updateActiveViewExportSettings({
                    pagePreset: event.target.value || undefined,
                  }),
                )
              }
            >
              {EXPORT_PAGE_PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label}
                </option>
              ))}
            </select>
          </SettingField>
          <CheckSetting
            label="Show title"
            checked={activeView?.export.showTitle ?? false}
            disabled={!activeView}
            onChange={(showTitle) =>
              execute(updateActiveViewExportSettings({ showTitle }))
            }
          />
          <CheckSetting
            label="Show subtitle"
            checked={activeView?.export.showSubtitle ?? false}
            disabled={!activeView}
            onChange={(showSubtitle) =>
              execute(updateActiveViewExportSettings({ showSubtitle }))
            }
          />
          <CheckSetting
            label="Show footer"
            checked={activeView?.export.showFooter ?? false}
            disabled={!activeView}
            onChange={(showFooter) =>
              execute(updateActiveViewExportSettings({ showFooter }))
            }
          />
          <CheckSetting
            label="Include grid"
            checked={activeView?.export.includeGrid ?? false}
            disabled={!activeView}
            onChange={(includeGrid) =>
              execute(updateActiveViewExportSettings({ includeGrid }))
            }
          />
        </SettingsSection>

      </div>
    </aside>
  );
}

function NumberSettingGroup({
  group,
  settings,
  onChange,
}: {
  group: NumericSettingsGroup;
  settings: DiagramSettings;
  onChange: (field: NumericSettingsField, value: number) => void;
}) {
  return (
    <>
      {group.title && <div className="cc-section-title">{group.title}</div>}
      <div className={group.rowClassName}>
        {group.fields.map((field) => (
          <NumberSetting
            key={field.id}
            id={field.id}
            label={field.label}
            value={settings[field.key]}
            min={field.min}
            max={field.max}
            step={field.step}
            onChange={(value) => onChange(field, value)}
          />
        ))}
      </div>
    </>
  );
}

function commitDocumentSetting<Key extends keyof DiagramSettings>({
  key,
  value,
  autoLayout,
  execute,
  updateSettings,
}: {
  key: Key;
  value: DiagramSettings[Key];
  autoLayout: SettingsAutoLayoutPolicy;
  execute: (txn: Transaction) => unknown;
  updateSettings: (
    patch: Partial<DiagramSettings>,
    options?: { autoLayout?: boolean },
  ) => Promise<unknown>;
}) {
  const patch = buildSettingsPatch(key, value);
  if (autoLayout === "always") {
    void updateSettings(patch, { autoLayout: true });
    return;
  }
  execute(updateDocumentSettings(patch));
}

function SettingsSection({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="cc-settings-section">
      <div className="cc-section-heading">
        {icon}
        <span>{title}</span>
      </div>
      {children}
    </section>
  );
}

function SettingField({
  id,
  label,
  hint,
  children,
}: {
  id?: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="cc-field">
      {id ? <label htmlFor={id}>{label}</label> : <span>{label}</span>}
      {children}
      {hint && <div className="cc-field-hint">{hint}</div>}
    </div>
  );
}

function CheckSetting({
  label,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="cc-check-row">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="cc-check-label">{label}</span>
    </label>
  );
}

function ColorSetting({
  label,
  value,
  colorPalette,
  onChange,
}: {
  label: string;
  value: CapabilityColor;
  colorPalette: ColorPalette;
  onChange: (value: CapabilityColor) => void;
}) {
  return (
    <SettingField label={label}>
      <ColorSwatchMatrix
        activeColor={value}
        colorPalette={colorPalette}
        labelForColor={(color) => `Set ${label.toLowerCase()} ${color}`}
        onSelect={onChange}
      />
    </SettingField>
  );
}

function NumberSetting({
  id,
  label,
  value,
  min = 0,
  max,
  step = 1,
  disabled = false,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number | "any";
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const normalizedValue = clampNumber(value, min, max);
  const [draft, setDraft] = useState(() => String(normalizedValue));
  const skipCommit = useRef(false);
  useEffect(() => {
    setDraft(String(clampNumber(value, min, max)));
  }, [max, min, value]);
  const commit = () => {
    if (skipCommit.current) {
      skipCommit.current = false;
      return;
    }
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(clampNumber(value, min, max)));
      return;
    }
    const next = clampNumber(parsed, min, max);
    setDraft(String(next));
    if (next !== value) onChange(next);
  };
  return (
    <SettingField id={id} label={label}>
      <input
        id={id}
        className="cc-input"
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            (event.target as HTMLInputElement).blur();
          }
          if (event.key === "Escape") {
            skipCommit.current = true;
            setDraft(String(clampNumber(value, min, max)));
            (event.target as HTMLInputElement).blur();
          }
        }}
      />
    </SettingField>
  );
}

function TextSetting({
  id,
  label,
  value,
  onCommit,
}: {
  id: string;
  label: string;
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
    <SettingField id={id} label={label}>
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
    </SettingField>
  );
}

function clampNumber(value: number, min: number, max?: number) {
  const lower = Math.max(min, value);
  return max === undefined ? lower : Math.min(max, lower);
}
