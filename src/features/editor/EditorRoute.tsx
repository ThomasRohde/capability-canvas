import type { CSSProperties } from "react";
import { useUiStore } from "../../app/stores/uiStore";
import { Canvas } from "../canvas/Canvas";
import { ExportDrawer } from "../export/ExportDrawer";
import { Inspector } from "../inspector/Inspector";
import { Outline } from "../outline/Outline";
import { SettingsDrawer } from "../settings/SettingsDrawer";
import { ViewsDrawer } from "../views/ViewsDrawer";
import { PanelRail } from "./PanelRail";
import { StatusBar } from "./StatusBar";
import { Toolbar } from "./Toolbar";

export function EditorRoute() {
  const outlineOpen = useUiStore((state) => state.outlineOpen);
  const outlineWidth = useUiStore((state) => state.outlineWidth);
  const inspectorOpen = useUiStore((state) => state.inspectorOpen);
  const workspaceStyle = {
    "--cc-outline-width": `${outlineWidth}px`,
  } as CSSProperties;

  return (
    <div className="cc-app">
      <Toolbar />
      <div
        className={`cc-workspace cc-editor-workspace ${outlineOpen ? "" : "outline-closed"} ${inspectorOpen ? "" : "inspector-closed"}`}
        style={workspaceStyle}
      >
        <PanelRail />
        {outlineOpen && <Outline />}
        <Canvas />
        {inspectorOpen && <Inspector />}
      </div>
      <StatusBar />
      <ExportDrawer />
      <SettingsDrawer />
      <ViewsDrawer />
    </div>
  );
}
