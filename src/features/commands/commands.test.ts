import { describe, expect, it } from "vitest";
import { createEditorCommandRegistry } from "./editorCommands";
import { commandMatchesSearch } from "./types";

describe("command registry", () => {
  it("explains unavailable selection-sensitive commands", () => {
    const commands = createEditorCommandRegistry();
    const addChild = commands.find((command) => command.id === "model.add-child");
    const deleteFromModel = commands.find(
      (command) => command.id === "model.delete-from-model",
    );
    const context = {
      selectedNodeIds: [],
      selectedCanvasNodeIds: [],
      selectedNode: null,
      hasFitBounds: true,
      importBusy: false,
      isAutoLayoutRunning: false,
      canUndo: false,
      canRedo: false,
      actions: {
        addRoot: () => {},
        addChild: () => {},
        renameSelected: () => {},
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
        removeFromActiveView: () => {},
        deleteFromModel: () => {},
        undo: () => {},
        redo: () => {},
      },
    };

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
});
