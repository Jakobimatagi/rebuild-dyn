/**
 * useModalBehavior
 *
 * Shared a11y behavior for modal dialogs:
 *   - Escape closes the modal
 *   - Tab / Shift+Tab is trapped inside the modal
 *   - Focus moves into the modal on mount and back to the trigger on unmount
 *
 * Usage:
 *   const ref = useModalBehavior(onClose);
 *   return <div ref={ref} role="dialog" aria-modal="true" ... />;
 */
import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function useModalBehavior(onClose) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused =
      typeof document !== "undefined" ? document.activeElement : null;

    const focusables = () =>
      Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
        (el) => !el.hasAttribute("disabled") && el.offsetParent !== null,
      );

    // Move focus into the modal. Prefer the first focusable; otherwise make the
    // container itself focusable so screen readers announce the dialog.
    const initial = focusables()[0];
    if (initial) {
      initial.focus();
    } else {
      container.setAttribute("tabindex", "-1");
      container.focus();
    }

    const handleKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key !== "Tab") return;

      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        container.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        if (active === first || !container.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    container.addEventListener("keydown", handleKey);
    return () => {
      container.removeEventListener("keydown", handleKey);
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        previouslyFocused.focus();
      }
    };
  }, [onClose]);

  return containerRef;
}
