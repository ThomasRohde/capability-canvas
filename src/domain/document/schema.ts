import { z } from 'zod';
import { DEFAULT_SETTINGS } from './defaults';
import { DOCUMENT_SCHEMA, DOCUMENT_VERSION } from './types';

const finiteNumber = z.number().finite();
const positiveNumber = finiteNumber.positive();
const spacingNumber = finiteNumber.nonnegative();

export const LayoutPreferencesSchema = z
  .object({
    marginTop: finiteNumber.optional(),
    marginRight: finiteNumber.optional(),
    marginBottom: finiteNumber.optional(),
    marginLeft: finiteNumber.optional(),
    gapX: finiteNumber.optional(),
    gapY: finiteNumber.optional(),
    mode: z.enum(['uniform', 'flow', 'adaptive', 'free']).optional()
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
    type: z.enum(['root', 'parent', 'leaf', 'text']),
    color: z.enum(['mint', 'sky', 'coral', 'amber', 'lavender', 'peach', 'teal']),
    description: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).default({}),
    layoutPreferences: LayoutPreferencesSchema.optional(),
    isManualPositioningEnabled: z.boolean().default(false),
    isLockedAsIs: z.boolean().default(false),
    isTextLabel: z.boolean().default(false),
    textStyle: z
      .object({
        fontFamily: z.string().optional(),
        fontSize: finiteNumber.optional(),
        fontWeight: finiteNumber.optional(),
        align: z.enum(['left', 'center', 'right']).optional()
      })
      .passthrough()
      .optional(),
    heatmapValue: z.number().min(0).max(1).optional(),
    createdAt: finiteNumber,
    updatedAt: finiteNumber
  })
  .passthrough();

export const SettingsSchema = z
  .object({
    gridEnabled: z.boolean(),
    fixedLeafWidth: positiveNumber,
    fixedLeafHeight: positiveNumber,
    defaultParentWidth: positiveNumber,
    defaultParentHeight: positiveNumber,
    containerPaddingTop: spacingNumber.default(DEFAULT_SETTINGS.containerPaddingTop),
    containerPaddingRight: spacingNumber.default(DEFAULT_SETTINGS.containerPaddingRight),
    containerPaddingBottom: spacingNumber.default(DEFAULT_SETTINGS.containerPaddingBottom),
    containerPaddingLeft: spacingNumber.default(DEFAULT_SETTINGS.containerPaddingLeft),
    childGapX: spacingNumber.default(DEFAULT_SETTINGS.childGapX),
    childGapY: spacingNumber.default(DEFAULT_SETTINGS.childGapY),
    fontFamily: z.string(),
    borderRadius: finiteNumber,
    layoutMode: z.enum(['uniform', 'flow', 'adaptive', 'free'])
  })
  .passthrough();

export const LayoutSchema = z
  .object({
    mode: z.enum(['uniform', 'flow', 'adaptive', 'free']),
    isUserArranged: z.boolean(),
    preservePositions: z.boolean(),
    boundingBox: z.object({
      x: finiteNumber,
      y: finiteNumber,
      w: finiteNumber,
      h: finiteNumber
    })
  })
  .passthrough();

export const HeatmapSchema = z
  .object({
    enabled: z.boolean(),
    showLegend: z.boolean(),
    palette: z.enum(['green-yellow-red', 'mint-amber-coral']),
    fallbackColor: z.enum(['mint', 'sky', 'coral', 'amber', 'lavender', 'peach', 'teal'])
  })
  .passthrough();

export const WireDocumentSchema = z
  .object({
    schema: z.literal(DOCUMENT_SCHEMA),
    version: z.literal(DOCUMENT_VERSION),
    nodes: z.array(NodeSchema),
    settings: SettingsSchema,
    layout: LayoutSchema,
    heatmap: HeatmapSchema,
    timestamp: finiteNumber,
    title: z.string().optional()
  })
  .passthrough();

export type ParsedWireDocument = z.infer<typeof WireDocumentSchema>;
