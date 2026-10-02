import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Palette, Type, Sun, Moon, Laptop } from 'lucide-react';
import { useFocusTrap } from '../utils/useFocusTrap';

import { AppearanceSettings, ACCENT_PALETTES } from '../utils/appearance';
export type { AppearanceSettings } from '../utils/appearance';
export { ACCENT_PALETTES } from '../utils/appearance';

interface AppearanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppearanceSettings;
  onUpdateSettings: (newSettings: Partial<AppearanceSettings>) => void;
}

export const AppearanceModal: React.FC<AppearanceModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const modalContent = (
    <div 
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-md animate-in fade-in duration-150 p-4"
    >
      <div 
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white/95 dark:bg-[#202024]/95 backdrop-blur-2xl border border-[var(--border-color)] shadow-2xl rounded-2xl overflow-hidden flex flex-col select-none animate-in zoom-in-95 duration-100"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-2">
            <Palette size={18} className="text-[var(--accent-color)]" />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Appearance & Typography</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-lg text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Settings Body */}
        <div className="p-5 space-y-5">
          {/* Accent Colors */}
          <div>
            <label className="text-xs font-semibold text-[var(--text-primary)] block mb-2.5">
              Accent Color
            </label>
            <div className="grid grid-cols-6 gap-2">
              {ACCENT_PALETTES.map(p => {
                const isSelected = settings.accentColor === p.color;
                return (
                  <button
                    key={p.id}
                    onClick={() => onUpdateSettings({ accentColor: p.color })}
                    className={`h-10 rounded-xl flex items-center justify-center transition-all ${
                      isSelected ? 'ring-2 ring-offset-2 ring-[var(--accent-color)] dark:ring-offset-[#202024] scale-105 shadow-sm' : 'hover:scale-105 opacity-90'
                    }`}
                    style={{ backgroundColor: p.color }}
                    title={p.name}
                  >
                    {isSelected && <Check size={16} className="text-white drop-shadow-sm stroke-[3]" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Typography Mode */}
          <div>
            <label className="text-xs font-semibold text-[var(--text-primary)] block mb-2.5">
              Typography Style
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => onUpdateSettings({ fontFamily: 'sans' })}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                  settings.fontFamily === 'sans'
                    ? 'border-[var(--accent-color)] bg-[var(--card-active)] text-[var(--text-primary)] font-semibold shadow-xs'
                    : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <span className="text-sm font-sans font-medium mb-1">San Francisco</span>
                <span className="text-[10px] opacity-60 font-sans">Default Clean</span>
              </button>

              <button
                onClick={() => onUpdateSettings({ fontFamily: 'serif' })}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                  settings.fontFamily === 'serif'
                    ? 'border-[var(--accent-color)] bg-[var(--card-active)] text-[var(--text-primary)] font-semibold shadow-xs'
                    : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <span className="text-sm font-serif font-medium mb-1">New York</span>
                <span className="text-[10px] opacity-60 font-serif">Editorial Serif</span>
              </button>

              <button
                onClick={() => onUpdateSettings({ fontFamily: 'mono' })}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                  settings.fontFamily === 'mono'
                    ? 'border-[var(--accent-color)] bg-[var(--card-active)] text-[var(--text-primary)] font-semibold shadow-xs'
                    : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <span className="text-sm font-mono font-medium mb-1">SF Mono</span>
                <span className="text-[10px] opacity-60 font-mono">Technical</span>
              </button>
            </div>
          </div>

          {/* Theme Mode */}
          <div>
            <label className="text-xs font-semibold text-[var(--text-primary)] block mb-2.5">
              Theme Mode
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => onUpdateSettings({ themeMode: 'system' })}
                className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs transition-all ${
                  settings.themeMode === 'system'
                    ? 'border-[var(--accent-color)] bg-[var(--card-active)] text-[var(--text-primary)] font-medium'
                    : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <Laptop size={14} />
                <span>System</span>
              </button>

              <button
                onClick={() => onUpdateSettings({ themeMode: 'light' })}
                className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs transition-all ${
                  settings.themeMode === 'light'
                    ? 'border-[var(--accent-color)] bg-[var(--card-active)] text-[var(--text-primary)] font-medium'
                    : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <Sun size={14} />
                <span>Light</span>
              </button>

              <button
                onClick={() => onUpdateSettings({ themeMode: 'dark' })}
                className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs transition-all ${
                  settings.themeMode === 'dark'
                    ? 'border-[var(--accent-color)] bg-[var(--card-active)] text-[var(--text-primary)] font-medium'
                    : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <Moon size={14} />
                <span>Dark</span>
              </button>
            </div>
          </div>

          {/* Smart Typography Replacements Toggle */}
          <div className="pt-3 border-t border-[var(--border-color)] flex items-center justify-between">
            <div className="pr-4">
              <div className="text-xs font-semibold text-[var(--text-primary)]">
                Smart Typography
              </div>
              <div className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-snug">
                Auto-convert quotes (“ ”), dashes (—), arrows (→), and fractions (½)
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={settings.smartTypography !== false}
              onClick={() => onUpdateSettings({ smartTypography: settings.smartTypography === false ? true : false })}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                settings.smartTypography !== false ? 'bg-[var(--accent-color)]' : 'bg-black/20 dark:bg-white/20'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                  settings.smartTypography !== false ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Auto-Sort Checklists Toggle */}
          <div className="pt-3 border-t border-[var(--border-color)] flex items-center justify-between">
            <div className="pr-4">
              <div className="text-xs font-semibold text-[var(--text-primary)]">
                Auto-Sort Checklists
              </div>
              <div className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-snug">
                Automatically slide checked items to the bottom and unchecked items to the top
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={settings.autoSortTasks !== false}
              onClick={() => onUpdateSettings({ autoSortTasks: settings.autoSortTasks === false ? true : false })}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                settings.autoSortTasks !== false ? 'bg-[var(--accent-color)]' : 'bg-black/20 dark:bg-white/20'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                  settings.autoSortTasks !== false ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--border-color)] bg-black/5 dark:bg-white/5 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-[var(--accent-color)] text-white text-xs font-semibold hover:opacity-90 transition-opacity"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
