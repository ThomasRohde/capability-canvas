# Capability Canvas Balanced Ratio DP Auto Layout — Design Specification

Status: Implementation-ready design

Target implementation: Capability Canvas repository, primarily the domain layout engine

Recommended layout mode name: `balanced`

Primary algorithm: Balanced Ratio DP with exact-ratio frame metadata

Last updated: 2026-05-07

---

## 1. Purpose

Capability Canvas needs a new auto-layout mode optimized for calm, visually pleasing, export-ready diagrams. The selected approach is **Balanced Ratio DP** rather than the earlier symmetry-first beam search. The reason is practical: Capability Canvas diagrams are read as structured enterprise artefacts. The layout should therefore prioritize row rhythm, low raggedness, stable sibling order, compactness, and predictable scanning over decorative mirror symmetry.

This specification gives Codex enough detail to implement the feature faithfully in the current codebase.

The new mode must:

1. Preserve the existing layout architecture: recursive subtree measurement, child packing, geometry patch generation, parent containment repair, locked/manual preservation, and grid snapping.
2. Reuse existing document settings for fixed leaf sizes, parent minimum sizes, container padding, title area, child gaps, and grid snapping.
3. Preserve sibling order. Do not sort by size, label, area, or any other visual heuristic.
4. Optimize local row packing using dynamic programming.
5. Support target aspect ratios such as `16:9`, `4:3`, and `1:1`.
6. Represent exact-ratio output using a frame/bounds concept instead of scaling nodes or changing configured gaps.
7. Remain deterministic and idempotent.
8. Meet the same behavioral invariants already tested for `uniform`, `flow`, and `adaptive`.

---

## 2. Product decision

Use this design:

```text
Inside containers: balanced, calm, readable row rhythm.
At the document/export boundary: exact-ratio framing.
```

Do **not** try to make every parent container exactly 16:9 or 4:3. That is impossible in many cases without distorting leaf sizes, changing configured gaps, or adding meaningless internal whitespace. Instead:

- Local containers should be visually balanced and close to a sensible aspect ratio.
- The full canvas/export area should be framed to the requested target ratio.
- Nodes are never scaled.
- Leaf node sizes are fixed.
- Gaps and padding remain exactly the configured values after normal grid snapping.

The default new mode should be named `balanced` in code and shown as `Balanced` in the UI.

---

## 3. Non-goals

Do not implement any of the following as part of this feature:

- Do not replace `uniform`, `flow`, `adaptive`, or `free`.
- Do not remove ELK from the existing modes.
- Do not use ELK for the new `balanced` mode.
- Do not scale nodes to hit a page ratio.
- Do not change fixed leaf dimensions while laying out.
- Do not reorder siblings.
- Do not change the semantics of locked or manual subtrees.
- Do not make exact-ratio framing mandatory for scoped layout.
- Do not require users to choose a ratio for existing modes.

---

## 4. Current architecture to preserve

The current layout engine already has the correct high-level shape:

```text
layoutDocument(request)
  -> normalize scope
  -> measureSubtree(root) recursively
  -> pack child boxes
  -> generate LayoutPatch[]
  -> applyLayoutPatches(...)
  -> ensureParentContainment(...)
```

The implementation should fit into this structure rather than replacing it.

Relevant existing files:

```text
src/domain/document/types.ts
src/domain/document/defaults.ts
src/domain/document/schema.ts
src/domain/layout/types.ts
src/domain/layout/grid.ts
src/domain/layout/engine.ts
src/domain/layout/layout.test.ts
src/app/stores/documentStore.ts
src/features/settings/SettingsDrawer.tsx
src/domain/commands/operations.ts
```

Important existing invariants:

- `LayoutMode` currently controls auto-layout mode.
- `DiagramSettings` already contains `fixedLeafWidth`, `fixedLeafHeight`, `defaultParentWidth`, `defaultParentHeight`, `containerPaddingTop`, `containerPaddingRight`, `containerPaddingBottom`, `containerPaddingLeft`, `containerTitleHeight`, `childGapX`, `childGapY`, `gridEnabled`, and `gridSize`.
- `LayoutRequest` currently contains `doc`, optional `mode`, optional `affectedNodeIds`, and optional `force`.
- `grid.ts` contains the canonical snapping helpers and must be reused.
- `layout.test.ts` already has tests for locked nodes, manual positioning, scoped layout, fixed gaps and padding, grid snapping, hidden canvas nodes, row centering, deterministic output, idempotence, containment, and performance budgets.

The new mode should extend those patterns.

---

## 5. User-facing behavior

### 5.1 Layout mode

Add a new layout mode option:

```text
Balanced
```

It should appear with the existing layout modes in Settings.

Recommended UI order:

```text
Adaptive
Balanced
Flow
Uniform
Freeform
```

The exact order is not functionally important, but `Balanced` should be easy to find.

### 5.2 Aspect ratio setting

Add an aspect ratio setting for balanced layout.

Recommended presets:

```text
Auto
16:9
4:3
1:1
Custom
```

Default preset:

```text
16:9
```

Rationale: the explicit user requirement mentions 16:9 and 4:3. `16:9` is the most useful default for export/screen presentation. Existing non-balanced modes should ignore this setting.

When `Custom` is selected, allow two positive numeric inputs:

```text
Width ratio
Height ratio
```

Examples:

```text
21 : 9
3 : 2
A4 landscape approximately 297 : 210
```

Validation:

- Both custom values must be finite positive numbers.
- Values should be clamped to at least `0.01` in UI and schema.
- If values are invalid, fall back to `16:9` and emit a warning diagnostic.

### 5.3 Exact frame semantics

When full-document balanced layout runs with a target ratio, the resulting export/layout frame should match the requested ratio within grid tolerance.

This frame is not a node and must not distort node geometry.

The frame is used for:

- export bounds,
- fit-to-view behavior if the UI uses layout bounds for viewport fitting,
- optional future visual frame overlay.

The frame should not be used to expand parent containers internally.

---

## 6. Data model changes

### 6.1 `LayoutMode`

Update `src/domain/document/types.ts`:

```ts
export type LayoutMode = "uniform" | "flow" | "adaptive" | "balanced" | "free";
```

Also update all Zod enums that mention layout modes:

```ts
z.enum(["uniform", "flow", "adaptive", "balanced", "free"])
```

Locations include:

```text
LayoutPreferencesSchema.mode
SettingsSchema.layoutMode
LayoutSchema.mode
VisualViewSchema.layout.mode
```

### 6.2 Aspect ratio types

Add these types in `src/domain/document/types.ts`:

```ts
export type LayoutAspectRatioPreset =
  | "auto"
  | "16:9"
  | "4:3"
  | "1:1"
  | "custom";

export interface LayoutAspectRatioTarget {
  w: number;
  h: number;
}
```

### 6.3 Settings fields

Add these fields to `DiagramSettings`:

```ts
layoutAspectRatioPreset: LayoutAspectRatioPreset;
customLayoutAspectRatioWidth: number;
customLayoutAspectRatioHeight: number;
```

Add defaults in `src/domain/document/defaults.ts`:

```ts
layoutAspectRatioPreset: "16:9" as const,
customLayoutAspectRatioWidth: 16,
customLayoutAspectRatioHeight: 9,
```

The new fields are document settings, not node settings.

### 6.4 Layout metadata fields

Add optional frame metadata to `LayoutMetadata`:

```ts
aspectRatioFrame?: Bounds;
aspectRatioTarget?: LayoutAspectRatioTarget;
```

Meaning:

- `boundingBox` remains the tight node bounding box.
- `aspectRatioFrame` is the optional exact-ratio frame that may be larger than `boundingBox`.
- `aspectRatioTarget` records the target used to produce the frame.

Do not replace `boundingBox` with the frame. Existing code may rely on `boundingBox` being tight around actual nodes.

### 6.5 Visual view layout metadata

Extend the `VisualView.layout` object in `types.ts` with the same optional metadata:

```ts
layout: {
  mode: LayoutMode;
  boundingBox?: Bounds;
  aspectRatioFrame?: Bounds;
  aspectRatioTarget?: LayoutAspectRatioTarget;
  isUserArranged: boolean;
  preservePositions: boolean;
};
```

Also update `VisualViewSchema.layout` in `schema.ts` to accept the two optional fields.

### 6.6 Schema migration

Recommended version bump:

```ts
export const DOCUMENT_VERSION = "1.2";
```

Update `WireDocumentSchema.version` to accept previous versions:

```ts
version: z.union([
  z.literal("1.0"),
  z.literal("1.1"),
  z.literal(DOCUMENT_VERSION),
]),
```

Keep parsing backward-compatible. `parseDocument` already merges parsed settings with `DEFAULT_SETTINGS`, so older documents should receive the new defaults automatically.

### 6.7 Zod schema fields

In `SettingsSchema`, add:

```ts
layoutAspectRatioPreset: z
  .enum(["auto", "16:9", "4:3", "1:1", "custom"])
  .default(DEFAULT_SETTINGS.layoutAspectRatioPreset),
customLayoutAspectRatioWidth: positiveNumber.default(
  DEFAULT_SETTINGS.customLayoutAspectRatioWidth,
),
customLayoutAspectRatioHeight: positiveNumber.default(
  DEFAULT_SETTINGS.customLayoutAspectRatioHeight,
),
```

In layout schemas, add:

```ts
const AspectRatioTargetSchema = z.object({
  w: positiveNumber,
  h: positiveNumber,
});
```

Then:

```ts
aspectRatioFrame: VisualBoundsSchema.optional(),
aspectRatioTarget: AspectRatioTargetSchema.optional(),
```

Use the existing bounds schema pattern.

---

## 7. Layout request and result changes

Update `src/domain/layout/types.ts`.

### 7.1 `LayoutRequest`

Add optional target ratio override:

```ts
export interface LayoutRequest {
  doc: CapabilityDocument;
  mode?: LayoutMode;
  affectedNodeIds?: NodeId[];
  force?: boolean;
  targetAspectRatio?: LayoutAspectRatioTarget;
}
```

Purpose:

- Allows export flows or tests to run balanced layout for a specific ratio without mutating settings.
- If omitted, the layout engine resolves the target from `doc.settings`.

### 7.2 `LayoutResult`

Add optional frame metadata:

```ts
export interface LayoutResult {
  patches: LayoutPatch[];
  diagnostics: Diagnostic[];
  aspectRatioFrame?: Bounds;
  aspectRatioTarget?: LayoutAspectRatioTarget;
}
```

Only set these fields when:

```text
mode === "balanced"
AND full-document layout is being run
AND target aspect ratio resolves to a concrete ratio, not auto
```

Do not set them for scoped layout unless the scoped request promotes to full document layout.

---

## 8. Ratio resolution

Add a helper in `engine.ts` or a small module such as `src/domain/layout/aspectRatio.ts`.

Recommended function:

```ts
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
```

Validation:

```ts
function isValidAspectRatioTarget(
  value: LayoutAspectRatioTarget | undefined,
): value is LayoutAspectRatioTarget {
  return !!value &&
    Number.isFinite(value.w) &&
    Number.isFinite(value.h) &&
    value.w > 0 &&
    value.h > 0;
}
```

Normalization:

```ts
function normalizeAspectRatio(target: LayoutAspectRatioTarget): LayoutAspectRatioTarget {
  return {
    w: Math.max(0.01, target.w),
    h: Math.max(0.01, target.h),
  };
}
```

Ratio as number:

```ts
function ratioNumber(target: LayoutAspectRatioTarget): number {
  return target.w / target.h;
}
```

For internal child containers, use a moderated local ratio:

```ts
function localContainerRatio(target: LayoutAspectRatioTarget | null): number {
  if (!target) return 1.35;
  return clamp(target.w / target.h, 1.15, 1.65);
}
```

Rationale:

- A requested document ratio of `16:9` should not make every nested capability group very wide.
- A requested document ratio of `1:1` should not make every nested group square if that hurts row rhythm.
- `1.35` is a good default for business capability groupings: wider than tall, but not poster-like.

At document root level, use the actual requested target ratio. Inside normal parent containers, use `localContainerRatio(...)` as the soft target for row packing.

---

## 9. New layout module

Create a new pure module:

```text
src/domain/layout/balancedRatio.ts
```

This keeps `engine.ts` from becoming too large and makes the algorithm testable in isolation.

### 9.1 Public export

```ts
import type { CapabilityDocument, NodeId } from "../document/types";

export interface BalancedInputBox {
  id: NodeId;
  w: number;
  h: number;
}

export interface BalancedPackedBox extends BalancedInputBox {
  x: number;
  y: number;
}

export interface BalancedPackMetrics {
  score: number;
  objective: number;
  targetRatio: number;
  actualRatio: number;
  ratioError: number;
  raggedness: number;
  adjacentRowDelta: number;
  balanceError: number;
  whitespace: number;
  whitespaceError: number;
  mirrorError: number;
  rowCount: number;
  targetWidth: number;
}

export interface BalancedPackResult {
  boxes: BalancedPackedBox[];
  rows: BalancedPackedBox[][];
  w: number;
  h: number;
  metrics: BalancedPackMetrics;
}

export function balancedRatioDpPackRows(
  boxes: BalancedInputBox[],
  gapX: number,
  gapY: number,
  targetRatio: number,
  doc: CapabilityDocument,
): BalancedPackResult;
```

Do not import React, Zustand, ELK, or UI code from this module. It should be deterministic and side-effect-free.

---

## 10. Balanced Ratio DP algorithm

### 10.1 Inputs

Input boxes are already measured subtrees:

```ts
[{ id, w, h }, ...]
```

The algorithm receives:

```text
boxes: ordered sibling boxes
child gap X
child gap Y
target ratio as number
document, for grid snapping helpers
```

All boxes must keep their existing `w` and `h`.

### 10.2 Output

Output packed boxes:

```ts
[{ id, w, h, x, y }, ...]
```

All coordinates are local to the parent content area, not absolute document coordinates.

The result width and height are the local packed content bounds before parent padding is added.

### 10.3 Order preservation

Sibling order must be preserved exactly. If input order is:

```text
A, B, C, D, E, F
```

Valid row partition examples:

```text
[A B C] [D E F]
[A B] [C D] [E F]
[A] [B C D] [E F]
```

Invalid examples:

```text
[A C E] [B D F]
[D E F] [A B C]
```

Never sort by size.

### 10.4 Candidate target widths

The DP is run multiple times for different target row widths. Each run creates a candidate row partition. The final candidate is selected by the aesthetics objective.

Generate candidate widths like this:

```ts
function candidateTargetWidths(
  boxes: BalancedInputBox[],
  gapX: number,
  targetRatio: number,
  doc: CapabilityDocument,
): number[] {
  const n = boxes.length;
  const minTarget = Math.max(...boxes.map((box) => box.w));
  const maxTarget = rowWidth(boxes, gapX);
  const totalArea = boxes.reduce((sum, box) => sum + box.w * box.h, 0);
  const areaTarget = Math.sqrt(Math.max(1, totalArea) * targetRatio);

  const targets = new Set<number>();
  targets.add(minTarget);
  targets.add(maxTarget);
  targets.add(areaTarget);

  for (const multiplier of [0.72, 0.80, 0.88, 0.95, 1.0, 1.06, 1.14, 1.25, 1.40, 1.60]) {
    targets.add(areaTarget * multiplier);
  }

  const maxColumnProbe = Math.min(n, 12);
  for (let columns = 1; columns <= maxColumnProbe; columns += 1) {
    let widest = 0;
    for (let start = 0; start < n; start += columns) {
      widest = Math.max(widest, rowWidth(boxes.slice(start, start + columns), gapX));
    }
    targets.add(widest);
  }

  return [...targets]
    .map((target) => snapLayoutSize(doc, target))
    .filter((target) => target >= minTarget && target <= maxTarget)
    .sort((a, b) => a - b)
    .filter((target, index, sorted) => index === 0 || target !== sorted[index - 1]);
}
```

Notes:

- Use the real `snapLayoutSize` from `grid.ts`.
- Duplicates must be removed after snapping.
- The function must be deterministic.
- For `n = 0`, return an empty array.
- For `n = 1`, the packer should short-circuit and return the single box at `{ x: 0, y: 0 }`.

### 10.5 Row width and row height

```ts
function rowWidth(row: BalancedInputBox[], gapX: number): number {
  if (row.length === 0) return 0;
  return row.reduce((sum, box) => sum + box.w, 0) + gapX * (row.length - 1);
}

function rowHeight(row: BalancedInputBox[]): number {
  if (row.length === 0) return 0;
  return Math.max(...row.map((box) => box.h));
}
```

For performance, production implementation should use prefix sums for widths so row width can be computed in O(1):

```ts
const prefixWidth = [0];
for (const box of boxes) prefixWidth.push(prefixWidth[prefixWidth.length - 1]! + box.w);

function widthBetween(start: number, end: number): number {
  const count = end - start;
  if (count <= 0) return 0;
  return prefixWidth[end]! - prefixWidth[start]! + gapX * (count - 1);
}
```

Row height can be computed directly for small rows. If needed, optimize later with a sparse table, but that is not required for the first implementation.

### 10.6 Dynamic programming recurrence

For each candidate target width `T`, compute the best order-preserving row partition.

State:

```ts
interface RowSlice {
  start: number;
  end: number; // exclusive
  w: number;
  h: number;
}

interface DpState {
  cost: number;
  rows: RowSlice[];
}
```

Initialize:

```ts
const dp: DpState[] = Array.from({ length: n + 1 }, () => ({
  cost: Number.POSITIVE_INFINITY,
  rows: [],
}));
dp[0] = { cost: 0, rows: [] };
```

Transition:

```ts
for (let end = 1; end <= n; end += 1) {
  for (let start = end - 1; start >= 0; start -= 1) {
    const count = end - start;
    const w = widthBetween(start, end);

    // Width grows as start moves backward. This pruning is safe except for singleton rows.
    if (count > 1 && w > Math.max(T * 1.85, minTarget * 1.1)) break;

    const h = maxHeightBetween(start, end);
    const row = { start, end, w, h };
    const rowCost = costRow(row, T, n);
    const candidate = dp[start]!.cost + rowCost;

    if (candidate < dp[end]!.cost) {
      dp[end] = {
        cost: candidate,
        rows: [...dp[start]!.rows, row],
      };
    }
  }
}
```

The best partition for target `T` is `dp[n].rows`.

### 10.7 Row cost

Use this row cost during DP:

```ts
function costRow(row: RowSlice, targetWidth: number, totalBoxes: number): number {
  const deviation = (row.w - targetWidth) / targetWidth;
  const widthCost = deviation * deviation;
  const overCost = Math.max(0, deviation) ** 2 * 3.0;
  const singletonCost = row.end - row.start === 1 && totalBoxes > 3 ? 0.035 : 0;
  const tinyRowCost = row.end - row.start === 1 && totalBoxes > 6 ? 0.025 : 0;
  const heightCost = row.h * 0.00002;

  return widthCost + overCost + singletonCost + tinyRowCost + heightCost;
}
```

Why this works:

- Width deviation keeps rows near the candidate target width.
- Over-width rows are allowed but penalized more heavily.
- Singletons are allowed, because they are sometimes correct, but discouraged when there are enough siblings to avoid them.
- Height cost is tiny and only breaks ties in favor of shorter rows.

Do not over-tune this cost. The final selection is driven by the aesthetics objective below.

### 10.8 Placing rows

After DP returns row slices, place rows centered under the widest row.

```ts
function placeRows(
  boxes: BalancedInputBox[],
  rows: RowSlice[],
  gapX: number,
  gapY: number,
  doc: CapabilityDocument,
): { boxes: BalancedPackedBox[]; rows: BalancedPackedBox[][]; w: number; h: number } {
  const rowWidths = rows.map((row) => row.w);
  const packW = snapLayoutSize(doc, Math.max(...rowWidths));
  const packed: BalancedPackedBox[] = [];
  const packedRows: BalancedPackedBox[][] = [];

  let y = 0;
  for (const row of rows) {
    const rowBoxes = boxes.slice(row.start, row.end);
    const rowX = snapLayoutDelta(doc, (packW - row.w) / 2);
    const placedRow: BalancedPackedBox[] = [];
    let x = rowX;

    for (const box of rowBoxes) {
      const placed = {
        ...box,
        x: snapLayoutCoordinate(doc, x),
        y: snapLayoutCoordinate(doc, y),
      };
      packed.push(placed);
      placedRow.push(placed);
      x += box.w + gapX;
    }

    packedRows.push(placedRow);
    y += row.h + gapY;
  }

  const packH = snapLayoutSize(
    doc,
    rows.reduce((sum, row) => sum + row.h, 0) + gapY * Math.max(0, rows.length - 1),
  );

  return { boxes: packed, rows: packedRows, w: packW, h: packH };
}
```

Snapping rule:

- Use `snapLayoutDelta`, `snapLayoutCoordinate`, and `snapLayoutSize` from `grid.ts`.
- Do not add new rounding logic.

### 10.9 Aesthetics objective

After placing each candidate, compute metrics and select the candidate with the lowest objective.

#### Metrics

Use these metrics:

```ts
const actualRatio = pack.w / pack.h;
const ratioError = Math.abs(Math.log(actualRatio / targetRatio));
```

Raggedness:

```ts
const rowWidths = rows.map((row) => rowWidth(row, gapX));
const meanRowWidth = mean(rowWidths);
const raggedness = rowWidths.length > 1 && meanRowWidth > 0
  ? populationStdDev(rowWidths) / meanRowWidth
  : 0;
```

Adjacent row rhythm:

```ts
const maxRowWidth = Math.max(...rowWidths);
const adjacentRowDelta = rowWidths.length > 1
  ? mean(abs(rowWidths[i] - rowWidths[i - 1]) / maxRowWidth for i = 1..n-1)
  : 0;
```

Centre-of-mass balance:

```ts
let area = 0;
let cx = 0;
let cy = 0;
for (const box of packedBoxes) {
  const a = box.w * box.h;
  area += a;
  cx += (box.x + box.w / 2) * a;
  cy += (box.y + box.h / 2) * a;
}
cx /= area;
cy /= area;
const diagonal = Math.hypot(pack.w, pack.h) || 1;
const balanceError = Math.hypot(cx - pack.w / 2, cy - pack.h / 2) / (diagonal / 2);
```

Whitespace:

```ts
const occupiedArea = packedBoxes.reduce((sum, box) => sum + box.w * box.h, 0);
const totalArea = pack.w * pack.h;
const whitespace = totalArea > 0 ? 1 - Math.min(1, occupiedArea / totalArea) : 0;
const desiredWhitespace = 0.18;
const whitespaceError = Math.abs(whitespace - desiredWhitespace) / 0.35;
```

Mirror error, deliberately low weight:

```ts
let mirrorError = 0;
let pairs = 0;
for (let i = 0; i < Math.floor(rowWidths.length / 2); i += 1) {
  const j = rowWidths.length - 1 - i;
  mirrorError += Math.abs(rowWidths[i]! - rowWidths[j]!) / maxRowWidth;
  pairs += 1;
}
mirrorError = pairs > 0 ? mirrorError / pairs : 0;
```

Row count penalty:

```ts
const expectedRows = Math.max(1, Math.round(Math.sqrt(boxes.length / targetRatio)));
const rowCountError = Math.abs(rows.length - expectedRows) / Math.max(1, expectedRows);
```

#### Objective

Use this exact objective for the first implementation:

```ts
const objective =
  34 * clamp01(raggedness) +
  22 * clamp01(adjacentRowDelta) +
  16 * clamp01(ratioError / Math.log(2)) +
  10 * clamp01(whitespaceError) +
   8 * clamp01(rowCountError) +
   6 * clamp01(balanceError) +
   4 * clamp01(mirrorError);

const score = Math.max(0, 100 - objective);
```

This intentionally weights visual rhythm and raggedness more than mirror symmetry.

#### Tie-breaking

When two candidates are close, use deterministic tie-breaking:

```text
1. Lower objective, with epsilon 0.000001.
2. Lower raggedness.
3. Lower adjacent row delta.
4. Lower total area: pack.w * pack.h.
5. Fewer rows.
6. Lower targetWidth.
```

This avoids layout jitter when settings change slightly.

---

## 11. Engine integration

### 11.1 Add `balanced` branch in `packBoxes`

In `src/domain/layout/engine.ts`, update `packBoxes(...)`.

Current structure is roughly:

```ts
if (mode === "adaptive") return adaptivePackRows(...);
if (mode === "uniform") return fallbackPackRows(...);
// flow uses ELK rectpacking and fallback
```

Add a branch before the existing ELK branch:

```ts
if (mode === "balanced") {
  const aspectRatio = resolveLayoutAspectRatio(doc, requestTargetFromContext);
  const numericTarget = ratioNumber(aspectRatio ?? { w: 4, h: 3 });
  const localTarget = scopeId === "document-roots"
    ? numericTarget
    : localContainerRatio(aspectRatio);

  const packed = balancedRatioDpPackRows(boxes, gapX, gapY, localTarget, doc);

  return {
    boxes: packed.boxes,
    w: packed.w,
    h: packed.h,
    diagnostics: [],
  };
}
```

Because `packBoxes` currently does not receive `LayoutRequest`, Codex should either:

Option A, preferred: Thread a `LayoutExecutionContext` through layout calls.

```ts
interface LayoutExecutionContext {
  targetAspectRatio: LayoutAspectRatioTarget | null;
  documentScope: boolean;
}
```

Then update:

```ts
measureSubtree(doc, nodeId, mode, context)
packBoxes(..., doc, context)
placeMeasuredDocumentRoots(..., doc, context)
```

Option B: Store a resolved target locally inside `layoutDocument` and pass it only to functions that need it.

Option A is cleaner and easier to extend.

### 11.2 Local target ratio rules

Use these rules:

```text
Packing document roots:
  use the resolved target ratio exactly.

Packing normal parent children:
  use localContainerRatio(resolvedTarget), clamped to 1.15..1.65.

No resolved target because preset is Auto:
  use 1.35 locally and use no exact frame.
```

### 11.3 Parent size calculation

Do not alter the existing parent sizing semantics.

Balanced mode should use the same general parent sizing behavior as adaptive/uniform:

```text
parent width  = max(min parent width, child bounds right + right padding)
parent height = max(min parent height, child bounds bottom + bottom padding)
```

Child placement still uses:

```text
childX = margin.left + packedChild.x
childY = childAreaTop(doc, parent) + packedChild.y
```

Use the existing `nodeMargin`, `nodeSize`, and `childAreaTop` helpers. Do not recreate padding/title calculations in the new module.

### 11.4 Uniform leaf group height behavior

Existing `uniform` mode aligns certain sibling container heights. Balanced mode should **not** inherit that special behavior unless tests reveal a strong need.

Reason:

- Balanced mode already optimizes row rhythm.
- Height normalization can introduce excess whitespace and make the row balance worse.

Implementation detail:

```ts
const uniformHeightById = uniformLeafGroupHeights(...);
```

This should continue to apply only when `localMode === "uniform"`.

### 11.5 Locked/manual/anchored behavior

Do not change:

- `isLockedAsIs` handling,
- manual parent preservation,
- scoped layout promotion,
- anchored subtree logic,
- preservation diagnostics.

When a parent contains blocked children, the existing `measureAnchoredSubtree(...)` should pack free children using the selected local mode. If mode is `balanced`, the free children should be packed with `balancedRatioDpPackRows`, then placed below the blocked content exactly as current anchored behavior does.

---

## 12. Exact aspect-ratio frame

### 12.1 Why a frame is needed

With fixed leaves and fixed gaps, exact 16:9 or 4:3 cannot always be achieved by node geometry alone. If the implementation tried to force exact ratios by resizing or spreading children, it would violate the core constraints.

Therefore exact ratio should be represented as optional layout metadata:

```ts
layout.aspectRatioFrame
layout.aspectRatioTarget
```

The frame is an export/viewport concept, not a node.

### 12.2 When to compute it

Compute a frame only when:

```text
mode === "balanced"
AND target aspect ratio is concrete, not Auto
AND layout scope is the full document
```

Do not compute frame metadata for normal scoped layout.

If a scoped request is promoted to document scope by existing scope normalization, it may compute a frame.

### 12.3 Frame computation

After document roots are placed, compute tight bounds of placed root boxes. Then inflate and expand to the target ratio.

Recommended function:

```ts
function expandBoundsToAspectRatioFrame(
  doc: CapabilityDocument,
  bounds: Bounds,
  target: LayoutAspectRatioTarget,
): Bounds {
  const ratio = target.w / target.h;
  const pad = snapLayoutSpacing(doc, ROOT_OFFSET);

  const padded = {
    x: bounds.x - pad,
    y: bounds.y - pad,
    w: bounds.w + pad * 2,
    h: bounds.h + pad * 2,
  };

  let frameW = padded.w;
  let frameH = padded.h;

  const actual = frameW / frameH;
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
```

Important:

- This function does not move nodes.
- It may produce negative `x` or `y` if the frame expands left/up. That is acceptable if export code supports arbitrary bounds. If export code assumes non-negative bounds, clamp by translating the frame and all document patches together. Prefer supporting arbitrary bounds if possible.
- The frame should be at least as large as the padded node bounds.

### 12.4 Applying frame metadata

Update `layoutDocument(...)` to return frame metadata in `LayoutResult`.

Update `layoutAndRepair(...)` in `documentStore.ts` so it stores frame metadata after applying patches and containment repair.

Recommended helper:

```ts
function applyLayoutMetadata(
  originalDoc: CapabilityDocument,
  laidOutDoc: CapabilityDocument,
  result: LayoutResult,
): CapabilityDocument {
  const boundingBox = computeDocumentBounds(laidOutDoc);
  const layout = {
    ...laidOutDoc.layout,
    boundingBox,
    aspectRatioFrame: result.aspectRatioFrame,
    aspectRatioTarget: result.aspectRatioTarget,
  };

  return { ...laidOutDoc, layout };
}
```

For visual views, make sure `applyResolvedVisualDocument(...)` and `materializeActiveViewMetadata(...)` preserve or materialize the active view layout frame. Codex should search for all places where `layout.boundingBox` is cloned or rebuilt and carry the new fields alongside it.

### 12.5 Clearing stale frames

If layout mode is not `balanced`, clear frame metadata:

```ts
aspectRatioFrame: undefined,
aspectRatioTarget: undefined,
```

If the user manually moves or resizes nodes, also clear the frame or mark it stale. Preferred simple implementation: clear it whenever `layout.isUserArranged` becomes true.

---

## 13. Export and viewport consumption

Wherever export or fit-to-view code uses layout bounds, prefer the ratio frame when present.

Recommended helper:

```ts
export function layoutDisplayBounds(doc: CapabilityDocument): Bounds {
  return doc.layout.aspectRatioFrame ?? doc.layout.boundingBox;
}
```

For visual views:

```ts
export function visualLayoutDisplayBounds(view: VisualView): Bounds | undefined {
  return view.layout.aspectRatioFrame ?? view.layout.boundingBox;
}
```

Use this helper in:

- fit-to-canvas / zoom-to-fit behavior,
- export bounds calculation,
- minimap if it should include the frame,
- any page preview.

Do not use the frame for hit testing, containment, sibling overlap repair, or parent sizing.

---

## 14. Settings UI changes

Update `src/features/settings/SettingsDrawer.tsx`.

### 14.1 Layout modes list

Update:

```ts
const LAYOUT_MODES: Array<{ value: LayoutMode; label: string }> = [
  { value: "adaptive", label: "Adaptive" },
  { value: "balanced", label: "Balanced" },
  { value: "flow", label: "Flow" },
  { value: "uniform", label: "Uniform" },
  { value: "free", label: "Freeform" },
];
```

### 14.2 Aspect ratio controls

Add a select under layout mode:

```text
Aspect ratio
[Auto | 16:9 | 4:3 | 1:1 | Custom]
```

Show the custom numeric fields only when:

```ts
doc.settings.layoutAspectRatioPreset === "custom"
```

On change, call:

```ts
void updateSettings(
  { layoutAspectRatioPreset: nextPreset },
  { autoLayout: doc.settings.layoutMode === "balanced" },
)
```

For custom values:

```ts
void updateSettings(
  { customLayoutAspectRatioWidth: value },
  { autoLayout: doc.settings.layoutMode === "balanced" },
)
```

Same for height.

Non-balanced modes may still show the setting, but it should be visually clear that it only affects Balanced layout and export framing. A simple helper text is enough:

```text
Used by Balanced layout and export framing.
```

---

## 15. Diagnostics

Keep diagnostics low-noise.

Add these diagnostics only when useful:

### 15.1 Invalid aspect ratio

```ts
warning(
  "invalid-layout-aspect-ratio",
  "Balanced layout used 16:9 because the configured aspect ratio was invalid.",
)
```

### 15.2 Frame applied

```ts
info(
  "layout-aspect-ratio-frame",
  `Balanced layout framed the document to ${target.w}:${target.h}.`,
)
```

### 15.3 Optional debug metric diagnostic

Do not emit per-parent metrics by default. If useful during development, hide them behind a development flag.

---

## 16. Tests

Update `src/domain/layout/layout.test.ts` and add unit tests for `balancedRatio.ts` if preferred.

### 16.1 Extend existing mode matrices

Where existing tests use:

```ts
it.each(["uniform", "flow", "adaptive"] as const)
```

Add `balanced` where the behavior should apply:

```ts
it.each(["uniform", "flow", "adaptive", "balanced"] as const)
```

Apply this to tests for:

- grid snapping,
- hidden canvas nodes,
- nested browser scenario without overlaps,
- parent sizing from actual child rectangles,
- deterministic patches,
- idempotence.

Do not add `balanced` to tests that check behavior specific to `uniform`, `flow`, or `adaptive`.

### 16.2 New algorithm unit tests

Create `src/domain/layout/balancedRatio.test.ts` or add to `layout.test.ts`.

Required tests:

#### Test: preserves sibling order

Input boxes:

```text
A B C D E F G
```

Run `balancedRatioDpPackRows(...)`.

Assert that reading packed boxes row by row gives the original order.

#### Test: centers rows

Create boxes that produce multiple rows.

For each row:

```ts
const rowLeft = Math.min(...row.map((box) => box.x));
const rowRight = Math.max(...row.map((box) => box.x + box.w));
const rowCenter = (rowLeft + rowRight) / 2;
const packCenter = pack.w / 2;
expect(Math.abs(rowCenter - packCenter)).toBeLessThanOrEqual(doc.settings.gridSize);
```

#### Test: avoids avoidable singleton rows

For seven equal boxes, balanced layout should not produce six rows plus one singleton when a more even layout exists.

Do not require a single exact row count unless the fixture is stable. Prefer checking:

```ts
expect(maxRowCount - minRowCount).toBeLessThanOrEqual(1 or 2)
```

#### Test: lower raggedness than greedy fixture

Use a fixture with mixed widths/heights. Compare against a simple greedy pack implemented locally in the test or imported from a test helper. Assert:

```ts
expect(balanced.metrics.raggedness).toBeLessThan(greedy.metrics.raggedness);
```

Only use this test if the fixture is deterministic and the improvement is large enough to avoid brittle failures.

#### Test: deterministic output

Run the same input twice and assert deep equality.

```ts
expect(second).toEqual(first);
```

### 16.3 Engine integration tests

#### Test: balanced respects exact padding and gaps when grid disabled

Use the existing `twoChildDocument()` fixture pattern.

Set:

```ts
doc.settings.gridEnabled = false;
doc.settings.containerPaddingLeft = 48;
doc.settings.containerPaddingTop = 40;
doc.settings.childGapX = 24;
```

Run:

```ts
layoutDocument({ doc, force: true, mode: "balanced" })
```

Expected behavior should match the invariant already tested for `uniform`:

```text
child-a x = root x + 48
child-b x = child-a x + fixedLeafWidth + 24
child y   = root y + containerPaddingTop + containerTitleHeight
```

Use exact values based on the fixture's root offset and defaults.

#### Test: balanced snaps generated geometry to grid

Same as existing grid snapping test, with mode `balanced` included.

All patches must satisfy:

```ts
patch.x % gridSize === 0
patch.y % gridSize === 0
patch.w % gridSize === 0
patch.h % gridSize === 0
```

#### Test: exact frame metadata for 16:9

Set:

```ts
doc.settings.layoutMode = "balanced";
doc.settings.layoutAspectRatioPreset = "16:9";
```

Run full layout.

Assert:

```ts
expect(result.aspectRatioFrame).toBeDefined();
expect(result.aspectRatioTarget).toEqual({ w: 16, h: 9 });
```

Then check ratio tolerance:

```ts
const frame = result.aspectRatioFrame!;
const actual = frame.w / frame.h;
expect(Math.abs(actual - 16 / 9)).toBeLessThanOrEqual(frameTolerance(doc));
```

Suggested tolerance:

```ts
function frameTolerance(doc: CapabilityDocument) {
  return doc.settings.gridEnabled ? doc.settings.gridSize / 100 : 0.01;
}
```

Better tolerance if implemented:

```ts
const ratioError = Math.abs(Math.log((frame.w / frame.h) / (16 / 9)));
expect(ratioError).toBeLessThan(0.02);
```

#### Test: no frame metadata for scoped layout

Run scoped balanced layout for a child node.

Assert:

```ts
expect(result.aspectRatioFrame).toBeUndefined();
expect(result.aspectRatioTarget).toBeUndefined();
```

Unless existing scope normalization promotes it to full document layout. In that case test a scope that definitely remains local.

#### Test: locked/manual behavior remains unchanged

Add `balanced` variants of existing locked/manual tests.

At minimum:

- locked nodes are not patched,
- manual descendants keep relative positions,
- scoped layout inside locked ancestor is skipped.

#### Test: idempotence after repair

Use existing `applyAutoLayoutCycle` helper.

```ts
const first = await applyAutoLayoutCycle(doc, "balanced");
const second = await applyAutoLayoutCycle(first, "balanced");
expect(geometryFor(second)).toEqual(geometryFor(first));
```

#### Test: performance budget

The existing large fixture test expects adaptive full layout under 2500 ms and scoped layout under 1000 ms. Balanced should meet the same budget or a slightly higher but explicit budget.

Recommended:

```ts
expect(elapsed).toBeLessThan(2500);
expect(scopedElapsed).toBeLessThan(1000);
```

If the first implementation fails this, optimize candidate count before relaxing the budget.

---

## 17. Performance constraints

Balanced Ratio DP is O(K * n²) per parent, where:

```text
K = number of candidate target widths
n = number of sibling boxes under a single parent
```

This is acceptable because most parents have modest child counts. Still, implement safeguards.

### 17.1 Candidate cap

Keep candidate widths under about 24 after de-duplication.

If more are generated:

```ts
const sorted = [...targets].sort((a, b) => a - b);
return downsample(sorted, 24);
```

Downsampling should always keep:

- minimum target,
- maximum target,
- area target or closest available to area target.

### 17.2 Row pruning

During DP, break the inner loop when the row is much wider than the candidate target:

```ts
if (count > 1 && w > Math.max(T * 1.85, minTarget * 1.1)) break;
```

Because width increases as the row includes more boxes, this is safe for pruning wider rows.

### 17.3 Avoid allocation hotspots

The simple DP pseudocode copies arrays in each transition. That is okay for clarity but can allocate heavily. Codex should prefer parent pointers for production:

```ts
interface DpCell {
  cost: number;
  previous: number;
  row: RowSlice | null;
}
```

Then reconstruct rows at the end.

This keeps performance stable for large documents.

---

## 18. Backward compatibility

Existing documents must continue to load.

Required behavior:

- Documents without `layoutAspectRatioPreset` get default `16:9`.
- Documents without custom ratio fields get `16` and `9`.
- Documents with old layout modes continue to validate.
- Documents with `balanced` only validate after the schema enum update.
- Existing modes ignore the aspect ratio fields.
- If a document contains invalid custom ratio values, parse should either reject through schema or normalize through defaults. Runtime layout should still guard and fallback to `16:9`.

---

## 19. Acceptance criteria

The implementation is complete when all of these are true:

1. `balanced` is a valid `LayoutMode` everywhere TypeScript and Zod expect layout modes.
2. The Settings drawer exposes `Balanced` mode.
3. The Settings drawer exposes aspect ratio controls.
4. Balanced mode preserves fixed leaf sizes.
5. Balanced mode preserves configured padding and gaps, after existing grid snapping rules.
6. Balanced mode preserves sibling order.
7. Balanced mode centers rows under the widest row.
8. Balanced mode is deterministic.
9. Balanced mode is idempotent after applying patches and containment repair.
10. Balanced mode does not patch locked nodes.
11. Balanced mode preserves manual subtrees.
12. Balanced mode ignores hidden canvas nodes.
13. Balanced mode produces no sibling overlaps in the nested browser fixture.
14. Full-document balanced layout produces `aspectRatioFrame` and `aspectRatioTarget` when a concrete ratio is selected.
15. Scoped balanced layout does not produce frame metadata unless promoted to full document scope.
16. Existing layout modes continue to pass their tests.
17. Large fixture performance remains within the existing budget or very close to it.
18. Export/fit-to-view code uses `aspectRatioFrame` when present and falls back to `boundingBox` otherwise.

---

## 20. Implementation sequence for Codex

Follow this order to minimize breakage.

### Step 1: Type and schema support

Files:

```text
src/domain/document/types.ts
src/domain/document/defaults.ts
src/domain/document/schema.ts
src/domain/layout/types.ts
```

Implement:

- add `balanced` layout mode,
- add aspect ratio setting types and defaults,
- add optional frame metadata,
- add request/result target ratio fields,
- update Zod enums and schema defaults.

Run typecheck. Fix enum fallout first.

### Step 2: Pure algorithm module

File:

```text
src/domain/layout/balancedRatio.ts
```

Implement:

- candidate target generation,
- DP row partitioning,
- row placement,
- metrics,
- objective,
- deterministic tie-breaking.

Add focused unit tests.

### Step 3: Engine integration

File:

```text
src/domain/layout/engine.ts
```

Implement:

- context threading for resolved target ratio,
- `balanced` branch in `packBoxes`,
- local vs document target ratio rules,
- frame computation in full document layout,
- diagnostics.

Do not change behavior for other modes.

### Step 4: Store frame metadata

Files likely include:

```text
src/app/stores/documentStore.ts
src/domain/visual/workspace.ts
src/domain/commands/operations.ts
```

Implement:

- preserve `aspectRatioFrame` and `aspectRatioTarget` when cloning/materializing layout metadata,
- store result frame metadata after layout,
- clear stale frame metadata when layout mode is not balanced or user arrangement invalidates it.

### Step 5: Settings UI

File:

```text
src/features/settings/SettingsDrawer.tsx
```

Implement:

- add `Balanced` to layout mode dropdown,
- add aspect ratio dropdown,
- add custom ratio numeric fields,
- trigger auto layout when balanced settings change.

### Step 6: Export/viewport bounds

Search for code using:

```text
layout.boundingBox
view.layout.boundingBox
computeDocumentBounds
fit to view
export bounds
minimap bounds
```

Add helper:

```ts
layoutDisplayBounds(...)
```

Use frame bounds where appropriate.

### Step 7: Extend tests

Files:

```text
src/domain/layout/layout.test.ts
src/domain/layout/balancedRatio.test.ts
```

Implement all tests listed in section 16.

---

## 21. Reference TypeScript snippets

### 21.1 Clamp and statistics helpers

```ts
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function populationStdDev(values: number[]): number {
  if (values.length <= 1) return 0;
  const avg = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - avg) ** 2)));
}
```

### 21.2 Candidate comparison

```ts
function isBetterCandidate(
  candidate: BalancedPackMetrics,
  current: BalancedPackMetrics | null,
): boolean {
  if (!current) return true;
  const epsilon = 0.000001;

  if (candidate.objective < current.objective - epsilon) return true;
  if (candidate.objective > current.objective + epsilon) return false;

  if (candidate.raggedness !== current.raggedness) {
    return candidate.raggedness < current.raggedness;
  }
  if (candidate.adjacentRowDelta !== current.adjacentRowDelta) {
    return candidate.adjacentRowDelta < current.adjacentRowDelta;
  }
  // Total area comparison needs access to pack dimensions. Implement this tie-break
  // in the caller where pack.w and pack.h are available.
  if (candidate.rowCount !== current.rowCount) {
    return candidate.rowCount < current.rowCount;
  }
  return candidate.targetWidth < current.targetWidth;
}
```

### 21.3 Main packer outline

```ts
export function balancedRatioDpPackRows(
  boxes: BalancedInputBox[],
  gapX: number,
  gapY: number,
  targetRatio: number,
  doc: CapabilityDocument,
): BalancedPackResult {
  if (boxes.length === 0) {
    return emptyBalancedPack(targetRatio);
  }

  if (boxes.length === 1) {
    const only = boxes[0]!;
    const placed = { ...only, x: 0, y: 0 };
    return {
      boxes: [placed],
      rows: [[placed]],
      w: only.w,
      h: only.h,
      metrics: metricsForPlacedPack([placed], [[placed]], only.w, only.h, targetRatio, 0),
    };
  }

  const safeTargetRatio = Number.isFinite(targetRatio) && targetRatio > 0
    ? targetRatio
    : 16 / 9;

  let best: BalancedPackResult | null = null;

  for (const targetWidth of candidateTargetWidths(boxes, gapX, safeTargetRatio, doc)) {
    const rowSlices = partitionRowsForTarget(boxes, gapX, targetWidth, doc);
    const placed = placeRows(boxes, rowSlices, gapX, gapY, doc);
    const metrics = metricsForPlacedPack(
      placed.boxes,
      placed.rows,
      placed.w,
      placed.h,
      safeTargetRatio,
      targetWidth,
    );

    const candidate = { ...placed, metrics };
    if (!best || compareBalancedCandidates(candidate, best) < 0) {
      best = candidate;
    }
  }

  return best ?? fallbackSingleRowPack(boxes, gapX, gapY, safeTargetRatio, doc);
}
```

---

## 22. Quality bar

The visual result should feel:

```text
organized, calm, readable, balanced, deterministic
```

It should not feel:

```text
random, over-symmetric, posterized, stretched, cramped, or overly sparse
```

A good balanced layout has:

- similar row widths,
- centered rows,
- no avoidable orphan rows,
- stable sibling order,
- compact but not cramped whitespace,
- clean container bounds,
- predictable re-layout after edits.

The key product judgment is that business users should immediately read the model structure without noticing the layout algorithm.
