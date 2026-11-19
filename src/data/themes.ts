import { ModuleAccent, PaletteId, ThemePalette } from '../types/synth';

export const THEME_PALETTES: ThemePalette[] = [
  {
    id: 'warehouse-obsidian',
    name: 'Warehouse Obsidian',
    subtitle: 'Default · Charcoal & Studio Gold / Mint / Teal',
    isLight: false,
    colors: {
      canvas: '#0B0C10',
      surface: '#111318',
      panel: '#151820',
      module: '#181C24',
      moduleHover: '#1E232D',
      border: '#242936',
      borderStrong: '#343B4D',
      gridDot: '#262B38',
      text: '#ECEEF2',
      textMuted: '#8D95A5',
      textDim: '#596070',
      primary: '#F5A623',
      primaryText: '#0B0C10',
      secondary: '#2AD488',
      tertiary: '#42A5A5',
      quaternary: '#9D78F5',
      alert: '#F43F5E',
    },
  },
  {
    id: 'buchla-west',
    name: 'West Coast Panel',
    subtitle: 'Warm Slate · Tangerine / Cyan / Ochre',
    isLight: false,
    colors: {
      canvas: '#100F12',
      surface: '#161519',
      panel: '#1B191F',
      module: '#201E25',
      moduleHover: '#27242D',
      border: '#2E2B36',
      borderStrong: '#403B4A',
      gridDot: '#302C38',
      text: '#F2EFE9',
      textMuted: '#9E9893',
      textDim: '#65605C',
      primary: '#FF6B35',
      primaryText: '#100F12',
      secondary: '#4ECDC4',
      tertiary: '#F7C948',
      quaternary: '#A78BFA',
      alert: '#EF4444',
    },
  },
  {
    id: 'berlin-dub',
    name: 'Berlin Dub Tape',
    subtitle: 'Deep Petrol · Ice Cyan / Phosphor / Tape Amber',
    isLight: false,
    colors: {
      canvas: '#081014',
      surface: '#0D171D',
      panel: '#111E26',
      module: '#15242E',
      moduleHover: '#1B2D39',
      border: '#203340',
      borderStrong: '#2D4657',
      gridDot: '#213542',
      text: '#E6F1F5',
      textMuted: '#829BA8',
      textDim: '#4E6775',
      primary: '#38BDF8',
      primaryText: '#081014',
      secondary: '#34D399',
      tertiary: '#FBBF24',
      quaternary: '#C084FC',
      alert: '#FB7185',
    },
  },
  {
    id: 'acid-303',
    name: 'Acid 303 Graphite',
    subtitle: 'Anodized Aluminum · Acid Lime / Amber / Sky',
    isLight: false,
    colors: {
      canvas: '#121316',
      surface: '#181A1E',
      panel: '#1D2026',
      module: '#22252C',
      moduleHover: '#292D36',
      border: '#313540',
      borderStrong: '#444A59',
      gridDot: '#333845',
      text: '#F1F3F5',
      textMuted: '#9399A6',
      textDim: '#5E6472',
      primary: '#C8F902',
      primaryText: '#121316',
      secondary: '#F59E0B',
      tertiary: '#38BDF8',
      quaternary: '#EC4899',
      alert: '#F43F5E',
    },
  },
  {
    id: 'crimson-modular',
    name: 'Crimson Modular',
    subtitle: 'Velvet Dark · Ruby / Gold / Verdigris',
    isLight: false,
    colors: {
      canvas: '#0C0A0D',
      surface: '#131015',
      panel: '#18141B',
      module: '#1E1821',
      moduleHover: '#261F2A',
      border: '#2E2533',
      borderStrong: '#42354A',
      gridDot: '#2E2534',
      text: '#F3EEF5',
      textMuted: '#9E90A6',
      textDim: '#64586B',
      primary: '#F43F5E',
      primaryText: '#FFFFFF',
      secondary: '#F5A623',
      tertiary: '#2DD4BF',
      quaternary: '#A855F7',
      alert: '#FB7185',
    },
  },
  {
    id: 'nordic-daylight',
    name: 'Nordic Daylight',
    subtitle: 'Bright Stage · Brushed Silver / Signal Orange',
    isLight: true,
    colors: {
      canvas: '#E7E9EE',
      surface: '#F2F3F6',
      panel: '#F8F9FB',
      module: '#FFFFFF',
      moduleHover: '#F4F5F8',
      border: '#D1D5DF',
      borderStrong: '#B4BAC8',
      gridDot: '#C6CBD6',
      text: '#13161F',
      textMuted: '#575F70',
      textDim: '#8890A0',
      primary: '#E05A00',
      primaryText: '#FFFFFF',
      secondary: '#0D9458',
      tertiary: '#0284C7',
      quaternary: '#7C3AED',
      alert: '#DC2626',
    },
  },
];

export const DEFAULT_PALETTE_ID: PaletteId = 'warehouse-obsidian';

export function getPaletteById(id: PaletteId): ThemePalette {
  return THEME_PALETTES.find((p) => p.id === id) ?? THEME_PALETTES[0];
}

export function resolveAccentHex(accent: ModuleAccent, palette: ThemePalette): string {
  switch (accent) {
    case 'amber':
      return palette.colors.primary;
    case 'emerald':
      return palette.colors.secondary;
    case 'sky':
      return palette.colors.tertiary;
    case 'violet':
      return palette.colors.quaternary;
    case 'rose':
      return palette.colors.alert;
    case 'slate':
    default:
      return palette.colors.textMuted;
  }
}

export function applyPaletteCssVars(palette: ThemePalette): void {
  const root = document.documentElement;
  if (palette.isLight) {
    root.classList.remove('dark');
  } else {
    root.classList.add('dark');
  }
  const c = palette.colors;
  root.style.setProperty('--pg-canvas', c.canvas);
  root.style.setProperty('--pg-surface', c.surface);
  root.style.setProperty('--pg-panel', c.panel);
  root.style.setProperty('--pg-module', c.module);
  root.style.setProperty('--pg-module-hover', c.moduleHover);
  root.style.setProperty('--pg-border', c.border);
  root.style.setProperty('--pg-border-strong', c.borderStrong);
  root.style.setProperty('--pg-grid-dot', c.gridDot);
  root.style.setProperty('--pg-text', c.text);
  root.style.setProperty('--pg-text-muted', c.textMuted);
  root.style.setProperty('--pg-text-dim', c.textDim);
  root.style.setProperty('--pg-primary', c.primary);
  root.style.setProperty('--pg-primary-text', c.primaryText);
  root.style.setProperty('--pg-secondary', c.secondary);
  root.style.setProperty('--pg-tertiary', c.tertiary);
  root.style.setProperty('--pg-quaternary', c.quaternary);
  root.style.setProperty('--pg-alert', c.alert);
}
