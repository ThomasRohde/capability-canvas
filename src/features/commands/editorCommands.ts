import {
  isTextLabelNode,
  type CapabilityNode,
  type NodeId,
} from "../../domain/document/types";
import { available, unavailable, type CommandDefinition } from "./types";

export interface EditorCommandActions {
  addRoot: () => void;
  addLabel: () => void;
  addChild: () => void;
  renameSelected: () => void;
  duplicateSelected: () => void;
  fitView: () => void;
  autoLayout: () => void;
  toggleOutline: () => void;
  toggleInspector: () => void;
  openViews: () => void;
  openSettings: () => void;
  openExport: () => void;
  importFile: () => void;
  importPastedJson: () => void;
  toggleHeatmap: () => void;
  selectAllVisible: () => void;
  removeFromActiveView: () => void;
  deleteFromModel: () => void;
  moveSelectedByKeyboard: (
    direction: "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown",
    largeStep: boolean,
  ) => void;
  cancelTransientPreview: () => void;
  undo: () => void;
  redo: () => void;
}

export interface EditorCommandContext {
  selectedNodeIds: NodeId[];
  selectedCanvasNodeIds: NodeId[];
  visibleSelectableNodeIds: NodeId[];
  selectedNode: CapabilityNode | null;
  hasFitBounds: boolean;
  importBusy: boolean;
  isAutoLayoutRunning: boolean;
  canUndo: boolean;
  canRedo: boolean;
  actions: EditorCommandActions;
}

export function createEditorCommandRegistry(): CommandDefinition<EditorCommandContext>[] {
  return [
    {
      id: "model.add-root",
      group: "Model",
      label: "Add root",
      keywords: ["capability", "new"],
      canRun: () => available(),
      run: ({ actions }) => actions.addRoot(),
    },
    {
      id: "model.add-label",
      group: "Model",
      label: "Add label",
      keywords: ["annotation", "note", "text"],
      canRun: () => available(),
      run: ({ actions }) => actions.addLabel(),
    },
    {
      id: "model.add-child",
      group: "Model",
      label: "Add child",
      keywords: ["capability", "new"],
      canRun: ({ selectedNode }) => {
        if (!selectedNode) return unavailable("Select a capability first.");
        if (isTextLabelNode(selectedNode))
          return unavailable("Text labels cannot have children.");
        return available();
      },
      run: ({ actions }) => actions.addChild(),
    },
    {
      id: "model.rename-selected",
      group: "Model",
      label: "Rename selected",
      keywords: ["edit", "label", "name"],
      shortcut: "Enter",
      canRun: ({ selectedNodeIds, selectedCanvasNodeIds }) => {
        if (selectedNodeIds.length === 0)
          return unavailable("Select one visible item first.");
        if (selectedNodeIds.length > 1)
          return unavailable("Rename works on one selected item at a time.");
        if (selectedCanvasNodeIds.length === 0)
          return unavailable("The selected item is hidden from the active view.");
        return available();
      },
      run: ({ actions }) => actions.renameSelected(),
    },
    {
      id: "model.duplicate-selected",
      group: "Model",
      label: "Duplicate",
      keywords: ["copy", "clone"],
      shortcut: "Ctrl/Cmd+D",
      canRun: ({ selectedNodeIds }) =>
        selectedNodeIds.length > 0
          ? available()
          : unavailable("Select at least one capability first."),
      run: ({ actions }) => actions.duplicateSelected(),
    },
    {
      id: "model.remove-from-view",
      group: "Model",
      label: "Remove from active view",
      keywords: ["hide", "canvas", "visibility"],
      shortcut: "Delete",
      canRun: ({ selectedCanvasNodeIds }) =>
        selectedCanvasNodeIds.length > 0
          ? available()
          : unavailable("Select at least one visible item first."),
      run: ({ actions }) => actions.removeFromActiveView(),
    },
    {
      id: "model.delete-from-model",
      group: "Model",
      label: "Delete from model",
      keywords: ["remove", "source", "permanent"],
      shortcut: "Shift+Delete",
      tone: "danger",
      canRun: ({ selectedNodeIds }) =>
        selectedNodeIds.length > 0
          ? available()
          : unavailable("Select at least one capability first."),
      run: ({ actions }) => actions.deleteFromModel(),
    },
    {
      id: "history.undo",
      group: "History",
      label: "Undo",
      shortcut: "Ctrl/Cmd+Z",
      canRun: ({ canUndo }) =>
        canUndo ? available() : unavailable("There is nothing to undo."),
      run: ({ actions }) => actions.undo(),
    },
    {
      id: "history.redo",
      group: "History",
      label: "Redo",
      shortcut: "Ctrl/Cmd+Y",
      shortcutAliases: ["Ctrl/Cmd+Shift+Z"],
      keywords: ["repeat"],
      canRun: ({ canRedo }) =>
        canRedo ? available() : unavailable("There is nothing to redo."),
      run: ({ actions }) => actions.redo(),
    },
    {
      id: "selection.select-visible",
      group: "Selection",
      label: "Select visible capabilities",
      shortcut: "Ctrl/Cmd+A",
      keywords: ["all", "canvas"],
      canRun: ({ visibleSelectableNodeIds }) =>
        visibleSelectableNodeIds.length > 0
          ? available()
          : unavailable("There are no visible capabilities to select."),
      run: ({ actions }) => actions.selectAllVisible(),
    },
    {
      id: "layout.fit-view",
      group: "Layout",
      label: "Fit view",
      shortcut: "F",
      keywords: ["zoom", "viewport", "center"],
      canRun: ({ hasFitBounds }) =>
        hasFitBounds ? available() : unavailable("There is no visible layout to fit."),
      run: ({ actions }) => actions.fitView(),
    },
    {
      id: "layout.auto-layout",
      group: "Layout",
      label: "Auto layout",
      keywords: ["arrange", "elk"],
      canRun: ({ isAutoLayoutRunning }) =>
        isAutoLayoutRunning
          ? unavailable("Auto layout is already running.")
          : available(),
      run: ({ actions }) => actions.autoLayout(),
    },
    {
      id: "view.toggle-outline",
      group: "View",
      label: "Toggle outline",
      keywords: ["panel", "sidebar", "tree"],
      canRun: () => available(),
      run: ({ actions }) => actions.toggleOutline(),
    },
    {
      id: "view.toggle-inspector",
      group: "View",
      label: "Toggle inspector",
      keywords: ["details", "panel", "sidebar"],
      canRun: () => available(),
      run: ({ actions }) => actions.toggleInspector(),
    },
    {
      id: "view.open-views",
      group: "View",
      label: "Open views",
      keywords: ["visual", "drawer"],
      canRun: () => available(),
      run: ({ actions }) => actions.openViews(),
    },
    {
      id: "view.open-settings",
      group: "View",
      label: "Open settings",
      keywords: ["preferences", "drawer"],
      canRun: () => available(),
      run: ({ actions }) => actions.openSettings(),
    },
    {
      id: "view.toggle-heatmap",
      group: "View",
      label: "Toggle heatmap",
      keywords: ["scores", "risk", "color"],
      canRun: () => available(),
      run: ({ actions }) => actions.toggleHeatmap(),
    },
    {
      id: "file.import-json",
      group: "Import",
      label: "Import JSON file",
      keywords: ["open", "file"],
      canRun: ({ importBusy }) =>
        importBusy ? unavailable("An import is already in progress.") : available(),
      run: ({ actions }) => actions.importFile(),
    },
    {
      id: "file.import-pasted-json",
      group: "Import",
      label: "Import pasted JSON",
      keywords: ["paste", "clipboard"],
      canRun: ({ importBusy }) =>
        importBusy ? unavailable("An import is already in progress.") : available(),
      run: ({ actions }) => actions.importPastedJson(),
    },
    {
      id: "file.open-export",
      group: "Export",
      label: "Export",
      keywords: ["download", "drawer", "file"],
      canRun: () => available(),
      run: ({ actions }) => actions.openExport(),
    },
  ];
}

export function getEditorCommand(
  commands: CommandDefinition<EditorCommandContext>[],
  commandId: string,
): CommandDefinition<EditorCommandContext> | undefined {
  return commands.find((command) => command.id === commandId);
}

export function getEditorCommandAvailability(
  commands: CommandDefinition<EditorCommandContext>[],
  commandId: string,
  context: EditorCommandContext,
) {
  return getEditorCommand(commands, commandId)?.canRun(context);
}

export function runEditorCommand(
  commands: CommandDefinition<EditorCommandContext>[],
  commandId: string,
  context: EditorCommandContext,
): boolean {
  const command = getEditorCommand(commands, commandId);
  if (!command || !command.canRun(context).valid) return false;
  command.run(context);
  return true;
}
