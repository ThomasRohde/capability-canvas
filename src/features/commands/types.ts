export interface CommandAvailability {
  valid: boolean;
  reason?: string;
  hidden?: boolean;
}

export interface CommandDefinition<TContext> {
  id: string;
  group: string;
  label: string;
  keywords?: string[];
  shortcut?: string;
  tone?: "default" | "danger";
  canRun: (context: TContext) => CommandAvailability;
  run: (context: TContext) => void;
}

export function available(): CommandAvailability {
  return { valid: true };
}

export function unavailable(reason: string): CommandAvailability {
  return { valid: false, reason };
}

export function hidden(reason = "Unavailable in this route."): CommandAvailability {
  return { valid: false, reason, hidden: true };
}

export function commandMatchesSearch<TContext>(
  command: CommandDefinition<TContext>,
  query: string,
): boolean {
  const normalizedQuery = normalizeCommandText(query);
  if (!normalizedQuery) return true;
  const haystack = [
    command.label,
    command.group,
    command.shortcut ?? "",
    ...(command.keywords ?? []),
  ]
    .map(normalizeCommandText)
    .join(" ");
  return normalizedQuery
    .split(/\s+/)
    .every((term) => haystack.includes(term));
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

function normalizeCommandText(value: string): string {
  return value.trim().toLowerCase().replace(/[+/]/g, " ");
}
