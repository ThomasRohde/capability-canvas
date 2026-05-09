import { Keyboard, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  isEditableTarget,
  type CommandDefinition,
} from "./types";

interface ShortcutHelpProps<TContext> {
  commands: CommandDefinition<TContext>[];
  context: TContext;
}

const STATIC_SECTIONS = [
  {
    title: "Pan and zoom",
    items: [
      ["Drag background", "Pan the canvas"],
      ["Ctrl/Cmd+wheel", "Zoom around the pointer"],
      ["Minimap controls", "Fit, zoom, or jump the viewport"],
    ],
  },
  {
    title: "Selection",
    items: [
      ["Click", "Select a capability"],
      ["Shift/Ctrl/Cmd+click", "Extend selection within valid sibling sets"],
      ["Shift/Ctrl/Cmd+drag", "Marquee select visible capabilities"],
      ["Ctrl/Cmd+A", "Select visible capabilities from the current context"],
    ],
  },
  {
    title: "Inline editing",
    items: [
      ["Enter", "Rename the selected visible item"],
      ["Double-click label", "Rename that item"],
      ["Enter while editing", "Commit the label"],
      ["Escape while editing", "Cancel the label edit"],
    ],
  },
  {
    title: "Canvas movement",
    items: [
      ["Arrow keys", "Move selected capabilities"],
      ["Shift+Arrow keys", "Move selected capabilities by a larger step"],
      ["Escape", "Cancel an in-progress drag, resize, or selection preview"],
    ],
  },
];

export function ShortcutHelp<TContext>({
  commands,
  context,
}: ShortcutHelpProps<TContext>) {
  const [open, setOpen] = useState(false);
  const commandShortcuts = useMemo(
    () =>
      commands
        .filter((command) => command.shortcut && !command.canRun(context).hidden)
        .map((command) => ({
          id: command.id,
          group: command.group,
          label: command.label,
          shortcut: command.shortcut!,
        })),
    [commands, context],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || open) return;
      if (event.key !== "?" || event.ctrlKey || event.metaKey || event.altKey)
        return;
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      setOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button
        className="cc-icon-btn"
        type="button"
        aria-label="Keyboard shortcuts"
        title="Keyboard shortcuts (?)"
        onClick={() => setOpen(true)}
      >
        <Keyboard aria-hidden="true" />
      </button>
      {open && (
        <div
          className="cc-modal-backdrop cc-shortcut-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            className="cc-modal cc-shortcut-help"
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard shortcuts"
          >
            <div className="cc-modal-head">
              <div className="cc-panel-title">Keyboard shortcuts</div>
              <button
                className="cc-icon-btn"
                type="button"
                aria-label="Close keyboard shortcuts"
                onClick={() => setOpen(false)}
              >
                <X aria-hidden="true" />
              </button>
            </div>
            <div className="cc-shortcut-body">
              <ShortcutSection
                title="Commands"
                items={commandShortcuts.map((item) => [
                  item.shortcut,
                  `${item.group}: ${item.label}`,
                ])}
              />
              {STATIC_SECTIONS.map((section) => (
                <ShortcutSection
                  key={section.title}
                  title={section.title}
                  items={section.items}
                />
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function ShortcutSection({
  title,
  items,
}: {
  title: string;
  items: string[][];
}) {
  return (
    <section className="cc-shortcut-section">
      <h2>{title}</h2>
      <dl>
        {items.map(([keys, description]) => (
          <div key={`${keys}-${description}`}>
            <dt>
              <kbd className="cc-kbd">{keys}</kbd>
            </dt>
            <dd>{description}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
