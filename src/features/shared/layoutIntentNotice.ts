import type { Diagnostic } from "../../domain/validation/diagnostics";
import {
  AUTOMATIC_LAYOUT_GEOMETRY_LOCKED,
  AUTOMATIC_LAYOUT_GEOMETRY_LOCKED_MESSAGE,
  MANUAL_POSITIONING_ENABLED_BY_MOVE,
  MANUAL_POSITIONING_ENABLED_BY_REPARENT,
  MANUAL_POSITIONING_NOTICE,
  SOURCE_LOCKED_SEMANTIC_EDIT_BLOCKED,
  SOURCE_LOCKED_SEMANTIC_EDIT_MESSAGE,
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
    return;
  }
  if (
    diagnostics.some(
      (diagnostic) => diagnostic.code === AUTOMATIC_LAYOUT_GEOMETRY_LOCKED,
    )
  ) {
    useUiStore
      .getState()
      .showSelectionNotice(AUTOMATIC_LAYOUT_GEOMETRY_LOCKED_MESSAGE);
    return;
  }
  if (
    diagnostics.some(
      (diagnostic) => diagnostic.code === SOURCE_LOCKED_SEMANTIC_EDIT_BLOCKED,
    )
  ) {
    useUiStore
      .getState()
      .showSelectionNotice(SOURCE_LOCKED_SEMANTIC_EDIT_MESSAGE);
  }
}
