import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, beforeEach, vi } from "vitest";
import { useDocumentStore } from "../app/stores/documentStore";
import { useTransientStore } from "../app/stores/transientStore";
import { DEFAULT_OUTLINE_WIDTH, useUiStore } from "../app/stores/uiStore";
import { EditorRoute } from "../features/editor/EditorRoute";
import { HELP_SEEN_STORAGE_KEY } from "../features/help/helpStorage";
import { ViewerRoute } from "../features/viewer/ViewerRoute";
import "../styles.css";

export { DEFAULT_OUTLINE_WIDTH };

export function installEditorTestHooks() {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    resetEditorTestState();
  });
}

export function resetEditorTestState() {
  window.history.pushState({}, "", "/");
  window.localStorage.clear();
  window.localStorage.setItem(HELP_SEEN_STORAGE_KEY, "true");
  useDocumentStore.getState().reset();
  useTransientStore.getState().cancel();
  useUiStore.setState({
    selectedNodeIds: ["digital-onboarding"],
    outlineOpen: true,
    outlineWidth: DEFAULT_OUTLINE_WIDTH,
    inspectorOpen: true,
    activeDrawer: null,
    helpDialogOpen: false,
    exportFormat: "json",
    gridPatternVisible: true,
    inspectorTab: "inspector",
    searchQuery: "",
    selectionNotice: null,
    labelEditRequest: null,
    viewport: { x: 0, y: 0, zoom: 1 },
    canvasSize: { w: 1200, h: 800 },
  });
}

export function renderEditor() {
  return render(createElement(EditorRoute));
}

export function renderViewer() {
  return render(createElement(ViewerRoute));
}

export function setupUser() {
  return userEvent.setup();
}
