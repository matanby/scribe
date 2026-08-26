import { useEffect, RefObject } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

/**
 * Keeps Tab focus inside an open modal and restores focus to whatever was focused before
 * it opened. Without this, tabbing walks out of the dialog into the note list behind it.
 */
export function useFocusTrap(containerRef: RefObject<HTMLElement>, isActive: boolean) {
  useEffect(() => {
    if (!isActive) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const container = containerRef.current;
      if (!container) return;

      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        el => el.offsetParent !== null || el === document.activeElement
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey && (active === first || !container.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      previouslyFocused?.focus?.();
    };
  }, [containerRef, isActive]);
}
