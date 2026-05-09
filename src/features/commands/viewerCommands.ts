import { available, unavailable, type CommandDefinition } from "./types";

export interface ViewerCommandActions {
  fitView: () => void;
  toggleHeatmap: () => void;
  exportVisual: () => void;
  importIntoEditor: () => void;
  toggleOutline: () => void;
  toggleInspector: () => void;
}

export interface ViewerCommandContext {
  hasFitBounds: boolean;
  actions: ViewerCommandActions;
}

export function createViewerCommandRegistry(): CommandDefinition<ViewerCommandContext>[] {
  return [
    {
      id: "viewer.fit-view",
      group: "View",
      label: "Fit view",
      keywords: ["zoom", "viewport", "center"],
      canRun: ({ hasFitBounds }) =>
        hasFitBounds ? available() : unavailable("There is no visible layout to fit."),
      run: ({ actions }) => actions.fitView(),
    },
    {
      id: "viewer.toggle-heatmap",
      group: "View",
      label: "Toggle heatmap",
      keywords: ["scores", "risk", "color"],
      canRun: () => available(),
      run: ({ actions }) => actions.toggleHeatmap(),
    },
    {
      id: "viewer.toggle-outline",
      group: "View",
      label: "Toggle outline",
      keywords: ["panel", "sidebar", "tree"],
      canRun: () => available(),
      run: ({ actions }) => actions.toggleOutline(),
    },
    {
      id: "viewer.toggle-inspector",
      group: "View",
      label: "Toggle inspector",
      keywords: ["details", "panel", "sidebar"],
      canRun: () => available(),
      run: ({ actions }) => actions.toggleInspector(),
    },
    {
      id: "viewer.export-visual",
      group: "Export",
      label: "Export visual",
      keywords: ["download", "svg"],
      canRun: () => available(),
      run: ({ actions }) => actions.exportVisual(),
    },
    {
      id: "viewer.import-into-editor",
      group: "Import",
      label: "Import into editor",
      keywords: ["open", "copy", "edit"],
      canRun: () => available(),
      run: ({ actions }) => actions.importIntoEditor(),
    },
  ];
}
