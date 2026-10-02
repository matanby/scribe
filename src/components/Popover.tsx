import React, { useEffect, useLayoutEffect, useId, useRef, useState } from 'react';

interface PopoverProps {
  label: string;
  trigger: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  triggerClassName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** A nonmodal disclosure with native Tab order, arrow navigation, and Escape dismissal. */
export const Popover: React.FC<PopoverProps> = ({ label, trigger, children, align = 'left', triggerClassName = '', open: controlledOpen, onOpenChange }) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean) => { setInternalOpen(next); onOpenChange?.(next); };
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const place = () => {
    if (!open || !buttonRef.current || !panelRef.current) return;
    const anchor = buttonRef.current.getBoundingClientRect();
    const panel = panelRef.current.getBoundingClientRect();
    const x = align === 'right' ? anchor.right - panel.width : align === 'center' ? anchor.left + (anchor.width - panel.width) / 2 : anchor.left;
    const below = anchor.bottom + 8;
    const y = below + panel.height <= window.innerHeight - 12 ? below : Math.max(12, anchor.top - panel.height - 8);
    const next = { left: Math.max(12, Math.min(x, window.innerWidth - panel.width - 12)), top: y };
    setPosition(previous => previous?.left === next.left && previous?.top === next.top ? previous : next);
  };
  useLayoutEffect(place);
  useEffect(() => {
    if (!open) { setPosition(null); return; }
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    const observer = new ResizeObserver(place);
    if (panelRef.current) observer.observe(panelRef.current);
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); observer.disconnect(); };
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const first = panelRef.current?.querySelector<HTMLElement>('[data-autofocus]') || panelRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])');
    (first || panelRef.current)?.focus();
    const dismiss = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', dismiss);
    return () => document.removeEventListener('mousedown', dismiss);
  }, [open]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
      return;
    }
    if (event.target === buttonRef.current && event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      return;
    }
    if (!open || !panelRef.current?.contains(event.target as Node)) return;
    if ((event.target as HTMLElement).matches('input, textarea, select')) return;
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const buttons = Array.from(panelRef.current.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
    if (!buttons.length) return;
    event.preventDefault();
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus();
  };

  return (
    <div ref={rootRef} className="relative" onKeyDown={handleKeyDown} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
    }}>
      <button ref={buttonRef} type="button" aria-label={label} title={label}
        aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)} className={triggerClassName}>
        {trigger}
      </button>
      {open && (
        <div ref={panelRef} id={id} role="dialog" aria-label={label} tabIndex={-1}
          style={position ? { position: 'fixed', left: position.left, top: position.top, right: 'auto', transform: 'none', marginTop: 0 } : undefined}
          className={`absolute top-full mt-2 w-56 max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto p-1.5 rounded-lg bg-[var(--editor-bg)] border border-[var(--border-color)] shadow-lg z-50 ${align === 'center' ? 'left-1/2 -translate-x-1/2' : align === 'right' ? 'right-0' : 'left-0'}`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
};
