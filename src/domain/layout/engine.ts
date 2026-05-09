import { canvasRootChildren, type LayoutMode } from "../document/types";
import type { Diagnostic } from "../validation/diagnostics";
import { info, warning } from "../validation/diagnostics";
import {
  expandBoundsToAspectRatioFrame,
  hasInvalidConfiguredAspectRatio,
  resolveLayoutAspectRatio,
} from "./aspectRatio";
import { ROOT_GAP_Y, ROOT_OFFSET } from "./constants";
import {
  measureSubtree,
  placeMeasuredDocumentRoots,
  type MeasuredSubtree,
} from "./measure";
import {
  applyLayoutMetadata,
  applyLayoutPatches,
  computeDocumentBounds,
  computePatchedDocumentBounds,
  stablePatches,
  translatePatches,
} from "./patches";
import { normalizeScopedLayoutRoots } from "./scope";
import {
  snapLayoutCoordinate,
  snapLayoutSpacing,
} from "./grid";
import type {
  LayoutPatch,
  LayoutRequest,
  LayoutResult,
} from "./types";

export {
  applyLayoutMetadata,
  applyLayoutPatches,
  computeDocumentBounds,
};

export async function layoutDocument(
  request: LayoutRequest,
): Promise<LayoutResult> {
  const doc = request.doc;
  const mode = request.mode ?? doc.layout.mode ?? doc.settings.layoutMode;
  const aspectRatioTarget =
    mode === "balanced"
      ? resolveLayoutAspectRatio(doc, request.targetAspectRatio)
      : null;
  const rootOffset = snapLayoutSpacing(doc, ROOT_OFFSET);
  const rootGapY = snapLayoutSpacing(doc, ROOT_GAP_Y);
  if (mode === "free") {
    return {
      patches: [],
      diagnostics: [
        {
          code: "free-layout-preserved",
          severity: "info",
          message: "Freeform layout preserves the current positions.",
        },
      ],
    };
  }

  if (
    doc.layout.preservePositions &&
    !request.force &&
    doc.layout.isUserArranged
  ) {
    return {
      patches: [],
      diagnostics: [
        warning(
          "positions-preserved",
          "Imported or user-arranged positions were preserved.",
        ),
      ],
    };
  }

  const patches: LayoutPatch[] = [];
  const diagnostics: Diagnostic[] = [];
  const scopedRequest = !!request.affectedNodeIds?.length;
  const scope = scopedRequest
    ? normalizeScopedLayoutRoots(doc, request.affectedNodeIds!)
    : {
        rootIds: canvasRootChildren(doc),
        documentScope: true,
        diagnostics: [],
      };
  diagnostics.push(...scope.diagnostics);
  if (mode === "balanced" && hasInvalidConfiguredAspectRatio(doc)) {
    diagnostics.push(
      warning(
        "invalid-layout-aspect-ratio",
        "Balanced layout used 16:9 because the configured aspect ratio was invalid.",
      ),
    );
  }
  const roots = scope.rootIds;
  if (roots.length === 0) {
    return {
      patches: [],
      diagnostics: [
        ...diagnostics,
        info(
          scopedRequest ? "layout-scope-empty" : "layout-document-empty",
          scopedRequest
            ? "Auto layout skipped because no visible nodes matched the requested scope."
            : "Auto layout skipped because the document has no visible root capabilities.",
        ),
      ],
    };
  }
  const measuredRoots = await Promise.all(
    roots.map((rootId) => measureSubtree(doc, rootId, mode, aspectRatioTarget)),
  );
  for (const measured of measuredRoots)
    diagnostics.push(...measured.diagnostics);

  if (scopedRequest && !scope.documentScope) {
    for (const measured of measuredRoots) {
      const node = doc.nodesById[measured.id];
      if (!node) continue;
      translatePatches(
        measured.patches,
        snapLayoutCoordinate(doc, node.x),
        snapLayoutCoordinate(doc, node.y),
        patches,
      );
    }
    return finishLayoutResult(
      request,
      mode,
      patches,
      diagnostics,
      measuredRoots,
    );
  }

  const placedRoots = await placeMeasuredDocumentRoots(
    doc,
    measuredRoots,
    mode,
    aspectRatioTarget,
    rootOffset,
    rootGapY,
  );
  patches.push(...placedRoots.patches);
  diagnostics.push(...placedRoots.diagnostics);

  const frame =
    mode === "balanced" && aspectRatioTarget
      ? expandBoundsToAspectRatioFrame(
          doc,
          computePatchedDocumentBounds(doc, patches),
          aspectRatioTarget,
          ROOT_OFFSET,
        )
      : undefined;
  if (frame && aspectRatioTarget) {
    diagnostics.push(
      info(
        "layout-aspect-ratio-frame",
        `Balanced layout framed the document to ${aspectRatioTarget.w}:${aspectRatioTarget.h}.`,
      ),
    );
  }

  return finishLayoutResult(
    request,
    mode,
    patches,
    diagnostics,
    measuredRoots,
    frame,
    frame ? (aspectRatioTarget ?? undefined) : undefined,
  );
}

function finishLayoutResult(
  request: LayoutRequest,
  mode: LayoutMode,
  patches: LayoutPatch[],
  diagnostics: Diagnostic[],
  measuredRoots: MeasuredSubtree[],
  aspectRatioFrame?: LayoutResult["aspectRatioFrame"],
  aspectRatioTarget?: LayoutResult["aspectRatioTarget"],
): LayoutResult {
  const stable = stablePatches(patches);
  if (measuredRoots.some((measured) => measured.blocked)) {
    diagnostics.push(
      info(
        "layout-partial",
        "Auto layout preserved locked or manual areas and arranged the remaining eligible nodes.",
      ),
    );
  }
  diagnostics.push(
    info(
      stable.length === 0 ? "layout-noop" : "layout-applied",
      layoutOutcomeMessage(request, mode, stable.length),
    ),
  );
  return { patches: stable, diagnostics, aspectRatioFrame, aspectRatioTarget };
}

function layoutOutcomeMessage(
  request: LayoutRequest,
  mode: LayoutMode,
  patchCount: number,
): string {
  const scope = request.affectedNodeIds?.length ? "Scoped" : "Full";
  const force = request.force ? " with force" : "";
  const changes =
    patchCount === 0
      ? "made no geometry changes"
      : `applied ${patchCount} geometry ${patchCount === 1 ? "change" : "changes"}`;
  return `${scope} ${mode} auto layout ${changes}${force}.`;
}
