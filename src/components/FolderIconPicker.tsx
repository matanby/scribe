import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import EmojiPicker, { Categories, EmojiStyle, Theme } from 'emoji-picker-react';
import { ACCENT_PALETTES } from '../utils/appearance';
import {
  Activity, AlarmClock, Apple, Archive, Atom, Banknote, Bath, Bed, Bell, BellRing, Bike, Book,
  Bookmark, Box, Briefcase, Brush, Building2, Bug, Bus, Cake, Calculator, CalendarDays, Camera,
  Car, ChartNoAxesCombined, CircleHelp, ClipboardList, Cloud, Code2, Coffee, Compass, CookingPot,
  Cookie, CreditCard, Dog, DoorOpen, Dumbbell, File, FileText, Film, Fish, Flag, Flower,
  FlaskConical, Folder, Footprints, Gamepad2, Gift, Globe, GraduationCap, Handshake, Headphones,
  Heart, Home, Hospital, Image, Key, Laptop, Leaf, Lightbulb, LockKeyhole, Mail, Map, MapPin,
  MessageCircle, Monitor, MountainSnow, Music, Newspaper, Notebook, Package, Palette, PawPrint,
  Pencil, Phone, Plane, Printer, Receipt, Rocket, ShieldCheck, Ship, ShoppingBag, Sparkles, Star,
  Stethoscope, Sun, Tag, Tent, Train, TreePine, Tv, Users, Utensils, Video, Wallet, Waves, Wifi,
  Wine, Wrench, type LucideIcon
} from 'lucide-react';

export interface FolderAppearance {
  icon?: string;
  color?: string;
  emoji?: string;
}

const ICONS: { name: string; component: LucideIcon }[] = [
  { name: 'Folder', component: Folder }, { name: 'Book', component: Book },
  { name: 'Briefcase', component: Briefcase }, { name: 'Calendar', component: CalendarDays },
  { name: 'Camera', component: Camera }, { name: 'Code', component: Code2 },
  { name: 'Compass', component: Compass }, { name: 'Document', component: FileText },
  { name: 'Education', component: GraduationCap }, { name: 'Heart', component: Heart },
  { name: 'Home', component: Home }, { name: 'Ideas', component: Lightbulb },
  { name: 'Music', component: Music }, { name: 'Palette', component: Palette },
  { name: 'Travel', component: Plane }, { name: 'Rocket', component: Rocket },
  { name: 'Shopping', component: ShoppingBag }, { name: 'Sparkles', component: Sparkles },
  { name: 'Star', component: Star }, { name: 'Tag', component: Tag },
  { name: 'Nature', component: TreePine }, { name: 'People', component: Users },
  { name: 'Tools', component: Wrench }, { name: 'Archive', component: Archive },
  { name: 'Notifications', component: Bell }, { name: 'Cycling', component: Bike },
  { name: 'Bookmark', component: Bookmark }, { name: 'Box', component: Box },
  { name: 'Building', component: Building2 }, { name: 'Bus', component: Bus },
  { name: 'Celebration', component: Cake }, { name: 'Calculator', component: Calculator },
  { name: 'Cloud', component: Cloud }, { name: 'Coffee', component: Coffee },
  { name: 'Payments', component: CreditCard }, { name: 'Fitness', component: Dumbbell },
  { name: 'File', component: File }, { name: 'Film', component: Film },
  { name: 'Flag', component: Flag }, { name: 'Science', component: FlaskConical },
  { name: 'Gaming', component: Gamepad2 }, { name: 'Gift', component: Gift },
  { name: 'Globe', component: Globe }, { name: 'Headphones', component: Headphones },
  { name: 'Key', component: Key }, { name: 'Laptop', component: Laptop },
  { name: 'Security', component: LockKeyhole }, { name: 'Mail', component: Mail },
  { name: 'Map', component: Map }, { name: 'Phone', component: Phone },
  { name: 'Activity', component: Activity }, { name: 'Alarm', component: AlarmClock },
  { name: 'Apple', component: Apple }, { name: 'Atoms', component: Atom },
  { name: 'Banknotes', component: Banknote }, { name: 'Bath', component: Bath },
  { name: 'Bed', component: Bed }, { name: 'Ringing Bell', component: BellRing },
  { name: 'Art', component: Brush }, { name: 'Bugs', component: Bug },
  { name: 'Car', component: Car }, { name: 'Analytics', component: ChartNoAxesCombined },
  { name: 'Help', component: CircleHelp }, { name: 'Tasks', component: ClipboardList },
  { name: 'Cooking', component: CookingPot }, { name: 'Dog', component: Dog },
  { name: 'Doors', component: DoorOpen }, { name: 'Flowers', component: Flower },
  { name: 'Handshake', component: Handshake }, { name: 'Hospital', component: Hospital },
  { name: 'Images', component: Image }, { name: 'Location', component: MapPin },
  { name: 'Monitor', component: Monitor }, { name: 'Mountains', component: MountainSnow },
  { name: 'News', component: Newspaper }, { name: 'Notebook', component: Notebook },
  { name: 'Package', component: Package }, { name: 'Paw', component: PawPrint },
  { name: 'Writing', component: Pencil }, { name: 'Printing', component: Printer },
  { name: 'Receipts', component: Receipt }, { name: 'Verified', component: ShieldCheck },
  { name: 'Ship', component: Ship }, { name: 'Medical', component: Stethoscope },
  { name: 'Cookies', component: Cookie }, { name: 'Fish', component: Fish },
  { name: 'Hiking', component: Footprints }, { name: 'Leaves', component: Leaf },
  { name: 'Messages', component: MessageCircle }, { name: 'Food', component: Utensils }
];
const POPULAR_EMOJIS = [
  '1f4c1', '1f4c2', '1f5c2-fe0f', '1f4c4', '1f4dd', '1f4da', '1f4d6', '1f4cc', '1f516', '1f3f7-fe0f',
  '1f4bc', '1f4bb', '1f4ca', '1f4c6', '1f5d3-fe0f', '2705', '1f3af', '1f4a1', '1f6e0-fe0f', '1f3a8',
  '1f680', '1f3e0', '1f5fa-fe0f', '1f30d', '2708-fe0f', '1f9f3', '1f331', '1f333', '1f4f7', '2615'
];
interface Props {
  value?: FolderAppearance;
  anchor: { x: number; y: number };
  onChange: (value: FolderAppearance) => void;
  onClose: () => void;
}

export const FolderIconPicker: React.FC<Props> = ({ value, anchor, onChange, onClose }) => {
  const [tab, setTab] = useState<'emoji' | 'icons'>('icons');
  const [query, setQuery] = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);
  const filteredIcons = useMemo(() => ICONS.filter(icon => icon.name.toLowerCase().includes(query.toLowerCase())), [query]);
  const choose = (next: FolderAppearance) => { onChange(next); onClose(); };
  const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || '#EAB308';
  const effectiveColor = value?.color || accentColor;

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [onClose]);

  const pickerWidth = tab === 'emoji' ? 360 : 278;
  const left = Math.max(8, Math.min(anchor.x + 8, window.innerWidth - pickerWidth - 8));
  const top = Math.max(8, Math.min(anchor.y + 8, window.innerHeight - (tab === 'emoji' ? 490 : 430)));
  const isDark = !!document.querySelector('.scribe-app.dark');
  return createPortal(<div ref={pickerRef} role="dialog" aria-label="Folder icon and color" onClick={e => e.stopPropagation()}
    style={{ left, top, width: pickerWidth }} className="fixed z-[9999] max-h-[calc(100vh-16px)] overflow-y-auto rounded-xl border border-[var(--border-color)] bg-[var(--editor-bg)] shadow-2xl p-3 text-[var(--text-primary)]" dir="ltr">
    <div className="flex items-center justify-between mb-2">
      <div className="flex gap-1" role="tablist" aria-label="Icon type">
        {(['emoji', 'icons'] as const).map(item => <button key={item} role="tab" aria-selected={tab === item} onClick={() => setTab(item)}
          className={`px-2.5 py-1 rounded-full text-xs capitalize ${tab === item ? 'bg-black/10 dark:bg-white/10' : 'text-[var(--text-secondary)]'}`}>{item === 'emoji' ? 'Emoji' : 'Icons'}</button>)}
      </div>
      <button onClick={() => choose({})} className="text-xs px-2.5 py-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10">Clear</button>
    </div>
    {tab === 'icons' ? <>
      <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search icons" aria-label="Search icons"
        className="w-full h-8 mb-2 px-2.5 rounded-lg border border-[var(--border-color)] bg-transparent text-xs outline-none focus:border-[var(--accent-color)]" />
      <div className="grid grid-cols-7 gap-1 mb-2.5" aria-label="Icon color">
        {ACCENT_PALETTES.map(({ id, name, color }) => <button key={id} aria-label={`${name} icon color`} aria-pressed={value?.color?.toLowerCase() === color.toLowerCase()} onClick={() => onChange({ ...value, color: value?.color?.toLowerCase() === color.toLowerCase() ? undefined : color, emoji: undefined })}
          className="w-full h-8 rounded-lg flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10" title={`${name} icon color`}>
          <span className={`w-6 h-6 rounded-full ring-offset-2 ring-offset-[var(--editor-bg)] ${value?.color?.toLowerCase() === color.toLowerCase() ? 'ring-2 ring-[var(--accent-color)]' : ''}`} style={{ backgroundColor: color }} />
        </button>)}
      </div>
      <div className="grid grid-cols-7 gap-1 max-h-72 overflow-y-auto">
        {filteredIcons.map(({ name, component: Icon }) => <button key={name} title={name} aria-label={name} aria-pressed={value?.icon === name && !value?.emoji}
          onClick={() => choose({ icon: name, ...(value?.color ? { color: value.color } : {}) })}
          className="w-full h-9 rounded-lg flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 aria-pressed:bg-black/10 dark:aria-pressed:bg-white/10">
          <Icon size={18} style={{ color: effectiveColor }} />
        </button>)}
      </div>
    </> : <div className="-mx-3 -mb-3 overflow-hidden rounded-b-xl">
      <EmojiPicker
        width="100%"
        height={420}
        columns={10}
        theme={isDark ? Theme.DARK : Theme.LIGHT}
        emojiStyle={EmojiStyle.NATIVE}
        lazyLoadEmojis
        searchDisabled
        skinTonesDisabled
        previewConfig={{ showPreview: false }}
        suggestedEmojis={POPULAR_EMOJIS}
        categories={[{ category: Categories.SUGGESTED, name: 'Popular' }, Categories.SMILEYS_PEOPLE, Categories.ANIMALS_NATURE, Categories.FOOD_DRINK, Categories.TRAVEL_PLACES, Categories.ACTIVITIES, Categories.OBJECTS, Categories.SYMBOLS, Categories.FLAGS]}
        searchPlaceholder="Search all emojis"
        onEmojiClick={({ emoji }) => choose({ emoji })}
        className="folder-emoji-picker"
        style={{
          '--epr-bg-color': 'var(--editor-bg)',
          '--epr-text-color': 'var(--text-primary)',
          '--epr-picker-border-color': 'var(--border-color)',
          '--epr-highlight-color': 'var(--accent-color)',
          '--epr-search-input-bg-color': 'var(--editor-bg)',
          '--epr-category-label-bg-color': 'var(--editor-bg)',
          '--epr-category-label-text-color': 'var(--text-secondary)',
          '--epr-emoji-size': '18px',
          '--epr-emoji-fullsize': '28px',
          '--epr-category-navigation-button-size': '18px',
          '--epr-category-label-height': '28px',
        } as React.CSSProperties}
      />
    </div>}
  </div>, document.body);
};

export const folderIconComponent = (name?: string): LucideIcon => ICONS.find(icon => icon.name === name)?.component || Folder;
