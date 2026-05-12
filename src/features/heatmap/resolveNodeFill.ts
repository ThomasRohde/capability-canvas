import type {
  CapabilityColor,
  CapabilityNode,
  ColorPalette,
  HeatmapState,
} from '../../domain/document/types';

export interface NodeFill {
  background: string;
  border: string;
  dot: string;
  text: string;
  isTransparent: boolean;
}

export const CAPABILITY_COLORS: CapabilityColor[] = [
  'mint',
  'sky',
  'coral',
  'amber',
  'lavender',
  'peach',
  'teal',
  'slate',
  'stone',
  'transparent'
];

export const CATEGORY_STYLES: Record<CapabilityColor, NodeFill> = {
  mint: fill('#ecfdf5', '#6ee7b7', '#10b981'),
  sky: fill('#ecfeff', '#7dd3fc', '#0ea5e9'),
  coral: fill('#fef2f2', '#fca5a5', '#ef4444'),
  amber: fill('#fffbeb', '#fcd34d', '#f59e0b'),
  lavender: fill('#f5f3ff', '#c4b5fd', '#8b5cf6'),
  peach: fill('#fff7ed', '#fdba74', '#f97316'),
  teal: fill('#f0fdfa', '#14b8a6', '#0f766e'),
  slate: fill('#f1f5f9', '#64748b', '#475569'),
  stone: fill('#f5f5f4', '#78716c', '#57534e'),
  transparent: transparentFill()
};

export const DARK_CATEGORY_STYLES: Record<CapabilityColor, NodeFill> = {
  mint: fill('#8ABDAA', '#4E6F66', '#4E6F66'),
  sky: fill('#A6C6D8', '#5F7282', '#5F7282'),
  coral: fill('#C99692', '#725C63', '#725C63'),
  amber: fill('#CBB979', '#7D7048', '#7D7048'),
  lavender: fill('#866EAE', '#5A4C78', '#5A4C78'),
  peach: fill('#D6A17C', '#805F4C', '#805F4C'),
  teal: fill('#88BDA9', '#4E7067', '#4E7067'),
  slate: fill('#9D9B9F', '#5C626E', '#5C626E'),
  stone: fill('#E2E5E8', '#626B77', '#626B77'),
  transparent: transparentFill()
};

const HEATMAP_PALETTES: Record<HeatmapState['palette'], string[]> = {
  'green-yellow-red': ['#86efac', '#bef264', '#fde047', '#fb923c', '#ef4444'],
  'mint-amber-coral': ['#5eead4', '#99f6e4', '#fcd34d', '#fb923c', '#f87171']
};

export function resolveNodeFill(
  node: CapabilityNode,
  heatmap: HeatmapState,
  colorPalette: ColorPalette = 'default'
): NodeFill {
  if (!heatmap.enabled || node.heatmapValue === undefined) {
    return categoryStyle(node.color, colorPalette) ?? categoryStyle(heatmap.fallbackColor, colorPalette);
  }
  const color = interpolateHeatmap(node.heatmapValue, heatmap.palette);
  return {
    background: tint(color, 0.26),
    border: color,
    dot: color,
    text: '#0f172a',
    isTransparent: false
  };
}

export function categoryStyle(
  color: CapabilityColor,
  colorPalette: ColorPalette = 'default'
): NodeFill {
  const styles =
    colorPalette === 'darker' ? DARK_CATEGORY_STYLES : CATEGORY_STYLES;
  return styles[color] ?? CATEGORY_STYLES.mint;
}

export function swatchBackgroundForFill(fill: NodeFill): string {
  if (!fill.isTransparent) return fill.background;
  return 'linear-gradient(135deg, transparent calc(50% - 1px), #ef4444 0 calc(50% + 1px), transparent 0), repeating-conic-gradient(#ffffff 0 25%, #e2e8f0 0 50%) 0 / 8px 8px';
}

export function interpolateHeatmap(
  value: number,
  palette: HeatmapState['palette'] = 'green-yellow-red'
): string {
  const stops = HEATMAP_PALETTES[palette] ?? HEATMAP_PALETTES['green-yellow-red'];
  const clamped = Math.max(0, Math.min(1, value));
  const index = clamped * (stops.length - 1);
  const left = Math.floor(index);
  const right = Math.min(stops.length - 1, Math.ceil(index));
  const t = index - left;
  return mix(stops[left]!, stops[right]!, t);
}

export function heatmapGradient(palette: HeatmapState['palette']): string {
  const stops = heatmapPaletteStops(palette);
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

export function heatmapPaletteStops(palette: HeatmapState['palette']): string[] {
  return [...(HEATMAP_PALETTES[palette] ?? HEATMAP_PALETTES['green-yellow-red'])];
}

function mix(a: string, b: string, t: number): string {
  const ac = parseHex(a);
  const bc = parseHex(b);
  return toHex([
    Math.round(ac[0] + (bc[0] - ac[0]) * t),
    Math.round(ac[1] + (bc[1] - ac[1]) * t),
    Math.round(ac[2] + (bc[2] - ac[2]) * t)
  ]);
}

function tint(color: string, amount: number): string {
  return mix('#ffffff', color, amount);
}

function parseHex(color: string): [number, number, number] {
  const normalized = color.replace('#', '');
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16)
  ];
}

function toHex(parts: number[]): string {
  return `#${parts.map((part) => part.toString(16).padStart(2, '0')).join('')}`;
}

function fill(background: string, border: string, dot: string): NodeFill {
  return {
    background,
    border,
    dot,
    text: '#0f172a',
    isTransparent: false
  };
}

function transparentFill(): NodeFill {
  return {
    background: 'transparent',
    border: 'transparent',
    dot: 'transparent',
    text: '#0f172a',
    isTransparent: true
  };
}
