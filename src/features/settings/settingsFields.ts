import type { DiagramSettings } from "../../domain/document/types";

export type NumericSettingsKey = {
  [Key in keyof DiagramSettings]: DiagramSettings[Key] extends number
    ? Key
    : never;
}[keyof DiagramSettings];

export type SettingsFieldSection = "model-defaults" | "layout";
export type SettingsAutoLayoutPolicy = "always" | "never";

export interface NumericSettingsField<
  Key extends NumericSettingsKey = NumericSettingsKey,
> {
  id: string;
  key: Key;
  label: string;
  section: SettingsFieldSection;
  min: number;
  max?: number;
  step: number | "any";
  autoLayout: SettingsAutoLayoutPolicy;
}

export interface NumericSettingsGroup {
  id: string;
  title?: string;
  rowClassName: string;
  fields: readonly NumericSettingsField[];
}

export const MODEL_DEFAULT_NUMERIC_SETTING_GROUPS = [
  {
    id: "leaf-size",
    rowClassName: "cc-field-row",
    fields: [
      {
        id: "leaf-width",
        key: "fixedLeafWidth",
        label: "Leaf width",
        section: "model-defaults",
        min: 1,
        step: 1,
        autoLayout: "always",
      },
      {
        id: "leaf-height",
        key: "fixedLeafHeight",
        label: "Leaf height",
        section: "model-defaults",
        min: 1,
        step: 1,
        autoLayout: "always",
      },
    ],
  },
  {
    id: "parent-default-size",
    title: "New parent defaults",
    rowClassName: "cc-field-row",
    fields: [
      {
        id: "parent-width",
        key: "defaultParentWidth",
        label: "Width",
        section: "model-defaults",
        min: 1,
        step: 1,
        autoLayout: "always",
      },
      {
        id: "parent-height",
        key: "defaultParentHeight",
        label: "Height",
        section: "model-defaults",
        min: 1,
        step: 1,
        autoLayout: "always",
      },
    ],
  },
] as const satisfies readonly NumericSettingsGroup[];

export const GRID_SIZE_FIELD: NumericSettingsField<"gridSize"> = {
  id: "grid-size",
  key: "gridSize",
  label: "Grid size",
  section: "layout",
  min: 4,
  step: 1,
  autoLayout: "never",
};

export const LAYOUT_NUMERIC_SETTING_GROUPS = [
  {
    id: "container-padding",
    title: "Container padding",
    rowClassName: "cc-field-row cc-field-row-compact",
    fields: [
      {
        id: "container-padding-top",
        key: "containerPaddingTop",
        label: "Top",
        section: "layout",
        min: 0,
        step: 1,
        autoLayout: "always",
      },
      {
        id: "container-padding-right",
        key: "containerPaddingRight",
        label: "Right",
        section: "layout",
        min: 0,
        step: 1,
        autoLayout: "always",
      },
      {
        id: "container-padding-bottom",
        key: "containerPaddingBottom",
        label: "Bottom",
        section: "layout",
        min: 0,
        step: 1,
        autoLayout: "always",
      },
      {
        id: "container-padding-left",
        key: "containerPaddingLeft",
        label: "Left",
        section: "layout",
        min: 0,
        step: 1,
        autoLayout: "always",
      },
    ],
  },
  {
    id: "container-title",
    rowClassName: "cc-field-row",
    fields: [
      {
        id: "container-title-height",
        key: "containerTitleHeight",
        label: "Title area",
        section: "layout",
        min: 0,
        step: 1,
        autoLayout: "always",
      },
      {
        id: "container-label-offset-top",
        key: "containerLabelOffsetTop",
        label: "Label top offset",
        section: "layout",
        min: 0,
        step: 1,
        autoLayout: "never",
      },
    ],
  },
  {
    id: "child-gaps",
    title: "Child gaps",
    rowClassName: "cc-field-row",
    fields: [
      {
        id: "child-gap-x",
        key: "childGapX",
        label: "Horizontal",
        section: "layout",
        min: 0,
        step: 1,
        autoLayout: "always",
      },
      {
        id: "child-gap-y",
        key: "childGapY",
        label: "Vertical",
        section: "layout",
        min: 0,
        step: 1,
        autoLayout: "always",
      },
    ],
  },
] as const satisfies readonly NumericSettingsGroup[];

export function buildSettingsPatch<Key extends keyof DiagramSettings>(
  key: Key,
  value: DiagramSettings[Key],
): Pick<DiagramSettings, Key> {
  return { [key]: value } as Pick<DiagramSettings, Key>;
}
