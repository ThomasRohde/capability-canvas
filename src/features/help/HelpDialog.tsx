import { Check, Copy, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useUiStore } from "../../app/stores/uiStore";
import {
  commandShortcutItems,
  STATIC_SHORTCUT_SECTIONS,
  type ShortcutItem,
} from "../commands/shortcutContent";
import {
  isEditableTarget,
  type CommandDefinition,
} from "../commands/types";
import { useFocusTrap } from "../shared/a11y";

interface HelpDialogProps<TContext> {
  commands: CommandDefinition<TContext>[];
  context: TContext;
}

const HELP_INDEX = [
  { id: "help-start", label: "Start" },
  { id: "help-canvas", label: "Canvas" },
  { id: "help-layout", label: "Layout and views" },
  { id: "help-shortcuts", label: "Shortcuts" },
  { id: "help-storage", label: "Storage and privacy" },
  { id: "help-formats", label: "Data formats" },
] as const;

type HelpSectionId = (typeof HELP_INDEX)[number]["id"];

const FORMAT_SPECS = [
  {
    id: "hierarchy-json",
    title: "Capability hierarchy JSON",
    summary:
      "Best format to ask an agent to generate. The app converts it into a valid Capability Canvas document.",
    accepts:
      "Import JSON file or Import pasted JSON. Extra fields are kept as metadata.",
    copyLabel: "Copy hierarchy format",
    body: `Create Capability Canvas import JSON in this supported hierarchy format.

Return only valid JSON. Use stable lowercase kebab-case ids. Top-level capabilities have parent null or no parent field. Child rows reference parent by id. Put extra source data in metadata.

{
  "title": "Capability model title",
  "capabilities": [
    {
      "id": "customer",
      "name": "Customer",
      "parent": null,
      "description": "Customer-facing capabilities.",
      "metadata": {
        "owner": "Business Architecture"
      }
    },
    {
      "id": "digital-onboarding",
      "name": "Digital Onboarding",
      "parent": "customer",
      "description": "Enables customers to open accounts digitally."
    }
  ]
}`,
  },
  {
    id: "nested-hierarchy-json",
    title: "Nested hierarchy JSON",
    summary:
      "Alternative agent-friendly shape when source data is already a tree.",
    accepts:
      "Import JSON file or Import pasted JSON. Children can be nested under children, items, nodes, childNodes, childCapabilities, or subCapabilities.",
    copyLabel: "Copy nested format",
    body: `Create Capability Canvas import JSON in this supported nested hierarchy format.

Return only valid JSON. Use stable lowercase kebab-case ids. Each node needs an id or name. Descriptions are optional. Extra fields are preserved as metadata.

{
  "title": "Capability model title",
  "root": {
    "id": "customer",
    "name": "Customer",
    "description": "Customer-facing capabilities.",
    "children": [
      {
        "id": "digital",
        "name": "Digital",
        "children": [
          {
            "id": "digital-onboarding",
            "name": "Digital Onboarding",
            "description": "Enables customers to open accounts digitally."
          }
        ]
      }
    ]
  }
}`,
  },
  {
    id: "prompt-merge-json",
    title: "Prompt merge JSON",
    summary:
      "Adds or updates children beneath a selected capability without replacing the full document.",
    accepts:
      "Import pasted JSON. The targetId must be an existing capability id.",
    copyLabel: "Copy merge format",
    body: `Create Capability Canvas prompt-merge JSON.

Return only valid JSON. targetId is the existing capability to expand. Capabilities are added or matched below that target. Use parentId only when a generated capability should sit below another generated capability in this payload.

{
  "schema": "capability-canvas.prompt-merge",
  "version": "1.0",
  "targetId": "digital",
  "capabilities": [
    {
      "id": "digital-onboarding",
      "name": "Digital Onboarding",
      "description": "Enables customers to open accounts digitally.",
      "metadata": {
        "source": "agent"
      }
    },
    {
      "id": "identity-verification",
      "name": "Identity Verification",
      "parentId": "digital-onboarding",
      "description": "Confirms customer identity during onboarding."
    }
  ]
}`,
  },
  {
    id: "heatmap-csv",
    title: "Heatmap CSV",
    summary:
      "Updates heatmap scores on existing capabilities. Values must be numbers from 0 to 1.",
    accepts:
      "Settings > Heatmap data > Import CSV. Default matching uses id and value columns.",
    copyLabel: "Copy CSV format",
    body: `Create Capability Canvas heatmap CSV.

Return only CSV text, not Markdown. Include a header row. The default import expects id,value. The id must match an existing capability id. Values must be between 0 and 1.

id,value
digital-onboarding,0.82
identity-verification,0.64
customer-support,0.35`,
  },
  {
    id: "document-json",
    title: "Full native document JSON",
    summary:
      "Full-fidelity backup and round-trip format. Prefer hierarchy JSON for generated imports unless exact layout must be preserved.",
    accepts:
      "Import JSON file or Import pasted JSON. Export JSON produces this shape.",
    copyLabel: "Copy native skeleton",
    body: `Create Capability Canvas full native document JSON only when exact geometry or view state must be controlled.

Return only valid JSON. Every node requires geometry, timestamps, type, color, and parentId. Root nodes use parentId null. Use schema capability-canvas.document and version 1.2.

{
  "schema": "capability-canvas.document",
  "version": "1.2",
  "title": "Capability model title",
  "nodes": [
    {
      "id": "customer",
      "parentId": null,
      "label": "Customer",
      "x": 40,
      "y": 40,
      "w": 520,
      "h": 320,
      "type": "root",
      "color": "mint",
      "description": "Customer-facing capabilities.",
      "metadata": {},
      "isManualPositioningEnabled": false,
      "isLockedAsIs": false,
      "isTextLabel": false,
      "isOnCanvas": true,
      "createdAt": 1735689600000,
      "updatedAt": 1735689600000
    }
  ],
  "settings": {
    "gridEnabled": true,
    "gridSize": 8,
    "resizeSnapToGrid": true,
    "fixedLeafWidth": 168,
    "fixedLeafHeight": 72,
    "leafColor": "mint",
    "defaultParentWidth": 360,
    "defaultParentHeight": 220,
    "containerPaddingTop": 44,
    "containerPaddingRight": 20,
    "containerPaddingBottom": 20,
    "containerPaddingLeft": 20,
    "containerTitleHeight": 28,
    "containerLabelOffsetTop": 14,
    "childGapX": 16,
    "childGapY": 16,
    "fontFamily": "Inter",
    "borderRadius": 8,
    "layoutMode": "adaptive",
    "layoutAspectRatioPreset": "auto",
    "customLayoutAspectRatioWidth": 16,
    "customLayoutAspectRatioHeight": 9
  },
  "layout": {
    "mode": "adaptive",
    "isUserArranged": false,
    "preservePositions": false,
    "boundingBox": { "x": 0, "y": 0, "w": 600, "h": 420 }
  },
  "heatmap": {
    "enabled": false,
    "showLegend": true,
    "palette": "green-yellow-red",
    "fallbackColor": "mint"
  },
  "timestamp": 1735689600000
}`,
  },
];

export function HelpDialog<TContext>({
  commands,
  context,
}: HelpDialogProps<TContext>) {
  const open = useUiStore((state) => state.helpDialogOpen);
  const setHelpDialogOpen = useUiStore((state) => state.setHelpDialogOpen);
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const copyTimeoutRef = useRef<number | null>(null);
  const [copiedSpecId, setCopiedSpecId] = useState<string | null>(null);
  const commandShortcuts = useMemo(
    () => commandShortcutItems(commands, context),
    [commands, context],
  );
  const closeHelp = useCallback(
    () => setHelpDialogOpen(false),
    [setHelpDialogOpen],
  );

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current !== null) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || open) return;
      if (event.key !== "?" || event.ctrlKey || event.metaKey || event.altKey)
        return;
      if (isEditableTarget(event.target)) return;
      if (document.querySelector("[aria-modal='true']")) return;
      event.preventDefault();
      setHelpDialogOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, setHelpDialogOpen]);

  useFocusTrap({
    active: open,
    containerRef: dialogRef,
    initialFocusRef: closeRef,
    onEscape: closeHelp,
  });

  const scrollToSection = (id: HelpSectionId) => {
    dialogRef.current
      ?.querySelector<HTMLElement>(`#${id}`)
      ?.scrollIntoView({ block: "start" });
  };

  const copyFormat = (id: string, body: string) => {
    void copyTextToClipboard(body).then(() => {
      setCopiedSpecId(id);
      if (copyTimeoutRef.current !== null) {
        window.clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = window.setTimeout(() => {
        setCopiedSpecId(null);
        copyTimeoutRef.current = null;
      }, 1800);
    });
  };

  if (!open) return null;

  return (
    <div
      className="cc-modal-backdrop cc-help-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeHelp();
      }}
    >
      <section
        ref={dialogRef}
        className="cc-modal cc-help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cc-help-title"
      >
        <div className="cc-modal-head">
          <div id="cc-help-title" className="cc-panel-title">
            Help
          </div>
          <button
            ref={closeRef}
            className="cc-icon-btn"
            type="button"
            aria-label="Close help"
            onClick={closeHelp}
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <div className="cc-help-body">
          <nav className="cc-help-index" aria-label="Help topics">
            {HELP_INDEX.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => scrollToSection(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="cc-help-content">
            <HelpSection id="help-start" title="Getting started">
              <p>
                Build the model as a hierarchy first: add roots for major areas,
                select a capability, then add children for deeper levels.
              </p>
              <p>
                Capability Canvas keeps the containment model valid while you
                edit labels, descriptions, colors, ownership metadata, and
                heatmap scores.
              </p>
              <p>
                Use hierarchy JSON for generated imports, prompt-merge JSON to
                expand one selected capability, and exported document JSON for
                durable backups.
              </p>
            </HelpSection>

            <HelpSection id="help-canvas" title="Canvas and editing">
              <HelpList
                items={[
                  "Use the outline to navigate large models and restore hidden active-view results.",
                  "Select capabilities on the canvas before using Add child, duplicate, delete, layout, or bulk tools.",
                  "Drag and resize visible capabilities for manual presentation work; document changes commit after the interaction finishes.",
                  "Use the inspector for properties, layout flags, heatmap values, and metadata JSON.",
                ]}
              />
            </HelpSection>

            <HelpSection id="help-layout" title="Layout and views">
              <HelpList
                items={[
                  "Auto layout arranges unlocked visible capabilities in the active view.",
                  "Locked nodes and manually positioned child groups preserve their placement during layout updates.",
                  "Views store presentation state over the same source model, including visibility, collapsed branches, page framing, and heatmap display.",
                  "Deleting a view does not delete source-model capabilities.",
                ]}
              />
            </HelpSection>

            <HelpSection id="help-shortcuts" title="Keyboard shortcuts">
              <div className="cc-help-shortcuts">
                <ShortcutSection title="Commands" items={commandShortcuts} />
                {STATIC_SHORTCUT_SECTIONS.map((section) => (
                  <ShortcutSection
                    key={section.title}
                    title={section.title}
                    items={section.items}
                  />
                ))}
              </div>
            </HelpSection>

            <HelpSection id="help-storage" title="Storage and privacy">
              <HelpList
                items={[
                  "The editor runs locally in the browser and does not require a backend for core use.",
                  "Committed documents autosave to browser storage after interactions are idle.",
                  "UI preferences such as panel state, export format, and this help-seen flag are stored in LocalStorage.",
                  "Clearing site data removes local autosave and preferences; export important work as JSON for a durable file backup.",
                ]}
              />
            </HelpSection>

            <HelpSection id="help-formats" title="Data formats">
              <p>
                Copy a format below and paste it into an agent when you want
                the agent to shape raw data for Capability Canvas.
              </p>
              <div className="cc-help-format-list">
                {FORMAT_SPECS.map((spec) => (
                  <article key={spec.id} className="cc-help-format-card">
                    <div className="cc-help-format-head">
                      <div>
                        <h3>{spec.title}</h3>
                        <p>{spec.summary}</p>
                      </div>
                      <button
                        className="cc-btn"
                        type="button"
                        onClick={() => copyFormat(spec.id, spec.body)}
                      >
                        {copiedSpecId === spec.id ? (
                          <Check aria-hidden="true" />
                        ) : (
                          <Copy aria-hidden="true" />
                        )}
                        <span>
                          {copiedSpecId === spec.id
                            ? "Copied"
                            : spec.copyLabel}
                        </span>
                      </button>
                    </div>
                    <div className="cc-help-format-accepts">
                      {spec.accepts}
                    </div>
                    <pre className="cc-help-format-code">
                      <code>{spec.body}</code>
                    </pre>
                  </article>
                ))}
              </div>
            </HelpSection>
          </div>
        </div>
      </section>
    </div>
  );
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the DOM copy path for embedded browser contexts.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.focus();
  textarea.select();
  try {
    document.execCommand("copy");
  } finally {
    textarea.remove();
  }
}

function HelpSection({
  id,
  title,
  children,
}: {
  id: HelpSectionId;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="cc-help-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function HelpList({ items }: { items: string[] }) {
  return (
    <ul className="cc-help-list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function ShortcutSection({
  title,
  items,
}: {
  title: string;
  items: ShortcutItem[];
}) {
  return (
    <section className="cc-help-shortcut-section">
      <h3>{title}</h3>
      <dl>
        {items.map((item) => (
          <div key={`${item.keys}-${item.description}`}>
            <dt>
              <kbd className="cc-kbd">{item.keys}</kbd>
            </dt>
            <dd>{item.description}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
