import type { CapabilityColor, CapabilityNode, HeatmapState } from '../../domain/document/types';

export interface NodeFill {
  background: string;
  border: string;
  dot: string;
  text: string;
}

export const CAPABILITY_COLORS: CapabilityColor[] = [
  'mint',
  'sky',
  'coral',
  'amber',
  'lavender',
  'peach',
  'teal'
];

export const CATEGORY_STYLES: Record<CapabilityColor, NodeFill> = {
  mint: { background: '#ecfdf5', border: '#6ee7b7', dot: '#10b981', text: '#0f172a' },
  sky: { background: '#ecfeff', border: '#7dd3fc', dot: '#0ea5e9', text: '#0f172a' },
  coral: { background: '#fef2f2', border: '#fca5a5', dot: '#ef4444', text: '#0f172a' },
  amber: { background: '#fffbeb', border: '#fcd34d', dot: '#f59e0b', text: '#0f172a' },
  lavender: { background: '#f5f3ff', border: '#c4b5fd', dot: '#8b5cf6', text: '#0f172a' },
  peach: { background: '#fff7ed', border: '#fdba74', dot: '#f97316', text: '#0f172a' },
  teal: { background: '#f0fdfa', border: '#14b8a6', dot: '#0f766e', text: '#0f172a' }
};

const HEATMAP_PALETTES: Record<HeatmapState['palette'], string[]> = {
  'green-yellow-red': ['#86efac', '#bef264', '#fde047', '#fb923c', '#ef4444'],
  'mint-amber-coral': ['#5eead4', '#99f6e4', '#fcd34d', '#fb923c', '#f87171']
};

export function resolveNodeFill(node: CapabilityNode, heatmap: HeatmapState): NodeFill {
  if (!heatmap.enabled || node.heatmapValue === undefined) {
    return CATEGORY_STYLES[node.color] ?? CATEGORY_STYLES[heatmap.fallbackColor];
  }
  const color = interpolateHeatmap(node.heatmapValue, heatmap.palette);
  return {
    background: tint(color, 0.26),
    border: color,
    dot: color,
    text: '#0f172a'
  };
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
  const stops = HEATMAP_PALETTES[palette] ?? HEATMAP_PALETTES['green-yellow-red'];
  return `linear-gradient(90deg, ${stops.join(', ')})`;
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
