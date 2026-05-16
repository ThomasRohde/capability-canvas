import { describe, expect, it, vi } from "vitest";
import {
  createEditorCommandRegistry,
  getEditorCommand,
  type EditorCommandContext,
} from "./editorCommands";
import { dispatchEditorShortcut } from "./editorShortcuts";
import { commandMatchesSearch } from "./types";

describe("command registry", () => {
  it("explains unavailable selection-sensitive commands", () => {
    const commands = createEditorCommandRegistry();
    const addChild = commands.find((command) => command.id === "model.add-child");
    const deleteFromModel = commands.find(
      (command) => command.id === "model.delete-from-model",
    );
    const context = createCommandContext({
      selectedNodeIds: [],
      selectedCanvasNodeIds: [],
      visibleSelectableNodeIds: [],
      selectedNode: null,
      hasFitBounds: true,
      importBusy: false,
      isAutoLayoutRunning: false,
      canUndo: false,
      canRedo: false,
    });

    expect(addChild?.canRun(context)).toEqual({
      valid: false,
      reason: "Select a capability first.",
    });
    expect(deleteFromModel?.canRun(context)).toEqual({
      valid: false,
      reason: "Select at least one capability first.",
    });
  });

  it("matches command labels, groups, shortcuts, and keywords", () => {
    const commands = createEditorCommandRegistry();
    const fitView = commands.find((command) => command.id === "layout.fit-view")!;

    expect(commandMatchesSearch(fitView, "fit")).toBe(true);
    expect(commandMatchesSearch(fitView, "layout")).toBe(true);
    expect(commandMatchesSearch(fitView, "F")).toBe(true);
    expect(commandMatchesSearch(fitView, "viewport")).toBe(true);
    expect(commandMatchesSearch(fitView, "import")).toBe(false);
  });

  it("dispatches common keyboard shortcuts through matching command entries", () => {
    const commands = createEditorCommandRegistry();
    const calls: string[] = [];
    const context = createCommandContext({
      selectedNodeIds: ["node-1"],
      selectedCanvasNodeIds: ["node-1"],
      visibleSelectableNodeIds: ["node-1", "node-2"],
      hasFitBounds: true,
      canUndo: true,
      canRedo: true,
      actions: {
        renameSelected: () => calls.push("rename"),
        removeFromActiveView: () => calls.push("remove"),
        deleteFromModel: () => calls.push("delete"),
        duplicateSelected: () => calls.push("duplicate"),
        selectAllVisible: () => calls.push("select-all"),
        fitView: () => calls.push("fit"),
        undo: () => calls.push("undo"),
        redo: () => calls.push("redo"),
      },
    });

    expect(getEditorCommand(commands, "model.rename-selected")?.shortcut).toBe(
      "Enter",
    );
    expect(getEditorCommand(commands, "model.remove-from-view")?.shortcut).toBe(
      "Delete",
    );
    expect(getEditorCommand(commands, "model.delete-from-model")?.shortcut).toBe(
      "Shift+Delete",
    );
    expect(
      getEditorCommand(commands, "model.duplicate-selected")?.shortcut,
    ).toBe("Ctrl/Cmd+D");
    expect(
      getEditorCommand(commands, "selection.select-visible")?.shortcut,
    ).toBe("Ctrl/Cmd+A");
    expect(getEditorCommand(commands, "layout.fit-view")?.shortcut).toBe("F");
    expect(getEditorCommand(commands, "history.undo")?.shortcut).toBe(
      "Ctrl/Cmd+Z",
    );

    for (const event of [
      keyEvent("Enter"),
      keyEvent("Delete"),
      keyEvent("Delete", { shiftKey: true }),
      keyEvent("d", { ctrlKey: true }),
      keyEvent("a", { ctrlKey: true }),
      keyEvent("f"),
      keyEvent("z", { ctrlKey: true }),
      keyEvent("y", { ctrlKey: true }),
    ]) {
      dispatchEditorShortcut(event, context, { commands });
      expect(event.defaultPrevented).toBe(true);
    }

    expect(calls).toEqual([
      "rename",
      "remove",
      "delete",
      "duplicate",
      "select-all",
      "fit",
      "undo",
      "redo",
    ]);
  });

  it("keeps unavailable keyboard shortcuts from running actions", () => {
    const commands = createEditorCommandRegistry();
    const removeFromActiveView = vi.fn();
    const deleteFromModel = vi.fn();
    const duplicateSelected = vi.fn();
    const context = createCommandContext({
      selectedNodeIds: [],
      selectedCanvasNodeIds: [],
      visibleSelectableNodeIds: [],
      actions: {
        removeFromActiveView,
        deleteFromModel,
        duplicateSelected,
      },
    });

    expect(
      dispatchEditorShortcut(keyEvent("Delete"), context, { commands }),
    ).toBe(false);
    expect(
      dispatchEditorShortcut(keyEvent("Delete", { shiftKey: true }), context, {
        commands,
      }),
    ).toBe(false);
    expect(
      dispatchEditorShortcut(keyEvent("d", { ctrlKey: true }), context, {
        commands,
      }),
    ).toBe(false);

    expect(removeFromActiveView).not.toHaveBeenCalled();
    expect(deleteFromModel).not.toHaveBeenCalled();
    expect(duplicateSelected).not.toHaveBeenCalled();
  });

  it("does not dispatch editor shortcuts from editable targets", () => {
    const commands = createEditorCommandRegistry();
    const removeFromActiveView = vi.fn();
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    const context = createCommandContext({
      selectedNodeIds: ["node-1"],
      selectedCanvasNodeIds: ["node-1"],
      actions: { removeFromActiveView },
    });
    const deleteEvent = keyEvent("Delete", { target: input });
    const escapeEvent = keyEvent("Escape", { target: input });

    expect(dispatchEditorShortcut(deleteEvent, context, { commands })).toBe(false);
    expect(dispatchEditorShortcut(escapeEvent, context, { commands })).toBe(true);

    expect(removeFromActiveView).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(input);
    input.remove();
  });
});

function createCommandContext(
  patch: Omit<Partial<EditorCommandContext>, "actions"> & {
    actions?: Partial<EditorCommandContext["actions"]>;
  } = {},
): EditorCommandContext {
  const { actions, ...contextPatch } = patch;
  return {
    selectedNodeIds: [],
    selectedCanvasNodeIds: [],
    visibleSelectableNodeIds: [],
    selectedNode: null,
    hasFitBounds: false,
    importBusy: false,
    isAutoLayoutRunning: false,
    canUndo: false,
    canRedo: false,
    ...contextPatch,
    canEditSourceModel: contextPatch.canEditSourceModel ?? true,
    actions: {
      addRoot: () => {},
      addLabel: () => {},
      addChild: () => {},
      renameSelected: () => {},
      duplicateSelected: () => {},
      fitView: () => {},
      autoLayout: () => {},
      toggleOutline: () => {},
      toggleInspector: () => {},
      openViews: () => {},
      openSettings: () => {},
      openExport: () => {},
      importFile: () => {},
      importPastedJson: () => {},
      toggleHeatmap: () => {},
      selectAllVisible: () => {},
      removeFromActiveView: () => {},
      deleteFromModel: () => {},
      moveSelectedByKeyboard: () => {},
      cancelTransientPreview: () => {},
      undo: () => {},
      redo: () => {},
      ...actions,
    },
  };
}

function keyEvent(
  key: string,
  init: KeyboardEventInit & { target?: EventTarget } = {},
) {
  const { target, ...eventInit } = init;
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...eventInit,
  });
  if (target) {
    Object.defineProperty(event, "target", {
      configurable: true,
      value: target,
    });
  }
  return event;
}
