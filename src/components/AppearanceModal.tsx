import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Palette, Type, Sun, Moon, Laptop } from 'lucide-react';

export interface AppearanceSettings {
  accentColor: string;
  fontFamily: 'sans' | 'serif' | 'mono';
  fontSize: 'compact' | 'normal' | 'large';
  themeMode: 'system' | 'light' | 'dark';
}

export const ACCENT_PALETTES = [
  { id: 'amber', name: 'Apple Amber', color: '#EAB308', hover: '#CA8A04' },
  { id: 'blue', name: 'Ocean Blue', color: '#3B82F6', hover: '#2563EB' },
  { id: 'green', name: 'Forest Green', color: '#10B981', hover: '#059669' },
  { id: 'purple', name: 'Royal Purple', color: '#8B5CF6', hover: '#7C3AED' },
  { id: 'rose', name: 'Rose Crimson', color: '#F43F5E', hover: '#E11D48' },
  { id: 'slate', name: 'Graphite Slate', color: '#64748B', hover: '#475569' },
];

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
