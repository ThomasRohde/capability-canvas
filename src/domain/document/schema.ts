import { z } from "zod";
import { DEFAULT_SETTINGS } from "./defaults";
import { DOCUMENT_SCHEMA, DOCUMENT_VERSION } from "./types";

const finiteNumber = z.number().finite();
const positiveNumber = finiteNumber.positive();
const spacingNumber = finiteNumber.nonnegative();
const layoutModeSchema = z.enum([
  "uniform",
  "flow",
  "adaptive",
  "balanced",
  "free",
]);
const layoutAspectRatioPresetSchema = z.enum([
  "auto",
  "16:9",
  "4:3",
  "1:1",
  "custom",
]);
const capabilityColorSchema = z.enum([
  "mint",
  "sky",
  "coral",
  "amber",
  "lavender",
  "peach",
  "teal",
  "slate",
  "stone",
  "transparent",
]);

export const LayoutPreferencesSchema = z
  .object({
    marginTop: finiteNumber.optional(),
    marginRight: finiteNumber.optional(),
    marginBottom: finiteNumber.optional(),
    marginLeft: finiteNumber.optional(),
    gapX: finiteNumber.optional(),
    gapY: finiteNumber.optional(),
    mode: layoutModeSchema.optional(),
  })
  .passthrough();

export const NodeSchema = z
  .object({
    id: z.string().min(1),
    parentId: z.string().min(1).nullable(),
    label: z.string(),
    x: finiteNumber,
    y: finiteNumber,
    w: positiveNumber,
    h: positiveNumber,
    type: z.enum(["root", "parent", "leaf", "text"]),
    color: capabilityColorSchema,
    colorOverride: capabilityColorSchema.optional(),
    description: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).default({}),
    layoutPreferences: LayoutPreferencesSchema.optional(),
    isManualPositioningEnabled: z.boolean().default(false),
    isLockedAsIs: z.boolean().default(false),
    isTextLabel: z.boolean().default(false),
    isOnCanvas: z.boolean().default(true),
    textStyle: z
      .object({
        fontFamily: z.string().optional(),
        fontSize: finiteNumber.optional(),
        fontWeight: finiteNumber.optional(),
        align: z.enum(["left", "center", "right"]).optional(),
      })
      .passthrough()
      .optional(),
    heatmapValue: z.number().min(0).max(1).optional(),
    createdAt: finiteNumber,
    updatedAt: finiteNumber,
  })
  .passthrough();

export const SettingsSchema = z
  .object({
    gridEnabled: z.boolean(),
    gridSize: positiveNumber.default(DEFAULT_SETTINGS.gridSize),
    resizeSnapToGrid: z.boolean().default(DEFAULT_SETTINGS.resizeSnapToGrid),
    fixedLeafWidth: positiveNumber,
    fixedLeafHeight: positiveNumber,
    leafColor: capabilityColorSchema.default(DEFAULT_SETTINGS.leafColor),
    colorPalette: z
      .enum(["default", "darker"])
      .default(DEFAULT_SETTINGS.colorPalette),
    defaultParentWidth: positiveNumber,
    defaultParentHeight: positiveNumber,
    containerPaddingTop: spacingNumber.default(
      DEFAULT_SETTINGS.containerPaddingTop,
    ),
    containerPaddingRight: spacingNumber.default(
      DEFAULT_SETTINGS.containerPaddingRight,
    ),
    containerPaddingBottom: spacingNumber.default(
      DEFAULT_SETTINGS.containerPaddingBottom,
    ),
    containerPaddingLeft: spacingNumber.default(
      DEFAULT_SETTINGS.containerPaddingLeft,
    ),
    containerTitleHeight: spacingNumber.default(
      DEFAULT_SETTINGS.containerTitleHeight,
    ),
    containerLabelOffsetTop: spacingNumber.default(
      DEFAULT_SETTINGS.containerLabelOffsetTop,
    ),
    childGapX: spacingNumber.default(DEFAULT_SETTINGS.childGapX),
    childGapY: spacingNumber.default(DEFAULT_SETTINGS.childGapY),
    fontFamily: z.string(),
    borderRadius: finiteNumber,
    layoutMode: layoutModeSchema,
    layoutAspectRatioPreset: layoutAspectRatioPresetSchema.default(
      DEFAULT_SETTINGS.layoutAspectRatioPreset,
    ),
    customLayoutAspectRatioWidth: positiveNumber.default(
      DEFAULT_SETTINGS.customLayoutAspectRatioWidth,
    ),
    customLayoutAspectRatioHeight: positiveNumber.default(
      DEFAULT_SETTINGS.customLayoutAspectRatioHeight,
    ),
  })
  .passthrough();

const BoundsSchema = z.object({
  x: finiteNumber,
  y: finiteNumber,
  w: finiteNumber,
  h: finiteNumber,
});

const AspectRatioTargetSchema = z.object({
  w: positiveNumber,
  h: positiveNumber,
});

export const LayoutSchema = z
  .object({
    mode: layoutModeSchema,
    isUserArranged: z.boolean(),
    preservePositions: z.boolean(),
    boundingBox: BoundsSchema,
    aspectRatioFrame: BoundsSchema.optional(),
    aspectRatioTarget: AspectRatioTargetSchema.optional(),
  })
  .passthrough();

export const HeatmapSchema = z
  .object({
    enabled: z.boolean(),
    showLegend: z.boolean(),
    palette: z.enum(["green-yellow-red", "mint-amber-coral"]),
    fallbackColor: capabilityColorSchema,
  })
  .passthrough();

export const VisualNodeStateSchema = z
  .object({
    x: finiteNumber.optional(),
    y: finiteNumber.optional(),
    w: positiveNumber.optional(),
    h: positiveNumber.optional(),
    isOnCanvas: z.boolean().optional(),
    isCollapsed: z.boolean().optional(),
    labelOverride: z.string().optional(),
    colorOverride: capabilityColorSchema.optional(),
    textStyleOverride: z
      .object({
        fontFamily: z.string().optional(),
        fontSize: finiteNumber.optional(),
        fontWeight: finiteNumber.optional(),
        align: z.enum(["left", "center", "right"]).optional(),
      })
      .passthrough()
      .optional(),
    lockedForView: z.boolean().optional(),
    isManualPositioningEnabled: z.boolean().optional(),
  })
  .passthrough();

const VisualBoundsSchema = BoundsSchema;

export const VisualViewSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    description: z.string().optional(),
    createdAt: finiteNumber,
    updatedAt: finiteNumber,
    templateId: z.string().optional(),
    templateContext: z
      .object({
        rootId: z.string().optional(),
      })
      .passthrough()
      .optional(),
    baseline: z
      .object({
        fullHash: z.string(),
        layoutHash: z.string(),
      })
      .optional(),
    nodeStatesById: z.record(z.string(), VisualNodeStateSchema).default({}),
    viewport: z
      .object({
        x: finiteNumber,
        y: finiteNumber,
        zoom: positiveNumber,
      })
      .passthrough()
      .optional(),
    layout: z
      .object({
        mode: layoutModeSchema,
        boundingBox: VisualBoundsSchema.optional(),
        aspectRatioFrame: VisualBoundsSchema.optional(),
        aspectRatioTarget: AspectRatioTargetSchema.optional(),
        isUserArranged: z.boolean().optional(),
        preservePositions: z.boolean(),
      })
      .passthrough(),
    heatmap: z
      .object({
        enabled: z.boolean(),
        activeLensId: z.string().optional(),
        showLegend: z.boolean(),
        legendPosition: z
          .enum([
            "top-right",
            "bottom-right",
            "bottom-left",
            "top-left",
            "custom",
          ])
          .optional(),
        legendBounds: VisualBoundsSchema.optional(),
      })
      .passthrough(),
    export: z
      .object({
        pagePreset: z.string().optional(),
        showTitle: z.boolean().optional(),
        showSubtitle: z.boolean().optional(),
        showFooter: z.boolean().optional(),
        includeGrid: z.boolean().optional(),
      })
      .passthrough()
      .default({}),
  })
  .passthrough();

export const VisualWorkspaceSchema = z
  .object({
    activeViewId: z.string().min(1),
    defaultViewId: z.string().min(1),
    viewOrder: z.array(z.string().min(1)),
    viewsById: z.record(z.string(), VisualViewSchema),
  })
  .passthrough();

export const WireDocumentSchema = z
  .object({
    schema: z.literal(DOCUMENT_SCHEMA),
    version: z.union([
      z.literal("1.0"),
      z.literal("1.1"),
      z.literal(DOCUMENT_VERSION),
    ]),
    nodes: z.array(NodeSchema),
    settings: SettingsSchema,
    layout: LayoutSchema,
    heatmap: HeatmapSchema,
    visual: VisualWorkspaceSchema.optional(),
    timestamp: finiteNumber,
    title: z.string().optional(),
  })
  .passthrough();

export type ParsedWireDocument = z.infer<typeof WireDocumentSchema>;
