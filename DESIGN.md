---
name: Capability Canvas
description: >
  Calm, professional design system for a business-capability modelling tool.
  Slate-on-white IDE-style chrome with a teal brand accent, soft pastel
  category tints for grouping, and a green-to-red heatmap for analysis.
colors:
  # Brand — teal anchor
  brand-50: "#F0FDFA"
  brand-100: "#CCFBF1"
  brand-500: "#14B8A6"
  brand-600: "#0D9488"
  brand-700: "#0F766E"
  brand-700-hover: "#0B5E57"

  # Neutrals — slate ramp
  slate-50: "#F8FAFC"
  slate-100: "#F1F5F9"
  slate-200: "#E2E8F0"
  slate-300: "#CBD5E1"
  slate-400: "#94A3B8"
  slate-500: "#64748B"
  slate-600: "#475569"
  slate-700: "#334155"
  slate-900: "#0F172A"
  slate-950: "#020617"
  white: "#FFFFFF"

  # Surfaces
  surface-app: "#F8FAFC"
  surface-panel: "#FFFFFF"
  surface-canvas: "#F1F5F9"
  surface-hover: "#F1F5F9"
  surface-active: "#F0FDFA"

  # Foreground
  fg-primary: "#0F172A"
  fg-secondary: "#475569"
  fg-tertiary: "#94A3B8"
  fg-on-brand: "#FFFFFF"
  fg-link: "#0F766E"

  # Borders
  border-hairline: "#E2E8F0"
  border-strong: "#CBD5E1"
  border-focus: "#14B8A6"

  # Semantic
  success: "#10B981"
  warning: "#F59E0B"
  danger: "#EF4444"
  info: "#3B82F6"

  # Category palette — six soft tints with matching borders and dots.
  # Used to group capabilities visually on the canvas and outline.
  cat-mint-bg: "#ECFDF5"
  cat-mint-border: "#6EE7B7"
  cat-mint-dot: "#10B981"
  cat-sky-bg: "#ECFEFF"
  cat-sky-border: "#7DD3FC"
  cat-sky-dot: "#0EA5E9"
  cat-coral-bg: "#FEF2F2"
  cat-coral-border: "#FCA5A5"
  cat-coral-dot: "#EF4444"
  cat-amber-bg: "#FFFBEB"
  cat-amber-border: "#FCD34D"
  cat-amber-dot: "#F59E0B"
  cat-lavender-bg: "#F5F3FF"
  cat-lavender-border: "#C4B5FD"
  cat-lavender-dot: "#8B5CF6"
  cat-peach-bg: "#FFF7ED"
  cat-peach-border: "#FDBA74"
  cat-peach-dot: "#F97316"

  # Heatmap — five-stop green→yellow→red diverging ramp
  heat-0: "#86EFAC"
  heat-25: "#BEF264"
  heat-50: "#FDE047"
  heat-75: "#FB923C"
  heat-100: "#EF4444"

typography:
  fontFamilySans: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif
  fontFamilyMono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace
  featureSettings: "'cv11', 'ss01'"

  display:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: "600"
    lineHeight: 1.2
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: "600"
    lineHeight: 1.2
  headline-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: "600"
    lineHeight: 1.35
    letterSpacing: -0.005em
  panel-title:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: "600"
    lineHeight: 1.35
    letterSpacing: -0.005em
  section-heading:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: "600"
    lineHeight: 1.35
  brand-name:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: "600"
    lineHeight: 1.2
    letterSpacing: -0.01em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: "400"
    lineHeight: 1.45
  label:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: "500"
    lineHeight: 1.35
  row:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: "400"
    lineHeight: 1.35
  meta:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: "400"
    lineHeight: 1.35
  section-label:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: "500"
    lineHeight: 1.35
  micro:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: "400"
    lineHeight: 1.2
  numeric:
    fontFeatureSettings: "'tnum' 1"
    fontVariantNumeric: tabular-nums
  code:
    fontFamily: ui-monospace
    fontSize: 12px

spacing:
  base: 4px
  "0": 0px
  "1": 4px
  "2": 8px
  "3": 12px
  "4": 16px
  "5": 20px
  "6": 24px
  "8": 32px
  "10": 40px
  "12": 48px
  "16": 64px

rounded:
  xs: 4px
  sm: 6px
  DEFAULT: 8px
  md: 8px
  lg: 10px
  xl: 12px
  full: 9999px

borders:
  hairline: "1px solid #E2E8F0"
  strong: "1px solid #CBD5E1"
  node: "1px solid #CBD5E1"
  container: "1.5px solid #CBD5E1"
  dashed-add: "1px dashed #CBD5E1"
  selected-node: "2px solid #0F766E"
  selected-container: "2px solid {colors.cat-<name>-border}"

shadows:
  xs: "0 1px 2px rgba(15, 23, 42, 0.04)"
  sm: "0 1px 3px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04)"
  md: "0 8px 24px rgba(15, 23, 42, 0.08), 0 2px 6px rgba(15, 23, 42, 0.04)"
  lg: "0 16px 40px rgba(15, 23, 42, 0.10), 0 4px 12px rgba(15, 23, 42, 0.06)"
  segmented-on: "0 1px 2px rgba(15, 23, 42, 0.08)"
  toggle-thumb: "0 1px 2px rgba(0, 0, 0, 0.18)"
  ring-focus: "0 0 0 3px rgba(20, 184, 166, 0.20)"

elevation:
  z-canvas: 0
  z-panel: 1
  z-floating-toolbar: 20
  z-menu: 50
  z-modal: 100
  z-toast: 200

motion:
  duration-fast: 120ms
  duration-base: 180ms
  duration-slow: 240ms
  ease-standard: cubic-bezier(0.2, 0, 0, 1)
  ease-entrance: cubic-bezier(0.0, 0, 0.2, 1)
  ease-exit: cubic-bezier(0.4, 0, 1, 1)
  toggle-thumb: 140ms cubic-bezier(0.2, 0, 0, 1)
  hover-transition: "background 120ms, border-color 120ms, color 120ms"
  selection-transition: "box-shadow 120ms"

layout:
  toolbar-height: 52px
  statusbar-height: 32px
  outline-width: 260px
  inspector-width: 320px
  canvas-padding: 24px
  canvas-grid-size: 16px
  panel-padding-x: 16px
  panel-padding-y: 14px
  row-padding-x: 8px
  row-padding-y: 5px

backgrounds:
  canvas-dot-grid:
    color: "rgba(15, 23, 42, 0.06)"
    size: 16px
    pattern: "radial-gradient(circle, rgba(15,23,42,0.06) 1px, transparent 1px)"

components:
  app-shell:
    grid-rows: "52px 1fr 32px"
    grid-columns: "260px 1fr 320px"
    background: "{colors.surface-app}"

  toolbar:
    height: 52px
    background: "{colors.surface-panel}"
    borderBottom: "{borders.hairline}"
    paddingX: 16px
    gap: 8px
    divider: "1px x 22px {colors.border-hairline}"

  status-bar:
    height: 32px
    background: "{colors.surface-panel}"
    borderTop: "{borders.hairline}"
    paddingX: 16px
    typography: "{typography.meta}"
    color: "{colors.fg-secondary}"
    save-dot:
      size: 8px
      color: "{colors.success}"
      shape: circle

  outline-panel:
    width: 260px
    background: "{colors.surface-panel}"
    borderRight: "{borders.hairline}"
    title-typography: "{typography.panel-title}"
    row:
      paddingX: 8px
      paddingY: 5px
      rounded: "{rounded.sm}"
      typography: "{typography.row}"
      hoverBackground: "{colors.surface-hover}"
    row-active:
      background: "{colors.surface-active}"
      textColor: "{colors.brand-700}"
      fontWeight: "500"
    swatch:
      size: 11px
      rounded: 2px
      borderWidth: 1.5px
    add-root:
      width: 100%
      border: "{borders.dashed-add}"
      hoverBorderColor: "{colors.brand-500}"
      hoverTextColor: "{colors.brand-700}"

  inspector-panel:
    width: 320px
    background: "{colors.surface-panel}"
    borderLeft: "{borders.hairline}"
    title-typography: "{typography.panel-title}"
    body-padding: "14px 16px 18px"
    body-gap: 14px
    tab:
      paddingY: 8px
      typography: "{typography.row}"
      textColor: "{colors.fg-secondary}"
      borderBottom: "2px solid transparent"
    tab-active:
      textColor: "{colors.brand-700}"
      borderBottom: "2px solid {colors.brand-600}"
      fontWeight: "500"

  canvas:
    background: "{colors.surface-canvas}"
    backgroundPattern: "{backgrounds.canvas-dot-grid}"
    inset: 24px
    gap: 16px

  capability-container:
    background: "{colors.cat-<name>-bg}"
    border: "1.5px solid {colors.cat-<name>-border}"
    rounded: "{rounded.DEFAULT}"
    padding: "12px 14px"
    gap: 10px
    title-typography: "{typography.headline-md}"
    title-swatch:
      size: 12px
      rounded: 2px
      borderWidth: 1.5px
    selected-shadow: "0 0 0 2px {colors.cat-<name>-border}"

  capability-node:
    background: "{colors.surface-panel}"
    border: "1px solid {colors.border-strong}"
    rounded: "{rounded.sm}"
    padding: "12px 10px"
    minHeight: 44px
    typography: "{typography.label}"
    textAlign: center
    score-typography: "{typography.micro}"
    score-color: "{colors.fg-secondary}"
    hover-shadow: "0 0 0 1.5px {colors.border-strong}"
    selected-shadow: "0 0 0 2px {colors.brand-700}"

  button-primary:
    background: "{colors.brand-700}"
    textColor: "{colors.fg-on-brand}"
    border: "1px solid {colors.brand-700}"
    rounded: "{rounded.DEFAULT}"
    height: 32px
    padding: "0 12px"
    typography: "{typography.label}"
    iconSize: 14px
    gap: 6px
  button-primary-hover:
    background: "{colors.brand-700-hover}"
    border: "1px solid {colors.brand-700-hover}"

  button-secondary:
    background: "{colors.surface-panel}"
    textColor: "{colors.fg-primary}"
    border: "1px solid {colors.border-strong}"
    shadow: "{shadows.xs}"
    rounded: "{rounded.DEFAULT}"
    height: 32px
    padding: "0 12px"
    typography: "{typography.label}"
  button-secondary-hover:
    background: "{colors.slate-50}"

  button-ghost:
    background: transparent
    textColor: "{colors.fg-primary}"
    rounded: "{rounded.DEFAULT}"
    height: 32px
    padding: "0 12px"
    typography: "{typography.label}"
  button-ghost-hover:
    background: "{colors.slate-100}"

  icon-button:
    size: 32px
    rounded: "{rounded.sm}"
    iconSize: 16px
    color: "{colors.fg-secondary}"
  icon-button-hover:
    background: "{colors.slate-100}"
    color: "{colors.fg-primary}"
  icon-button-active:
    background: "{colors.surface-active}"
    color: "{colors.brand-700}"

  segmented:
    background: "{colors.slate-100}"
    rounded: "{rounded.DEFAULT}"
    padding: 3px
    gap: 2px
    item:
      paddingX: 10px
      paddingY: 5px
      typography: "{typography.section-label}"
      textColor: "{colors.fg-secondary}"
      rounded: "{rounded.sm}"
    item-on:
      background: "{colors.surface-panel}"
      textColor: "{colors.fg-primary}"
      shadow: "{shadows.segmented-on}"

  toggle:
    width: 34px
    height: 20px
    rounded: "{rounded.full}"
    track-off: "{colors.slate-300}"
    track-on: "{colors.brand-700}"
    thumb-size: 16px
    thumb-color: "{colors.surface-panel}"
    thumb-shadow: "{shadows.toggle-thumb}"
    transition: "{motion.toggle-thumb}"

  input:
    height: 32px
    paddingX: 10px
    border: "{borders.strong}"
    rounded: "{rounded.sm}"
    background: "{colors.surface-panel}"
    typography: "{typography.row}"
  input-focus:
    borderColor: "{colors.border-focus}"
    shadow: "{shadows.ring-focus}"

  textarea:
    padding: "8px 10px"
    minHeight: 64px
    rounded: "{rounded.sm}"
    border: "{borders.strong}"

  color-select:
    height: 32px
    border: "{borders.strong}"
    rounded: "{rounded.sm}"
    background: "{colors.surface-panel}"
    swatch:
      size: 18px
      rounded: "{rounded.xs}"

  info-card:
    background: "{colors.brand-50}"
    border: "1px solid {colors.brand-100}"
    rounded: "{rounded.DEFAULT}"
    padding: "10px 12px"
    typography: "{typography.section-label}"
    textColor: "{colors.fg-secondary}"
    iconColor: "{colors.brand-700}"

  meta-list:
    grid-template-columns: "90px 1fr"
    gap: "6px 12px"
    typography: "{typography.section-label}"
    label-color: "{colors.fg-secondary}"
    value-color: "{colors.fg-primary}"
    value-numeric: tabular-nums

  menu:
    minWidth: 220px
    background: "{colors.surface-panel}"
    border: "{borders.hairline}"
    rounded: "{rounded.lg}"
    shadow: "{shadows.md}"
    padding: 6px
    item:
      paddingX: 10px
      paddingY: 7px
      typography: "{typography.row}"
      rounded: "{rounded.sm}"
      kbd-color: "{colors.fg-tertiary}"
    item-hover:
      background: "{colors.slate-100}"

  minimap:
    width: 180px
    height: 110px
    background: "{colors.surface-panel}"
    border: "{borders.hairline}"
    rounded: "{rounded.lg}"
    shadow: "{shadows.sm}"
    padding: 6px
    canvas-background: "{colors.slate-50}"
    viewport-border: "1.5px solid {colors.brand-600}"

  bulk-toolbar:
    background: "{colors.surface-panel}"
    border: "{borders.hairline}"
    rounded: "{rounded.lg}"
    shadow: "{shadows.sm}"
    padding: 4px
    gap: 4px
    button-size: 28px
    button-rounded: "{rounded.sm}"
    danger-hover-background: "#FEF2F2"
    danger-hover-color: "#B91C1C"

  status-badge:
    minWidth: 14px
    height: 14px
    paddingX: 4px
    background: "{colors.brand-700}"
    textColor: "{colors.fg-on-brand}"
    rounded: "{rounded.full}"
    fontSize: 9px
    fontWeight: "600"

  readonly-chip:
    background: "{colors.brand-50}"
    textColor: "{colors.brand-700}"
    border: "1px solid {colors.brand-100}"
    paddingX: 8px
    paddingY: 2px
    rounded: "{rounded.full}"
    fontSize: 11px
    fontWeight: "500"

  code-inline:
    fontFamily: "{typography.fontFamilyMono}"
    fontSize: 12px
    background: "{colors.slate-100}"
    paddingX: 6px
    paddingY: 1px
    rounded: "{rounded.xs}"

  link:
    textColor: "{colors.fg-link}"
    hover: underline
    underlineOffset: 2px

  focus-ring:
    shadow: "{shadows.ring-focus}"
    borderColor: "{colors.border-focus}"

iconography:
  defaultStrokeWidth: 1.5px
  inToolbar: 16px
  inButton: 14px
  inMenuItem: 14px
  inStatusBar: 14px
  defaultColor: "{colors.fg-secondary}"
  hoverColor: "{colors.fg-primary}"
  activeColor: "{colors.brand-700}"
---

# Capability Canvas — Visual Identity

Capability Canvas is a focused desktop tool for modelling and analysing the
business capabilities of an enterprise. The look and feel borrows from
modern, slate-based IDEs and design tools (Linear, Figma, Notion) — the
chrome stays out of the way and the model is the hero.

## Personality

The product is **calm, precise, and analytical**. It is used by enterprise
architects, transformation leads, and consultants who spend long sessions
arranging hierarchies, scoring capabilities, and exporting deliverables.
Visual decisions favour readability over flair: there are no gradients,
no glassmorphism, no decorative ornament. Information density is higher
than a marketing page, but pacing is loose enough that a 300-node canvas
still feels organised.

The teal brand colour anchors the identity. It appears on the logo, on
primary CTAs, on the active item in the outline, on focus rings, and on
the badge pill of unread notifications. Everywhere else, the palette
recedes into white panels and slate-grey type.

## Three-pane workspace

The screen is always divided into the same three columns:

- **Outline (260 px)** on the left — a collapsible tree of the capability
  hierarchy, with a search field at the top and an `+ Add root capability`
  dashed-border button at the bottom.
- **Canvas (flexible)** in the middle — a soft slate-100 surface with a
  16 px radial dot grid, holding the rendered capability containers and
  nodes plus floating overlays.
- **Inspector (320 px)** on the right — tabbed property editor for the
  current selection, with breadcrumb, label, description, colour picker,
  heatmap value, manual-positioning toggle, and metadata.

A 52 px **toolbar** runs across the top with the brand mark, model
selector, action groups separated by 1 px × 22 px hairline dividers, a
flexible spacer, and persistent right-side controls (zoom segmented
control, `Auto-layout` primary CTA, `Heatmap` toggle, share/sign-in).

A 32 px **status bar** runs along the bottom: a small green dot for
"Local autosaved", change counts in tabular-nums, a flexible spacer,
selection counts, and small icon buttons for help, notifications, and
account. Notification counts sit in a 14 × 14 brand-700 pill in the top
right of their icon.

## Colour language

### Brand

Teal `#0F766E` is the only true brand colour. It is used **sparingly** —
on roughly one element per region. It saturates only on primary actions,
the active outline row (paired with the very pale brand-50 background),
the active inspector tab underline, the focus ring (at 20% alpha), and
the read-only chip. Hover on a primary button drops to `#0B5E57`, never
brightens.

### Neutrals

Everything else lives on a slate ramp from `#020617` to `#F8FAFC`.
- App background: `#F8FAFC` (slate-50)
- Panels (toolbar, outline, inspector, status bar, popovers): pure white
- Canvas surface: `#F1F5F9` (slate-100), with a dotted grid at 6% slate-900
- Hairline borders: `#E2E8F0`
- Strong borders (inputs, container outlines): `#CBD5E1`
- Body text: `#0F172A`; secondary `#475569`; tertiary / placeholders `#94A3B8`

### Category palette (the personality of the canvas)

The canvas only feels alive because of the **six soft category tints**.
Each category is a `bg / border / dot` triple:

| Category | Background | Border | Dot |
| --- | --- | --- | --- |
| Mint | `#ECFDF5` | `#6EE7B7` | `#10B981` |
| Sky | `#ECFEFF` | `#7DD3FC` | `#0EA5E9` |
| Coral | `#FEF2F2` | `#FCA5A5` | `#EF4444` |
| Amber | `#FFFBEB` | `#FCD34D` | `#F59E0B` |
| Lavender | `#F5F3FF` | `#C4B5FD` | `#8B5CF6` |
| Peach | `#FFF7ED` | `#FDBA74` | `#F97316` |

The **container** (the labelled grouping such as "Customer", "Servicing",
"Risk") uses the soft tint as its background and the matching saturated
border at 1.5 px. The **leaf node** inside is white with a thin slate-300
border so the category colour does not double up. A small 11 × 11 squared
swatch with a 1.5 px coloured border appears next to the container title
and next to each outline row, mirroring the canvas. Categories are
identity, not status; they should never carry a meaning like "good" or
"bad".

### Heatmap

When the heatmap is enabled, container fills are replaced by a five-stop
ramp from green `#86EFAC` through yellow `#FDE047` to red `#EF4444`. The
fills are saturated (not tinted) — this mode is intentionally louder than
the default category view, because the user has explicitly asked for an
analytical signal. The legend in the bottom-left of the canvas is a
horizontal gradient bar with `Low → High` labels in 11 px slate-500.
Numeric scores throughout (`0.65`, `0.72`) always render in tabular-nums
so columns line up.

### Semantic

Success green `#10B981` (the autosave dot), warning amber `#F59E0B`
(layout-diagnostics triangle), info blue `#3B82F6`, danger red `#EF4444`
(only on destructive controls — never on selection). Selection is always
the brand teal, never red.

## Typography

The typeface is **Inter** with `cv11` and `ss01` features enabled, falling
back to the platform UI stack. Sizes climb in 1–2 px steps from 11 px
(meta) up to 22 px (rare dialog titles), reflecting the dense IDE feel —
there is no 24 px+ marketing display type in the product.

| Role | Size | Weight | Tracking |
| --- | --- | --- | --- |
| Dialog title (rare) | 22 px | 600 | -0.01em |
| Page heading (rare) | 18 px | 600 | normal |
| Panel title (`Inspector`, `Outline`, `Export`) | 16 px | 600 | -0.005em |
| Section heading | 15 px | 600 | normal |
| Body / description | 14 px | 400 | normal |
| Row label, button text | 13 px | 500 | normal |
| Section label (`Color`, `Format`) | 12 px | 500 | normal |
| Meta (timestamps, counts) | 12 px | 400 | normal |
| Micro (node score, kbd hint) | 11 px | 400 | normal |

All numeric output — heatmap scores, change counts, selection counts,
keyboard hints, IDs — uses `font-variant-numeric: tabular-nums` so values
align in columns. Inline `code` is a 12 px monospace pill with a
slate-100 background and 4 px radius. Links are brand-700 and underline
on hover at 2 px offset. Headings carry slight negative tracking
(`-0.005em` to `-0.01em`); body type sits at zero.

## Spacing & layout

The grid is **4 px-based**, with practical steps at 4, 8, 12, 16, 20, 24,
32, 40, 48, 64. Most padding is in the 8–16 px range; only the canvas
itself uses 24 px insets. Two fixed measurements anchor the layout:

- Outline column: **260 px**, Inspector column: **320 px**
- Toolbar: **52 px**, Status bar: **32 px**
- Canvas grid: **16 px** dots, container gap: **16 px**, child-row gap: **8 px**
- Standard control height: **32 px** (buttons, inputs, segmented items, color selects)
- Icon button: **32 × 32**, with 16 px icons
- Toggle: **34 × 20** track, 16 × 16 thumb
- Outline row: **30 px** tall (5 × 8 px padding), with 6 px gap to the chevron and 11 px swatch

## Shape

The product uses a **gentle, consistent radius ladder**, never full pills
on rectangular elements except for explicit chips and badges:

- 4 px — tiny chips, color swatches, code pills
- 6 px — inputs, small buttons, outline rows, menu items
- 8 px — default buttons, capability containers, segmented controls, info cards
- 10 px — popovers, dropdown menus, minimap, bulk toolbar
- 12 px — modals (rare)
- 9999 px — toggle track, status badge, read-only chip

Borders are crisp: 1 px hairlines between regions, 1 px slate-300 around
inputs and leaf nodes, 1.5 px coloured borders around capability
containers (so the category reads at a glance), and 1 px dashed
slate-300 on the `+ Add root capability` and other "create" affordances.

## Elevation & shadow

The product is **flat by default**. Panels do not float above the app
background — they butt against it, separated only by hairline dividers.
Shadows are reserved for things that genuinely *float*:

- `xs` (`0 1px 2px rgba(15,23,42,.04)`) — secondary buttons, segmented `on` thumbs
- `sm` (`0 1px 3px / 0 1px 2px`) — minimap, floating bulk toolbar
- `md` (`0 8px 24px / 0 2px 6px`) — dropdown menus, popovers
- `lg` (`0 16px 40px / 0 4px 12px`) — modals (rare)

Selection is communicated with a **2 px box-shadow ring** in the
selection colour, never with elevation: containers ring in their category
border colour, leaf nodes ring in brand-700. Hover on a leaf node shows a
1.5 px ring of its own border colour. Focus on inputs and interactive
controls shows the canonical **3 px brand-500 @ 20% alpha ring**.

## Motion

Motion is fast, functional, and physics-light. Three durations only:

- **120 ms** — colour, background, and border transitions on hover, the
  default for almost every interaction
- **180 ms** — the "base" tier (modals, panel reveals)
- **240 ms** — slower entrances and complex transitions

Easing curves: `cubic-bezier(0.2, 0, 0, 1)` for most transitions
(standard), `(0.0, 0, 0.2, 1)` for entrances, `(0.4, 0, 1, 1)` for exits.
The toggle thumb uses `140 ms cubic-bezier(0.2, 0, 0, 1)` to give the
control a small but noticeable snap. Outline tree chevrons rotate −90°
when collapsed with a 120 ms transition. Nothing in the product bounces,
overshoots, or fades through opacity for selection feedback.

## Iconography

Icons are **line-style at 1.5 px stroke** (Lucide / Phosphor regular feel),
sized by context:

- 16 px in the toolbar and inside icon buttons
- 14 px inside text buttons, menu items, and status-bar icons
- The default colour matches `fg-secondary` (`#475569`), brightening to
  `fg-primary` on hover and to `brand-700` on the active state

Icons sit on a 32 × 32 hit target with a 6 px hover background of
`slate-100`. Active icon buttons keep the 6 px shape but pick up the very
pale `brand-50` background and `brand-700` foreground.

## Components in use

### Capability container

The signature element. A soft category-tint rectangle with a 1.5 px
matching border and an 8 px radius. Inside it sits a title row (12 × 12
square colour swatch + 14 px / 600 label + right-aligned tabular score in
12 px slate-600) and a 1- to 4-column grid of leaf nodes spaced 8 px
apart. Selecting a container draws a 2 px ring in the same category
border colour just outside the box.

### Capability node

A white tile, 1 px slate-300 border, 6 px radius, ~44 px tall, padded
12 px × 10 px. Centre-aligned 13 px / 500 label with an optional 11 px
slate-600 score below. Hover paints a 1.5 px ring of the node's own
border colour; selection paints a 2 px brand-700 ring.

### Outline row

30 px tall row with a chevron, an optional 11 px coloured swatch, the
label (truncated with ellipsis), and a right-aligned score in 11 px
slate-400 tabular-nums. Hover gives `slate-100`, active becomes the
`brand-50` / `brand-700` / 500-weight combination, and a kebab-menu
button reveals only on hover.

### Floating overlays

The minimap (180 px wide, 10 px radius, `sm` shadow, slate-50 inner
canvas with a 1.5 px brand-600 viewport rectangle) sits 16 px from the
bottom-right corner of the canvas. The bulk-action toolbar (10 px radius,
`sm` shadow, 4 px padding) appears bottom-centre when more than one node
is selected, leading with a 12 px / 500 selection count and ending with a
danger button that picks up `#FEF2F2` / `#B91C1C` only on hover.

### Inspector internals

Tabs sit on a hairline border with the active tab carrying a 2 px
brand-600 underline and brand-700 text. Inside the body, a 90 / 1fr meta
list aligns labels and values; a `cc-info-card` (brand-50 background,
brand-100 border, 8 px radius, 12 px secondary text, brand-700 leading
icon) calls out automatic-positioning and similar contextual help.

### Read-only mode

When the canvas is shared as a viewer link, the toolbar replaces the
brand name with `Capability Canvas Viewer`, primary CTAs disappear, and
a small pill chip — `brand-50` background, `brand-100` border, 11 px /
500 brand-700 text, 9999 px radius — appears in the toolbar to mark the
session as read-only.

## Voice of the chrome

Labels are **terse, sentence-case, and unornamented**: `Outline`,
`Inspector`, `Export`, `Auto-layout`, `Heatmap`, `Add root capability`,
`Local autosaved`, `All changes saved locally`, `1 selected`. There are
no exclamation marks, no marketing verbs, and no emoji in the UI. Empty
states and helper text use the same slate-600 secondary colour as body
copy and stay under two lines wherever possible.

## Do / don't summary

- **Do** keep panels flat and white; let the canvas tints carry the colour.
- **Do** use teal exactly once per region, on the most important action.
- **Do** render every numeric value in tabular-nums.
- **Do** use 1.5 px coloured borders on capability containers so the
  category reads from across the room.
- **Don't** introduce gradients, drop shadows on panels, or coloured
  headers — the product is intentionally quiet.
- **Don't** use red for selection or hover; red is only for destructive
  actions.
- **Don't** mix category tints with heatmap fills in the same view; the
  heatmap is a mode, not a layer.
- **Don't** scale type above 22 px; this is a workspace, not a landing
  page.
