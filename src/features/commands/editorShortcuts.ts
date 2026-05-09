import {
  createEditorCommandRegistry,
  runEditorCommand,
  type EditorCommandContext,
} from "./editorCommands";
import type { CommandDefinition } from "./types";
import { isEditableTarget, isInteractiveTarget } from "./types";

interface EditorShortcutDispatchOptions {
  commands?: CommandDefinition<EditorCommandContext>[];
  editingNodeId?: string | null;
  isInteractiveTarget?: (target: EventTarget | null) => boolean;
}

export function dispatchEditorShortcut(
  event: KeyboardEvent,
  context: EditorCommandContext,
  options: EditorShortcutDispatchOptions = {},
): boolean {
  if (options.editingNodeId) return false;

  if (isEditableTarget(event.target)) {
    if (event.key === "Escape") {
      (event.target as HTMLElement).blur();
      return true;
    }
    return false;
  }

  const commands = options.commands ?? createEditorCommandRegistry();
  const targetIsInteractive =
    options.isInteractiveTarget ?? isInteractiveTarget;

  if (
    event.key === "Enter" &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    context.selectedNodeIds.length === 1 &&
    context.selectedCanvasNodeIds.length === 1 &&
    !targetIsInteractive(event.target)
  ) {
    return runShortcutCommand(event, commands, "model.rename-selected", context);
  }

  if (
    event.key === "Delete" &&
    event.shiftKey &&
    context.selectedNodeIds.length > 0
  ) {
    return runShortcutCommand(event, commands, "model.delete-from-model", context);
  }

  if (event.key === "Delete" && context.selectedCanvasNodeIds.length > 0) {
    return runShortcutCommand(event, commands, "model.remove-from-view", context);
  }

  if (isModKey(event) && event.key.toLowerCase() === "z") {
    return runShortcutCommand(
      event,
      commands,
      event.shiftKey ? "history.redo" : "history.undo",
      context,
      { preventWhenUnavailable: true },
    );
  }

  if (isModKey(event) && event.key.toLowerCase() === "y") {
    return runShortcutCommand(event, commands, "history.redo", context, {
      preventWhenUnavailable: true,
    });
  }

  if (isModKey(event) && event.key.toLowerCase() === "a") {
    return runShortcutCommand(
      event,
      commands,
      "selection.select-visible",
      context,
      { preventWhenUnavailable: true },
    );
  }

  if (
    isModKey(event) &&
    event.key.toLowerCase() === "d" &&
    context.selectedNodeIds.length > 0
  ) {
    return runShortcutCommand(
      event,
      commands,
      "model.duplicate-selected",
      context,
    );
  }

  if (event.key === "Escape") {
    context.actions.cancelTransientPreview();
    return true;
  }

  if (isArrowKey(event.key) && context.selectedNodeIds.length > 0) {
    event.preventDefault();
    context.actions.moveSelectedByKeyboard(event.key, event.shiftKey);
    return true;
  }

  if (
    event.key.toLowerCase() === "f" &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey
  ) {
    return runShortcutCommand(event, commands, "layout.fit-view", context);
  }

  return false;
}

function runShortcutCommand(
  event: KeyboardEvent,
  commands: CommandDefinition<EditorCommandContext>[],
  commandId: string,
  context: EditorCommandContext,
  options: { preventWhenUnavailable?: boolean } = {},
) {
  const ran = runEditorCommand(commands, commandId, context);
  if (ran || options.preventWhenUnavailable) event.preventDefault();
  return ran;
}

function isModKey(event: KeyboardEvent) {
  return event.ctrlKey || event.metaKey;
}

function isArrowKey(
  key: string,
): key is "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" {
  return (
    key === "ArrowLeft" ||
    key === "ArrowRight" ||
    key === "ArrowUp" ||
    key === "ArrowDown"
  );
}
