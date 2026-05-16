import type { CSSProperties } from "react";
import type {
  CapabilityColor,
  ColorPalette,
} from "../../domain/document/types";
import {
  CAPABILITY_COLORS,
  categoryStyle,
  swatchBackgroundForFill,
} from "../heatmap/resolveNodeFill";

const MAX_COLOR_MATRIX_COLUMNS = 6;

type ColorMatrixStyle = CSSProperties & {
  "--cc-color-matrix-columns": number;
};

export function ColorSwatchMatrix({
  activeColor,
  colorPalette,
  disabled = false,
  labelForColor,
  onSelect,
}: {
  activeColor?: CapabilityColor | "";
  colorPalette: ColorPalette;
  disabled?: boolean;
  labelForColor: (color: CapabilityColor) => string;
  onSelect: (color: CapabilityColor) => void;
}) {
  const matrixStyle: ColorMatrixStyle = {
    "--cc-color-matrix-columns": colorMatrixColumns(CAPABILITY_COLORS.length),
  };

  return (
    <div className="cc-color-matrix" style={matrixStyle}>
      {CAPABILITY_COLORS.map((color) => {
        const style = categoryStyle(color, colorPalette);
        const label = labelForColor(color);
        return (
          <button
            key={color}
            type="button"
            aria-label={label}
            aria-pressed={activeColor === color}
            className={`cc-color-swatch ${activeColor === color ? "on" : ""}`}
            title={label}
            disabled={disabled}
            style={{
              color: style.isTransparent
                ? "var(--cc-slate-400)"
                : style.border,
              background: swatchBackgroundForFill(style),
            }}
            onClick={() => onSelect(color)}
          />
        );
      })}
    </div>
  );
}

function colorMatrixColumns(colorCount: number) {
  return Math.min(MAX_COLOR_MATRIX_COLUMNS, Math.ceil(colorCount / 2));
}
