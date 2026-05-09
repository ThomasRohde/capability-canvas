import {
  type Bounds,
  type CapabilityDocument,
  type LayoutAspectRatioTarget,
} from "../document/types";
import {
  snapLayoutCoordinate,
  snapLayoutSize,
  snapLayoutSpacing,
} from "./grid";

export function resolveLayoutAspectRatio(
  doc: CapabilityDocument,
  override?: LayoutAspectRatioTarget,
): LayoutAspectRatioTarget | null {
  if (isValidAspectRatioTarget(override)) return normalizeAspectRatio(override);

  const preset = doc.settings.layoutAspectRatioPreset ?? "16:9";
  if (preset === "auto") return null;
  if (preset === "16:9") return { w: 16, h: 9 };
  if (preset === "4:3") return { w: 4, h: 3 };
  if (preset === "1:1") return { w: 1, h: 1 };

  if (preset === "custom") {
    const custom = {
      w: doc.settings.customLayoutAspectRatioWidth,
      h: doc.settings.customLayoutAspectRatioHeight,
    };
    if (isValidAspectRatioTarget(custom)) return normalizeAspectRatio(custom);
    return { w: 16, h: 9 };
  }

  return { w: 16, h: 9 };
}

export function hasInvalidConfiguredAspectRatio(
  doc: CapabilityDocument,
): boolean {
  if (doc.settings.layoutAspectRatioPreset !== "custom") return false;
  return !isValidAspectRatioTarget({
    w: doc.settings.customLayoutAspectRatioWidth,
    h: doc.settings.customLayoutAspectRatioHeight,
  });
}

export function isValidAspectRatioTarget(
  value: LayoutAspectRatioTarget | undefined,
): value is LayoutAspectRatioTarget {
  return (
    !!value &&
    Number.isFinite(value.w) &&
    Number.isFinite(value.h) &&
    value.w > 0 &&
    value.h > 0
  );
}

export function normalizeAspectRatio(
  target: LayoutAspectRatioTarget,
): LayoutAspectRatioTarget {
  return {
    w: Math.max(0.01, target.w),
    h: Math.max(0.01, target.h),
  };
}

export function ratioNumber(target: LayoutAspectRatioTarget): number {
  return target.w / target.h;
}

export function localContainerRatio(
  target: LayoutAspectRatioTarget | null,
): number {
  if (!target) return 1.35;
  return clamp(ratioNumber(target), 1.15, 1.65);
}

export function expandBoundsToAspectRatioFrame(
  doc: CapabilityDocument,
  bounds: Bounds,
  target: LayoutAspectRatioTarget,
  padding: number,
): Bounds {
  const ratio = ratioNumber(target);
  const pad = snapLayoutSpacing(doc, padding);
  const padded = {
    x: bounds.x - pad,
    y: bounds.y - pad,
    w: bounds.w + pad * 2,
    h: bounds.h + pad * 2,
  };

  let frameW = padded.w;
  let frameH = padded.h;
  const actual = frameW / Math.max(1, frameH);

  if (actual < ratio) {
    frameW = frameH * ratio;
  } else {
    frameH = frameW / ratio;
  }

  frameW = snapLayoutSize(doc, frameW);
  frameH = snapLayoutSize(doc, frameH);

  return {
    x: snapLayoutCoordinate(doc, padded.x + (padded.w - frameW) / 2),
    y: snapLayoutCoordinate(doc, padded.y + (padded.h - frameH) / 2),
    w: frameW,
    h: frameH,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
