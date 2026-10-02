import React, { useEffect, useId, useRef, useState } from 'react';

interface PopoverProps {
  label: string;
  trigger: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  triggerClassName?: string;
}

/** A nonmodal disclosure with native Tab order, arrow navigation, and Escape dismissal. */
export const Popover: React.FC<PopoverProps> = ({ label, trigger, children, align = 'left', triggerClassName = '' }) => {
  const [open, setOpen] = useState(false);
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const first = panelRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])');
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
        onClick={() => setOpen(prev => !prev)} className={triggerClassName}>
        {trigger}
      </button>
      {open && (
        <div ref={panelRef} id={id} role="dialog" aria-label={label} tabIndex={-1}
          className={`absolute top-full mt-2 w-56 max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto p-1.5 rounded-lg bg-[var(--editor-bg)] border border-[var(--border-color)] shadow-lg z-50 ${align === 'center' ? 'left-1/2 -translate-x-1/2' : align === 'right' ? 'right-0' : 'left-0'}`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
};
