export const HELP_SEEN_STORAGE_KEY = "capability-canvas.helpSeen";

export function markHelpSeen(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    localStorage.setItem(HELP_SEEN_STORAGE_KEY, "true");
    return true;
  } catch {
    return false;
  }
}

export function hasSeenHelp(): boolean {
  if (typeof localStorage === "undefined") return true;
  try {
    return localStorage.getItem(HELP_SEEN_STORAGE_KEY) !== null;
  } catch {
    return true;
  }
}
