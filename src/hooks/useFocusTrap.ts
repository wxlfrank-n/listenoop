/**
 * Focus trap hook for modal-style overlays.
 *
 * Mounts with a panel ref; on mount it focuses the panel (or its first
 * focusable child), traps Tab / Shift+Tab inside the panel, and dismisses
 * the overlay on Escape. On unmount it restores focus to whichever element
 * was focused before the overlay opened (caller passes that element via
 * `restoreFocusRef`).
 *
 * Usage:
 *   const panelRef = useRef<HTMLDivElement>(null);
 *   useFocusTrap(panelRef, {onEscape: onClose, restoreFocusRef: lastFocusRef});
 *   return (
 *     <div className="my-overlay" onClick={onClose}>
 *       <div ref={panelRef} role="dialog" aria-modal="true" onClick={stop}>
 *         ...
 *       </div>
 *     </div>
 *   );
 */

import {useEffect, type RefObject} from 'react';

interface FocusTrapOptions {
  /** Called when the user presses Escape. */
  onEscape?: () => void;
  /**
   * Element to return focus to on unmount. Typically the trigger button.
   * Falls back to `document.activeElement` captured at mount time.
   */
  restoreFocusRef?: RefObject<HTMLElement | null>;
  /**
   * Initial focus target. If nullish, focuses the panel itself. If a
   * selector, focuses the first matching descendant. Default: the first
   * focusable child, falling back to the panel.
   */
  initialFocusSelector?: string;
}

// Selectors for elements that participate in the tab order. Mirrors the
// WHATWG "focusable" definition closely enough for the overlays we ship.
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]):not([tabindex="-1"]), ' +
  'input:not([disabled]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), ' +
  'textarea:not([disabled]):not([tabindex="-1"]), [tabindex="0"]:not([disabled])';

function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    el =>
      el.offsetWidth > 0 ||
      el.offsetHeight > 0 ||
      el.getClientRects().length > 0,
  );
}

export function useFocusTrap(
  panelRef: RefObject<HTMLDivElement | null>,
  options: FocusTrapOptions = {},
): void {
  const {onEscape, restoreFocusRef, initialFocusSelector} = options;

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    // Remember what was focused before opening so we can restore it.
    const previouslyFocused =
      (document.activeElement as HTMLElement | null) ?? null;

    // Move focus into the panel.
    const focusTarget = initialFocusSelector
      ? (panel.querySelector<HTMLElement>(initialFocusSelector) ?? panel)
      : (getFocusable(panel)[0] ?? panel);
    // `requestAnimationFrame` ensures the overlay has been painted before we
    // steal focus; otherwise some browsers discard the focus call.
    requestAnimationFrame(() => focusTarget.focus());

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onEscape?.();
        return;
      }

      if (event.key !== 'Tab') return;

      const currentPanel = panelRef.current;
      if (!currentPanel) return;

      const focusable = getFocusable(currentPanel);
      if (focusable.length === 0) {
        // Nothing inside is focusable: keep the panel itself in the tab order.
        event.preventDefault();
        currentPanel.focus();
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (event.shiftKey) {
        if (
          document.activeElement === first ||
          document.activeElement === currentPanel
        ) {
          event.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKey);

    return () => {
      document.removeEventListener('keydown', handleKey);
      const restoreTarget =
        restoreFocusRef?.current ?? previouslyFocused ?? null;
      if (restoreTarget) {
        requestAnimationFrame(() => restoreTarget.focus());
      }
    };
    // We intentionally only depend on `onEscape`; `restoreFocusRef` and
    // `initialFocusSelector` are stable refs / string literals in callers.
    // The effect should run once per mount, not on every options change.
  }, [onEscape]);
}
