import React, { useEffect, useLayoutEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface PopoverProps {
  label: string;
  trigger: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  triggerClassName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** One anchored disclosure at a time, with predictable keyboard and focus behavior. */
export const Popover: React.FC<PopoverProps> = ({ label, trigger, children, align = 'left', triggerClassName = '', open: controlledOpen, onOpenChange }) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const openRef = useRef(open);
  openRef.current = open;
  const changeRef = useRef(onOpenChange);
  changeRef.current = onOpenChange;
  const setOpen = (next: boolean) => { setInternalOpen(next); changeRef.current?.(next); };
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const contains = (target: EventTarget | null) => target instanceof Node && (!!buttonRef.current?.contains(target) || !!panelRef.current?.contains(target));
  const close = () => { setOpen(false); buttonRef.current?.focus({ preventScroll: true }); };
  const place = () => {
    if (!openRef.current || !buttonRef.current || !panelRef.current) return;
    const anchor = buttonRef.current.getBoundingClientRect();
    const panel = panelRef.current.getBoundingClientRect();
    const x = align === 'right' ? anchor.right - panel.width : align === 'center' ? anchor.left + (anchor.width - panel.width) / 2 : anchor.left;
    const below = anchor.bottom + 8;
    const top = below + panel.height <= window.innerHeight - 12 ? below : Math.max(12, anchor.top - panel.height - 8);
    const next = { left: Math.max(12, Math.min(x, window.innerWidth - panel.width - 12)), top };
    setPosition(previous => previous?.left === next.left && previous?.top === next.top ? previous : next);
  };
  useLayoutEffect(place);
  useEffect(() => {
    if (!open) { setPosition(null); return; }
    // Opening another disclosure closes this one without stealing its focus.
    window.dispatchEvent(new CustomEvent('scribe:popover-open', { detail: id }));
    const otherOpened = (event: Event) => { if ((event as CustomEvent<string>).detail !== id) setOpen(false); };
    const dismiss = (event: PointerEvent) => { if (!contains(event.target)) setOpen(false); };
    const focusOutside = (event: FocusEvent) => { if (!contains(event.target)) setOpen(false); };
    window.addEventListener('scribe:popover-open', otherOpened);
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('focusin', focusOutside);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    const observer = new ResizeObserver(place);
    if (panelRef.current) observer.observe(panelRef.current);
    return () => {
      window.removeEventListener('scribe:popover-open', otherOpened);
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('focusin', focusOutside);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      observer.disconnect();
    };
  }, [open, id, align]);
  const positioned = position !== null;
  useEffect(() => {
    if (!open || !positioned) return;
    const first = panelRef.current?.querySelector<HTMLElement>('[data-autofocus]') || panelRef.current?.querySelector<HTMLElement>('input:not([disabled]), button:not([disabled])');
    (first || panelRef.current)?.focus({ preventScroll: true });
  }, [open, positioned]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.target === buttonRef.current && event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); return; }
    if (!open || !panelRef.current?.contains(event.target as Node)) return;
    if ((event.target as HTMLElement).matches('input, textarea, select')) return;
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const buttons = Array.from(panelRef.current.querySelectorAll<HTMLButtonElement>('button:not([disabled])')).filter(button => button.tabIndex !== -1);
    if (!buttons.length) return;
    event.preventDefault(); event.stopPropagation();
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus();
  };

  return <div className="relative" onKeyDown={handleKeyDown} onBlur={event => { if (event.relatedTarget && !contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={buttonRef} type="button" aria-label={label} title={label} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => setOpen(!open)} className={triggerClassName}>{trigger}</button>
    {open && createPortal(<div ref={panelRef} id={id} role="dialog" aria-label={label} tabIndex={-1}
      style={{ position: 'fixed', left: position?.left ?? 12, top: position?.top ?? 54, visibility: position ? 'visible' : 'hidden' }}
      className="scribe-popover no-print">{children(close)}</div>, document.body)}
  </div>;
};
