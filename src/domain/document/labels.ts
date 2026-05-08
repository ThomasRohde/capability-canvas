export const UNTITLED_CAPABILITY_LABEL = "Untitled capability";

export function normalizeNodeLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ") || UNTITLED_CAPABILITY_LABEL;
}
