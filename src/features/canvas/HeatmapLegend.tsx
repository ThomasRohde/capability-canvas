import type { CSSProperties } from "react";
import type { LegendPosition } from "../../domain/document/types";
import { heatmapGradient } from "../heatmap/resolveNodeFill";

export function HeatmapLegend({
  palette,
  position,
}: {
  palette: Parameters<typeof heatmapGradient>[0];
  position?: LegendPosition;
}) {
  return (
    <div className="cc-heat-legend" style={heatmapLegendStyle(position)}>
      <div className="cc-section-title">Heatmap</div>
      <div
        className="cc-heat-bar"
        style={{ background: heatmapGradient(palette) }}
      />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          color: "var(--cc-slate-500)",
          fontSize: 11,
        }}
      >
        <span>Low</span>
        <span>High</span>
      </div>
    </div>
  );
}

function heatmapLegendStyle(
  position: LegendPosition | undefined,
): CSSProperties {
  const effectivePosition = position === "custom" ? "bottom-left" : position;
  switch (effectivePosition) {
    case "top-left":
      return { top: 16, left: 16, bottom: "auto", right: "auto" };
    case "top-right":
      return { top: 16, right: 16, bottom: "auto", left: "auto" };
    case "bottom-right":
      return { right: 16, bottom: 16, top: "auto", left: "auto" };
    case "bottom-left":
    default:
      return { left: 16, bottom: 16, top: "auto", right: "auto" };
  }
}
