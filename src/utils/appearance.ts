export interface AppearanceSettings {
  accentColor: string;
  fontFamily: 'sans' | 'serif' | 'mono';
  fontSize: 'compact' | 'normal' | 'large' | number;
  themeMode: 'system' | 'light' | 'dark';
  smartTypography?: boolean;
  autoSortTasks?: boolean;
}

export const DEFAULT_NOTE_FONT_SIZE = 14;
export const MIN_NOTE_FONT_SIZE = 12;
export const MAX_NOTE_FONT_SIZE = 26;

export function resolveNoteFontSize(fontSize?: AppearanceSettings['fontSize']): number {
  if (typeof fontSize === 'number' && Number.isFinite(fontSize)) {
    return Math.min(MAX_NOTE_FONT_SIZE, Math.max(MIN_NOTE_FONT_SIZE, Math.round(fontSize)));
  }
  if (fontSize === 'compact') return 13;
  if (fontSize === 'large') return 16;
  return DEFAULT_NOTE_FONT_SIZE;
}

export const ACCENT_PALETTES = [
  { id: 'amber', name: 'Apple Amber', color: '#EAB308', hover: '#CA8A04' },
  { id: 'blue', name: 'Ocean Blue', color: '#3B82F6', hover: '#2563EB' },
  { id: 'green', name: 'Forest Green', color: '#10B981', hover: '#059669' },
  { id: 'orange', name: 'Warm Orange', color: '#F97316', hover: '#EA580C' },
  { id: 'purple', name: 'Royal Purple', color: '#8B5CF6', hover: '#7C3AED' },
  { id: 'rose', name: 'Rose Crimson', color: '#F43F5E', hover: '#E11D48' },
  { id: 'slate', name: 'Graphite Slate', color: '#64748B', hover: '#475569' },
];

