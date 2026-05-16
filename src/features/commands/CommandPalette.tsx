import { Search, X } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useFocusTrap } from "../shared/a11y";
import {
  commandMatchesSearch,
  isEditableTarget,
  type CommandAvailability,
  type CommandDefinition,
} from "./types";

interface CommandPaletteProps<TContext> {
  commands: CommandDefinition<TContext>[];
  context: TContext;
}

interface CommandResult<TContext> {
  command: CommandDefinition<TContext>;
  availability: CommandAvailability;
}

interface ClosePaletteOptions {
  restoreFocus?: boolean;
}

export function CommandPalette<TContext>({
  commands,
  context,
}: CommandPaletteProps<TContext>) {
  const inputId = useId();
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const results = useMemo(
    () =>
      commands
        .map<CommandResult<TContext>>((command) => ({
          command,
          availability: command.canRun(context),
        }))
        .filter(
          ({ command, availability }) =>
            !availability.hidden && commandMatchesSearch(command, query),
        ),
    [commands, context, query],
  );
  const activeResult = results[activeIndex];
  const closePalette = (options: ClosePaletteOptions = {}) => {
    const returnTarget =
      options.restoreFocus === false ? null : returnFocusRef.current;
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
    if (returnTarget && document.contains(returnTarget)) {
      window.requestAnimationFrame(() => {
        returnTarget.focus();
        window.requestAnimationFrame(() => returnTarget.focus());
      });
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || open) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() !== "k") return;
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      const activeElement =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      returnFocusRef.current =
        activeElement && activeElement !== document.body
          ? activeElement
          : triggerRef.current;
      setOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useFocusTrap({
    active: open,
    containerRef: dialogRef,
    initialFocusRef: inputRef,
    restoreFocus: false,
    onEscape: closePalette,
  });

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (activeIndex < results.length) return;
    setActiveIndex(Math.max(0, results.length - 1));
  }, [activeIndex, results.length]);

  const openPalette = () => {
    returnFocusRef.current = triggerRef.current;
    setOpen(true);
  };

  const runResult = (result: CommandResult<TContext> | undefined) => {
    if (!result?.availability.valid) return;
    result.command.run(context);
    closePalette({ restoreFocus: false });
  };

  const moveActive = (delta: 1 | -1) => {
    if (results.length === 0) return;
    setActiveIndex((current) => (current + delta + results.length) % results.length);
  };

  const handleKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closePalette();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(Math.max(0, results.length - 1));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      runResult(activeResult);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        className="cc-icon-btn"
        type="button"
        aria-label="Open command palette"
        title="Open command palette (Ctrl/Cmd+K)"
        onClick={openPalette}
      >
        <Search aria-hidden="true" />
      </button>
      {open && (
        <div
          className="cc-modal-backdrop cc-command-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePalette();
          }}
        >
          <section
            ref={dialogRef}
            className="cc-modal cc-command-palette"
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            onKeyDown={handleKeyDown}
          >
            <div className="cc-command-search">
              <Search aria-hidden="true" />
              <input
                ref={inputRef}
                id={inputId}
                value={query}
                autoComplete="off"
                spellCheck={false}
                role="combobox"
                aria-label="Search commands"
                aria-controls={listId}
                aria-expanded="true"
                aria-activedescendant={
                  activeResult ? commandOptionId(listId, activeResult.command.id) : undefined
                }
                placeholder="Search commands"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
              />
              <button
                className="cc-icon-btn"
                type="button"
                aria-label="Close command palette"
                onClick={() => closePalette()}
              >
                <X aria-hidden="true" />
              </button>
            </div>
            <div
              id={listId}
              className="cc-command-results"
              role="listbox"
              aria-label="Commands"
            >
              {results.length === 0 ? (
                <div className="cc-command-empty">No matching commands</div>
              ) : (
                results.map((result, index) => {
                  const active = index === activeIndex;
                  const disabled = !result.availability.valid;
                  return (
                    <div
                      key={result.command.id}
                      id={commandOptionId(listId, result.command.id)}
                      className={`cc-command-result ${active ? "active" : ""} ${
                        disabled ? "disabled" : ""
                      } ${result.command.tone === "danger" ? "danger" : ""}`}
                      role="option"
                      aria-selected={active}
                      aria-disabled={disabled}
                      title={result.availability.reason ?? result.command.label}
                      onMouseMove={() => setActiveIndex(index)}
                      onClick={() => runResult(result)}
                    >
                      <span className="cc-command-copy">
                        <strong>{result.command.label}</strong>
                        <span>
                          {result.command.group}
                          {result.availability.reason
                            ? ` - ${result.availability.reason}`
                            : ""}
                        </span>
                      </span>
                      {result.command.shortcut && (
                        <kbd className="cc-kbd">{result.command.shortcut}</kbd>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function commandOptionId(listId: string, commandId: string) {
  return `${listId}-${commandId}`;
}
