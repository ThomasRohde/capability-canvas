import {
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";

const DEFAULT_FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(",");

const DEFAULT_MENU_ITEM_SELECTOR = [
  'button[role="menuitem"]:not([disabled])',
  'button[role="menuitemcheckbox"]:not([disabled])',
  'button[role="menuitemradio"]:not([disabled])',
].join(",");

type MenuKeyboardEvent = KeyboardEvent | ReactKeyboardEvent<HTMLElement>;

interface FocusTrapOptions {
  active: boolean;
  containerRef: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onEscape?: () => void;
  disabled?: boolean;
}

interface FocusReturnOptions {
  active: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
}

interface MenuKeyboardNavigationOptions {
  open: boolean;
  menuRef: RefObject<HTMLElement | null>;
  triggerRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
  itemSelector?: string;
}

export type DismissableLayerReason =
  | "pointerdown-outside"
  | "escape"
  | "resize";

interface DismissableLayerOptions {
  open: boolean;
  refs: readonly RefObject<HTMLElement | null>[];
  onDismiss: (
    reason: DismissableLayerReason,
    event: PointerEvent | KeyboardEvent | UIEvent,
  ) => void;
  closeOnEscape?: boolean;
  closeOnPointerDownOutside?: boolean;
  closeOnResize?: boolean;
}

export function getFocusableElements(
  container: HTMLElement | null,
  selector = DEFAULT_FOCUSABLE_SELECTOR,
): HTMLElement[] {
  if (!container) return [];
  return [...container.querySelectorAll<HTMLElement>(selector)].filter(
    (element) =>
      !element.hasAttribute("disabled") &&
      element.getAttribute("aria-disabled") !== "true" &&
      element.getAttribute("aria-hidden") !== "true",
  );
}

export function useFocusReturn({
  active,
  initialFocusRef,
}: FocusReturnOptions) {
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    initialFocusRef?.current?.focus();

    return () => {
      const target = returnFocusRef.current;
      returnFocusRef.current = null;
      if (target && document.contains(target)) {
        window.requestAnimationFrame(() => target.focus());
      }
    };
  }, [active, initialFocusRef]);
}

export function useFocusTrap({
  active,
  containerRef,
  initialFocusRef,
  onEscape,
  disabled = false,
}: FocusTrapOptions) {
  useFocusReturn({ active, initialFocusRef });

  useEffect(() => {
    if (!active || disabled) return;

    const frame = window.requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;
      const target =
        initialFocusRef?.current ??
        getFocusableElements(container)[0] ??
        container;
      target.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && onEscape) {
        event.preventDefault();
        onEscape();
        return;
      }
      if (event.key !== "Tab") return;

      const container = containerRef.current;
      if (!container) return;
      const focusable = getFocusableElements(container);
      if (focusable.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const activeElement =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;

      if (!activeElement || !container.contains(activeElement)) {
        event.preventDefault();
        first.focus();
        return;
      }

      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [active, containerRef, disabled, initialFocusRef, onEscape]);
}

export function useDismissableLayer({
  open,
  refs,
  onDismiss,
  closeOnEscape = true,
  closeOnPointerDownOutside = true,
  closeOnResize = false,
}: DismissableLayerOptions) {
  const refsRef = useRef(refs);

  useEffect(() => {
    refsRef.current = refs;
  }, [refs]);

  useEffect(() => {
    if (!open) return;

    const containsTarget = (target: EventTarget | null) => {
      if (!(target instanceof Node)) return false;
      return refsRef.current.some((ref) => ref.current?.contains(target));
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!closeOnPointerDownOutside || containsTarget(event.target)) return;
      onDismiss("pointerdown-outside", event);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!closeOnEscape || event.defaultPrevented || event.key !== "Escape")
        return;
      event.preventDefault();
      onDismiss("escape", event);
    };

    const onResize = (event: UIEvent) => {
      if (!closeOnResize) return;
      onDismiss("resize", event);
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, [
    closeOnEscape,
    closeOnPointerDownOutside,
    closeOnResize,
    onDismiss,
    open,
  ]);
}

export function useMenuKeyboardNavigation({
  open,
  menuRef,
  triggerRef,
  onClose,
  itemSelector = DEFAULT_MENU_ITEM_SELECTOR,
}: MenuKeyboardNavigationOptions) {
  const focusedOpenRef = useRef(false);
  const getItems = useCallback(
    () => getFocusableElements(menuRef.current, itemSelector),
    [itemSelector, menuRef],
  );

  const focusItem = useCallback(
    (target: "first" | "last" | 1 | -1) => {
      const items = getItems();
      if (items.length === 0) return;
      if (target === "first") {
        items[0]?.focus();
        return;
      }
      if (target === "last") {
        items.at(-1)?.focus();
        return;
      }

      const currentIndex = items.findIndex(
        (item) => item === document.activeElement,
      );
      const nextIndex =
        currentIndex === -1
          ? target === 1
            ? 0
            : items.length - 1
          : (currentIndex + target + items.length) % items.length;
      items[nextIndex]?.focus();
    },
    [getItems],
  );

  const closeAndRestoreFocus = useCallback(() => {
    const target = triggerRef?.current;
    onClose();
    // Sync focus handles the immediate case; the rAF retry covers triggers that
    // briefly become unfocusable (disabled, hidden, or remounted) during close.
    target?.focus();
    window.requestAnimationFrame(() => target?.focus());
  }, [onClose, triggerRef]);

  const handleMenuKeyDown = useCallback(
    (event: MenuKeyboardEvent) => {
      const menu = menuRef.current;
      const activeElement =
        document.activeElement instanceof Node ? document.activeElement : null;
      const eventTarget = event.target instanceof Node ? event.target : null;
      const eventStartedInMenu = eventTarget
        ? menu?.contains(eventTarget)
        : false;
      const focusIsInMenu = activeElement
        ? menu?.contains(activeElement)
        : false;
      if (!menu || (!eventStartedInMenu && !focusIsInMenu)) {
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        focusItem(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        focusItem(-1);
      } else if (event.key === "Home") {
        event.preventDefault();
        focusItem("first");
      } else if (event.key === "End") {
        event.preventDefault();
        focusItem("last");
      }
    },
    [focusItem, menuRef],
  );

  useEffect(() => {
    if (!open) {
      focusedOpenRef.current = false;
      return;
    }
    if (focusedOpenRef.current) return;
    focusedOpenRef.current = true;
    const frame = window.requestAnimationFrame(() => focusItem("first"));
    return () => window.cancelAnimationFrame(frame);
  }, [focusItem, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      handleMenuKeyDown(event);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [handleMenuKeyDown, open]);

  return {
    closeAndRestoreFocus,
    focusFirstItem: () => focusItem("first"),
    focusLastItem: () => focusItem("last"),
    handleMenuKeyDown,
  };
}
