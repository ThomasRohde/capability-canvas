export const MIN_VISIBLE_RIGHT_PADDING = 24;
export const MIN_VISIBLE_BOTTOM_PADDING = 16;

export function visibleHorizontalEdgePadding(value: number) {
  return Math.max(MIN_VISIBLE_RIGHT_PADDING, value);
}

export function visibleVerticalEdgePadding(value: number) {
  return Math.max(MIN_VISIBLE_BOTTOM_PADDING, value);
}
