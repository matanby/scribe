export interface AppearanceSettings {
  accentColor: string;
  fontFamily: 'sans' | 'serif' | 'mono';
  fontSize: 'compact' | 'normal' | 'large';
  themeMode: 'system' | 'light' | 'dark';
  smartTypography?: boolean;
  autoSortTasks?: boolean;
}

export const ACCENT_PALETTES = [
  { id: 'amber', name: 'Apple Amber', color: '#EAB308', hover: '#CA8A04' },
  { id: 'blue', name: 'Ocean Blue', color: '#3B82F6', hover: '#2563EB' },
  { id: 'green', name: 'Forest Green', color: '#10B981', hover: '#059669' },
  { id: 'purple', name: 'Royal Purple', color: '#8B5CF6', hover: '#7C3AED' },
  { id: 'rose', name: 'Rose Crimson', color: '#F43F5E', hover: '#E11D48' },
  { id: 'slate', name: 'Graphite Slate', color: '#64748B', hover: '#475569' },
];

