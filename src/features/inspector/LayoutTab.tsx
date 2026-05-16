import { Info, LayoutTemplate, Lock } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
  lockSubtree,
  moveNodesWithLayoutIntent,
  resizeNode,
  setManualPositioning,
} from "../../domain/commands/operations";
import {
  childrenOf,
  isNodeOnCanvas,
  isCanvasLabelNode,
  isTextLabelNode,
  type AutomaticLayoutMode,
  type CapabilityDocument,
  type CapabilityNode,
  type LayoutMode,
} from "../../domain/document/types";
import {
  AUTOMATIC_LAYOUT_GEOMETRY_LOCKED_MESSAGE,
  isAutomaticLayoutMode,
} from "../../domain/layout/canvasLayoutPolicy";
import { snapCoordinate } from "../../domain/layout/grid";
import { useDocumentStore } from "../../app/stores/documentStore";
import { showManualPositioningNoticeForDiagnostics } from "../shared/layoutIntentNotice";

const TIDY_LAYOUT_MODES: Array<{
  value: AutomaticLayoutMode;
  label: string;
}> = [
  { value: "adaptive", label: "Adaptive" },
  { value: "balanced", label: "Balanced" },
  { value: "flow", label: "Flow" },
  { value: "uniform", label: "Uniform" },
];

export function LayoutTab({
  node,
  viewDoc,
}: {
  node: CapabilityNode;
  viewDoc: CapabilityDocument;
}) {
  const doc = useDocumentStore((state) => state.doc);
  const execute = useDocumentStore((state) => state.execute);
  const autoLayoutScope = useDocumentStore((state) => state.autoLayoutScope);
  const isAutoLayoutRunning = useDocumentStore(
    (state) => state.isAutoLayoutRunning,
  );
  const [tidyLayoutMode, setTidyLayoutMode] = useState<AutomaticLayoutMode>(
    () => defaultTidyLayoutMode(doc.settings.layoutMode),
  );
  const tidyLayoutModeId = useId();
  const snap = (value: number) => snapCoordinate(doc, value);
  const isLabel = isCanvasLabelNode(node);
  const isContainer = node.type !== "leaf" && !isTextLabelNode(node);
  const childScopeIds = childrenOf(viewDoc, node.id).filter((childId) => {
    const child = viewDoc.nodesById[childId];
    return !!child && isNodeOnCanvas(child) && !isTextLabelNode(child);
  });
  const directGeometryBlocked = isAutomaticLayoutMode(doc.settings.layoutMode);
  const geometryTitle = directGeometryBlocked
    ? AUTOMATIC_LAYOUT_GEOMETRY_LOCKED_MESSAGE
    : undefined;
  const layoutChildrenDisabledReason = isAutoLayoutRunning
    ? "Auto layout is already running."
    : node.isLockedAsIs
      ? "Preserved subtrees are skipped by auto layout."
      : !isContainer || childScopeIds.length === 0
        ? "This container has no visible child capabilities to arrange."
        : undefined;

  useEffect(() => {
    setTidyLayoutMode(defaultTidyLayoutMode(doc.settings.layoutMode));
  }, [doc.settings.layoutMode, node.id]);

  return (
    <>
      {!isLabel && (
        <div className="cc-field">
          <span className="cc-section-title">Layout behavior</span>
          <div className="cc-seg">
            <button
              className={
                !node.isManualPositioningEnabled && !node.isLockedAsIs
                  ? "on"
                  : ""
              }
              onClick={() => execute(setManualPositioning(node.id, false))}
            >
              Auto layout
            </button>
            <button
              className={node.isManualPositioningEnabled ? "on" : ""}
              onClick={() => execute(setManualPositioning(node.id, true))}
            >
              Manual
            </button>
            <button
              className={node.isLockedAsIs ? "on" : ""}
              aria-label="Preserve from auto layout"
              title="Preserve from auto layout"
              onClick={() => execute(lockSubtree(node.id, !node.isLockedAsIs))}
            >
              Preserve
            </button>
          </div>
        </div>
      )}
      <div className="cc-info-card">
        <Info size={16} />
        {isLabel ? (
          <span>
            Labels are manual canvas annotations and are skipped by auto layout.
          </span>
        ) : (
          <span>
            Auto layout may arrange this parent's children. Manual keeps this
            parent's children at direct canvas positions. Preserve skips this
            subtree during auto layout and disables resize, but still allows
            deliberate movement. Tidy children rearranges only this container's
            visible children and keeps other branches fixed.
          </span>
        )}
      </div>
      <div className="cc-field">
        <span className="cc-section-title">Container cleanup</span>
        <div className="cc-tidy-layout-row">
          <div className="cc-field">
            <label htmlFor={tidyLayoutModeId}>Tidy algorithm</label>
            <select
              id={tidyLayoutModeId}
              className="cc-select"
              value={tidyLayoutMode}
              disabled={!!layoutChildrenDisabledReason}
              title={layoutChildrenDisabledReason}
              onChange={(event) =>
                setTidyLayoutMode(event.target.value as AutomaticLayoutMode)
              }
            >
              {TIDY_LAYOUT_MODES.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </select>
          </div>
          <button
            className="cc-btn"
            type="button"
            disabled={!!layoutChildrenDisabledReason}
            title={layoutChildrenDisabledReason}
            onClick={() =>
              void autoLayoutScope(
                childScopeIds,
                "Auto layout selected container",
                tidyLayoutMode,
              )
            }
          >
            <LayoutTemplate />
            Tidy children
          </button>
        </div>
      </div>
      <div className="cc-field-row">
        <NumberField
          key={`x-${node.id}-${node.x}`}
          label="X"
          value={node.x}
          disabled={directGeometryBlocked}
          title={geometryTitle}
          onCommit={(x) => {
            const delta = snap(x) - node.x;
            if (delta !== 0)
              showManualPositioningNoticeForDiagnostics(
                execute(
                  moveNodesWithLayoutIntent([node.id], delta, 0, {
                    action: "numeric-position",
                  }),
                ),
              );
          }}
        />
        <NumberField
          key={`y-${node.id}-${node.y}`}
          label="Y"
          value={node.y}
          disabled={directGeometryBlocked}
          title={geometryTitle}
          onCommit={(y) => {
            const delta = snap(y) - node.y;
            if (delta !== 0)
              showManualPositioningNoticeForDiagnostics(
                execute(
                  moveNodesWithLayoutIntent([node.id], 0, delta, {
                    action: "numeric-position",
                  }),
                ),
              );
          }}
        />
        <NumberField
          key={`w-${node.id}-${node.w}`}
          label="W"
          value={node.w}
          disabled={node.isLockedAsIs || directGeometryBlocked}
          title={
            node.isLockedAsIs
              ? "Preserved nodes cannot be resized."
              : geometryTitle
          }
          onCommit={(w) => {
            const next =
              doc.settings.gridEnabled && doc.settings.resizeSnapToGrid
                ? snap(node.x + w) - node.x
                : w;
            execute(resizeNode(node.id, Math.max(1, next), node.h));
          }}
        />
        <NumberField
          key={`h-${node.id}-${node.h}`}
          label="H"
          value={node.h}
          disabled={node.isLockedAsIs || directGeometryBlocked}
          title={
            node.isLockedAsIs
              ? "Preserved nodes cannot be resized."
              : geometryTitle
          }
          onCommit={(h) => {
            const next =
              doc.settings.gridEnabled && doc.settings.resizeSnapToGrid
                ? snap(node.y + h) - node.y
                : h;
            execute(resizeNode(node.id, node.w, Math.max(1, next)));
          }}
        />
      </div>
      {!isLabel && (
        <button
          className="cc-btn"
          type="button"
          onClick={() => execute(lockSubtree(node.id, !node.isLockedAsIs))}
        >
          <Lock />{" "}
          {node.isLockedAsIs
            ? "Stop preserving layout"
            : "Preserve from auto layout"}
        </button>
      )}
    </>
  );
}

function defaultTidyLayoutMode(mode: LayoutMode): AutomaticLayoutMode {
  return mode === "free" ? "uniform" : mode;
}

function NumberField({
  label,
  value,
  disabled = false,
  title,
  onCommit,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  title?: string;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(() => String(Math.round(value)));
  const skipCommit = useRef(false);
  const inputId = `layout-field-${label.toLowerCase()}`;

  useEffect(() => {
    setDraft(String(Math.round(value)));
  }, [value]);

  const commit = () => {
    if (disabled) return;
    if (skipCommit.current) {
      skipCommit.current = false;
      return;
    }
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(Math.round(value)));
      return;
    }
    if (parsed === Math.round(value)) return;
    onCommit(parsed);
  };

  return (
    <div className="cc-field">
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        className="cc-input"
        type="number"
        disabled={disabled}
        title={title}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            (event.target as HTMLInputElement).blur();
          }
          if (event.key === "Escape") {
            skipCommit.current = true;
            setDraft(String(Math.round(value)));
            (event.target as HTMLInputElement).blur();
          }
        }}
      />
    </div>
  );
}
