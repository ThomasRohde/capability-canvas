import type { Diagnostic } from "../../domain/validation/diagnostics";
import {
  MANUAL_POSITIONING_ENABLED_BY_MOVE,
  MANUAL_POSITIONING_ENABLED_BY_REPARENT,
  MANUAL_POSITIONING_NOTICE,
} from "../../domain/layout/canvasLayoutPolicy";
import { useUiStore } from "../../app/stores/uiStore";

const MANUAL_POSITIONING_DIAGNOSTIC_CODES = new Set([
  MANUAL_POSITIONING_ENABLED_BY_MOVE,
  MANUAL_POSITIONING_ENABLED_BY_REPARENT,
]);

export function showManualPositioningNoticeForDiagnostics(
  diagnostics: Diagnostic[],
) {
  if (
    diagnostics.some((diagnostic) =>
      MANUAL_POSITIONING_DIAGNOSTIC_CODES.has(diagnostic.code),
    )
  ) {
    useUiStore.getState().showSelectionNotice(MANUAL_POSITIONING_NOTICE);
  }
}
