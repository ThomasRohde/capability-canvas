import { Keyboard, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFocusTrap } from "../shared/a11y";
import {
  commandShortcutItems,
  STATIC_SHORTCUT_SECTIONS,
  type ShortcutItem,
} from "./shortcutContent";
import {
  isEditableTarget,
  type CommandDefinition,
} from "./types";

interface ShortcutHelpProps<TContext> {
  commands: CommandDefinition<TContext>[];
  context: TContext;
}

export function ShortcutHelp<TContext>({
  commands,
  context,
}: ShortcutHelpProps<TContext>) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const commandShortcuts = useMemo(
    () => commandShortcutItems(commands, context),
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

  useFocusTrap({
    active: open,
    containerRef: dialogRef,
    initialFocusRef: closeRef,
    onEscape: () => setOpen(false),
  });

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
            ref={dialogRef}
            className="cc-modal cc-shortcut-help"
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard shortcuts"
          >
            <div className="cc-modal-head">
              <div className="cc-panel-title">Keyboard shortcuts</div>
              <button
                ref={closeRef}
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
                items={commandShortcuts}
              />
              {STATIC_SHORTCUT_SECTIONS.map((section) => (
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
  items: ShortcutItem[];
}) {
  return (
    <section className="cc-shortcut-section">
      <h2>{title}</h2>
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
