import type { CommandDefinition } from "./types";

export interface ShortcutItem {
  keys: string;
  description: string;
}

export interface ShortcutSectionDefinition {
  title: string;
  items: ShortcutItem[];
}

export const STATIC_SHORTCUT_SECTIONS: ShortcutSectionDefinition[] = [
  {
    title: "Pan and zoom",
    items: [
      { keys: "Drag background", description: "Pan the canvas" },
      { keys: "Ctrl/Cmd+wheel", description: "Zoom around the pointer" },
      {
        keys: "Minimap controls",
        description: "Fit, zoom, or jump the viewport",
      },
    ],
  },
  {
    title: "Selection",
    items: [
      { keys: "Click", description: "Select a capability" },
      {
        keys: "Shift/Ctrl/Cmd+click",
        description: "Extend selection within valid sibling sets",
      },
      {
        keys: "Shift/Ctrl/Cmd+drag",
        description: "Marquee select visible capabilities",
      },
      {
        keys: "Ctrl/Cmd+A",
        description: "Select visible capabilities from the current context",
      },
      {
        keys: "Shift+F10 / ContextMenu",
        description: "Open the selected capability context menu",
      },
    ],
  },
  {
    title: "Inline editing",
    items: [
      { keys: "Enter", description: "Rename the selected visible item" },
      { keys: "Double-click label", description: "Rename that item" },
      { keys: "Enter while editing", description: "Commit the label" },
      { keys: "Escape while editing", description: "Cancel the label edit" },
    ],
  },
  {
    title: "Canvas movement",
    items: [
      { keys: "Arrow keys", description: "Move selected capabilities" },
      {
        keys: "Shift+Arrow keys",
        description: "Move selected capabilities by a larger step",
      },
      {
        keys: "Escape",
        description: "Cancel an in-progress drag, resize, or selection preview",
      },
    ],
  },
];

export function commandShortcutItems<TContext>(
  commands: CommandDefinition<TContext>[],
  context: TContext,
): ShortcutItem[] {
  return commands
    .filter((command) => command.shortcut && !command.canRun(context).hidden)
    .map((command) => ({
      keys: [command.shortcut!, ...(command.shortcutAliases ?? [])].join(", "),
      description: `${command.group}: ${command.label}`,
    }));
}
