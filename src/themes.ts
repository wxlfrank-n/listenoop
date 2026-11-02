/**
 * Theme definitions.
 *
 * A "theme" is the full surface/text/border palette (light vs dark looks) plus
 * the accent color tuned for that palette. Together they drive the CSS custom
 * properties consumed by App.css. Each theme ships its own accent: on dark
 * surfaces the accent is lifted brighter for glow/contrast, on light surfaces
 * it is deepened so interactive elements stay readable.
 */

export type ThemeId =
  | 'system'
  | 'dark'
  | 'light'
  | 'midnight'
  | 'paper'
  | 'rose'
  | 'nova'
  | 'qinghua'
  | 'yingluo'
  | 'norge';

/** Theme ids with a static palette (`system` follows the OS instead). */
export type StaticThemeId = Exclude<ThemeId, 'system'>;

export interface Theme {
  label: string;
  /** Hint for native controls (scrollbars, form widgets). */
  colorScheme: 'light' | 'dark';
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  bgHover: string;
  bgPanel: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  danger: string;
  /** Waveform canvas background (vertical gradient endpoints). */
  waveformBgTop: string;
  waveformBgMid: string;
  /** Unplayed waveform bar color. */
  waveformBar: string;
  /** Silent (sub-peak) waveform bar color. */
  waveformBarSilent: string;
  /** Clip label badge background (translucent). */
  clipLabelBg: string;
  /** Clip label badge text. */
  clipLabelText: string;
  /** Clip label badge border. */
  clipLabelBorder: string;
  /** Accent color tuned for this theme. */
  accent: string;
  /** Foreground shared by solid accent and accentDim controls. */
  onAccent: string;
  /** Slightly deeper/muted accent for borders and pressed states. */
  accentDim: string;
  /** Accent as "r, g, b" for rgba() tints. */
  accentRgb: string;
  /** accentDim as "r, g, b" for rgba() tints. */
  accentDimRgb: string;
  /** Clip swipe hint icon color (pack/unpack affordance on the active clip). */
  clipSwipe: string;
  /** Waveform bar color for the played portion. */
  waveformBarPlayed: string;
}

export const THEMES: Record<StaticThemeId, Theme> = {
  dark: {
    label: 'Slate',
    colorScheme: 'dark',
    onAccent: '#08111f',
    bgPrimary: '#121417',
    bgSecondary: '#1a1d22',
    bgTertiary: '#22262c',
    bgHover: '#2b3038',
    bgPanel: '#16191e',
    textPrimary: '#e7eaee',
    textSecondary: '#9aa3ad',
    textTertiary: '#929daa',
    border: '#2b3038',
    danger: '#ef5350',
    waveformBgTop: '#23272e',
    waveformBgMid: '#1c2026',
    waveformBar: '#5a6b8a',
    waveformBarSilent: '#434a53',
    waveformBarPlayed: '#58a6ff',
    clipLabelBg: 'rgba(22, 25, 30, 0.72)',
    clipLabelText: '#e7eaee',
    clipLabelBorder: 'rgba(255, 255, 255, 0.16)',
    accent: '#58a6ff',
    accentDim: '#388bfd',
    accentRgb: '88, 166, 255',
    accentDimRgb: '56, 139, 253',
    clipSwipe: '#58a6ff',
  },
  light: {
    label: 'Mist',
    colorScheme: 'light',
    onAccent: '#ffffff',
    bgPrimary: '#f3f5f7',
    bgSecondary: '#ffffff',
    bgTertiary: '#ebedf0',
    bgHover: '#e0e3e8',
    bgPanel: '#f8f9fa',
    textPrimary: '#171c21',
    textSecondary: '#5a6370',
    textTertiary: '#606c7c',
    border: '#d6dbe2',
    danger: '#d64545',
    waveformBgTop: '#e7eaee',
    waveformBgMid: '#dbe0e6',
    waveformBar: '#8a94b8',
    waveformBarSilent: '#b2bac2',
    waveformBarPlayed: '#246bd1',
    clipLabelBg: 'rgba(255, 255, 255, 0.72)',
    clipLabelText: '#171c21',
    clipLabelBorder: 'rgba(0, 0, 0, 0.10)',
    accent: '#246bd1',
    accentDim: '#1c64d6',
    accentRgb: '36, 107, 209',
    accentDimRgb: '28, 100, 214',
    clipSwipe: '#1c64d6',
  },
  midnight: {
    label: 'Midnight',
    colorScheme: 'dark',
    onAccent: '#08111f',
    bgPrimary: '#101b2d',
    bgSecondary: '#16243a',
    bgTertiary: '#1d2e47',
    bgHover: '#263b58',
    bgPanel: '#132036',
    textPrimary: '#e6edf7',
    textSecondary: '#b1c0d5',
    textTertiary: '#95a7c0',
    border: '#30435e',
    danger: '#ff6b6b',
    waveformBgTop: '#1b2d46',
    waveformBgMid: '#16253b',
    waveformBar: '#6f89ad',
    waveformBarSilent: '#3d526f',
    waveformBarPlayed: '#7dd3dd',
    clipLabelBg: 'rgba(19, 32, 54, 0.88)',
    clipLabelText: '#e6edf7',
    clipLabelBorder: 'rgba(255, 255, 255, 0.18)',
    accent: '#7dd3dd',
    accentDim: '#48b4c2',
    accentRgb: '125, 211, 221',
    accentDimRgb: '72, 180, 194',
    clipSwipe: '#7dd3dd',
  },
  paper: {
    label: 'Sky',
    colorScheme: 'light',
    onAccent: '#ffffff',
    bgPrimary: '#eaf2fc',
    bgSecondary: '#f7faff',
    bgTertiary: '#dce8f7',
    bgHover: '#cfdef0',
    bgPanel: '#f0f5fc',
    textPrimary: '#0b2a66',
    textSecondary: '#2b54a8',
    textTertiary: '#4c6893',
    border: '#b9cce6',
    danger: '#c1293e',
    waveformBgTop: '#e2ecfa',
    waveformBgMid: '#dce8f7',
    waveformBar: '#6a9bd8',
    waveformBarSilent: '#8fb3ec',
    waveformBarPlayed: '#1d5bb5',
    clipLabelBg: 'rgba(235, 244, 255, 0.72)',
    clipLabelText: '#0b2a66',
    clipLabelBorder: 'rgba(0, 0, 0, 0.08)',
    accent: '#1d5bb5',
    accentDim: '#1a5cb8',
    accentRgb: '29, 91, 181',
    accentDimRgb: '26, 92, 184',
    clipSwipe: '#1a5cb8',
  },
  nova: {
    label: 'Nova',
    colorScheme: 'dark',
    onAccent: '#08111f',
    bgPrimary: '#211b30',
    bgSecondary: '#2c233e',
    bgTertiary: '#372c4b',
    bgHover: '#44365c',
    bgPanel: '#261f36',
    textPrimary: '#f0e8ff',
    textSecondary: '#d0b9ff',
    textTertiary: '#a88adf',
    border: '#554367',
    danger: '#ff5c7a',
    waveformBgTop: '#332943',
    waveformBgMid: '#2a223a',
    waveformBar: '#8a7bd8',
    waveformBarSilent: '#5a4390',
    waveformBarPlayed: '#b18cff',
    clipLabelBg: 'rgba(38, 31, 54, 0.88)',
    clipLabelText: '#f0e8ff',
    clipLabelBorder: 'rgba(255, 255, 255, 0.18)',
    accent: '#b18cff',
    accentDim: '#9366f2',
    accentRgb: '177, 140, 255',
    accentDimRgb: '147, 102, 242',
    clipSwipe: '#b18cff',
  },
  rose: {
    label: 'Lilac',
    colorScheme: 'light',
    onAccent: '#ffffff',
    bgPrimary: '#f2edf9',
    bgSecondary: '#faf7ff',
    bgTertiary: '#e5dcf2',
    bgHover: '#d9cce9',
    bgPanel: '#f6f1fc',
    textPrimary: '#3a2390',
    textSecondary: '#5f46b3',
    textTertiary: '#6c5b87',
    border: '#cfc0e2',
    danger: '#b23b74',
    waveformBgTop: '#ece3f7',
    waveformBgMid: '#e5dcf2',
    waveformBar: '#8a7bd8',
    waveformBarSilent: '#b49dec',
    waveformBarPlayed: '#6d46b8',
    clipLabelBg: 'rgba(245, 240, 255, 0.72)',
    clipLabelText: '#3a2390',
    clipLabelBorder: 'rgba(0, 0, 0, 0.08)',
    accent: '#6d46b8',
    accentDim: '#5f3cbf',
    accentRgb: '109, 70, 184',
    accentDimRgb: '95, 60, 191',
    clipSwipe: '#5f3cbf',
  },

  qinghua: {
    label: 'Qinghua',
    colorScheme: 'light',
    onAccent: '#ffffff',
    bgPrimary: '#ffffff',
    bgSecondary: '#f8faff',
    bgTertiary: '#e8f0fe',
    bgHover: '#d0e0fd',
    bgPanel: '#fafcff',
    textPrimary: '#001d4a',
    textSecondary: '#003080',
    textTertiary: '#4866a3',
    border: '#8ab4f8',
    danger: '#b00020',
    waveformBgTop: '#f0f5ff',
    waveformBgMid: '#e0eaff',
    waveformBar: '#6a9ce0',
    waveformBarSilent: '#7a9ce0',
    waveformBarPlayed: '#0038a8',
    clipLabelBg: 'rgba(255, 255, 255, 0.85)',
    clipLabelText: '#001d4a',
    clipLabelBorder: 'rgba(0, 29, 74, 0.18)',
    accent: '#0038a8',
    accentDim: '#002878',
    accentRgb: '0, 56, 168',
    accentDimRgb: '0, 40, 120',
    clipSwipe: '#0038a8',
  },

  yingluo: {
    label: 'Yingluo',
    colorScheme: 'light',
    onAccent: '#ffffff',
    bgPrimary: '#fff8f0',
    bgSecondary: '#fffef8',
    bgTertiary: '#ffe8e0',
    bgHover: '#ffd8cc',
    bgPanel: '#fffaf5',
    textPrimary: '#4a0d1a',
    textSecondary: '#801830',
    textTertiary: '#995268',
    border: '#ffb3cc',
    danger: '#8b002a',
    waveformBgTop: '#fff0e8',
    waveformBgMid: '#ffe0d0',
    waveformBar: '#c775a0',
    waveformBarSilent: '#e08ab8',
    waveformBarPlayed: '#c71585',
    clipLabelBg: 'rgba(255, 248, 240, 0.85)',
    clipLabelText: '#4a0d1a',
    clipLabelBorder: 'rgba(74, 13, 26, 0.18)',
    accent: '#c71585',
    accentDim: '#a01068',
    accentRgb: '199, 21, 133',
    accentDimRgb: '160, 16, 104',
    clipSwipe: '#c71585',
  },

  norge: {
    label: 'Norge',
    colorScheme: 'light',
    onAccent: '#ffffff',
    bgPrimary: '#ffffff',
    bgSecondary: '#f0f4f8',
    bgTertiary: '#dce8f4',
    bgHover: '#c8d8f0',
    bgPanel: '#f8faff',
    textPrimary: '#002868',
    textSecondary: '#003878',
    textTertiary: '#486a90',
    border: '#b8c8da',
    danger: '#ba0c2f',
    waveformBgTop: '#f0f4f8',
    waveformBgMid: '#e0e8f0',
    // Flag split: unplayed bars in vivid flag blue, played in flag red.
    waveformBar: '#0057b8',
    waveformBarSilent: '#4a94e0',
    waveformBarPlayed: '#ba0c2f',
    clipLabelBg: 'rgba(255, 255, 255, 0.9)',
    clipLabelText: '#002868',
    clipLabelBorder: 'rgba(186, 12, 47, 0.22)',
    accent: '#ba0c2f',
    accentDim: '#960925',
    accentRgb: '186, 12, 47',
    accentDimRgb: '150, 9, 37',
    clipSwipe: '#ba0c2f',
  },
};

export const THEME_IDS: ThemeId[] = [
  'system',
  ...(Object.keys(THEMES) as StaticThemeId[]),
];

export const DEFAULT_THEME: ThemeId = 'midnight';

/** Palette backing `system`: Slate in dark mode, Mist in light mode. */
export const SYSTEM_DARK_THEME: StaticThemeId = 'dark';
export const SYSTEM_LIGHT_THEME: StaticThemeId = 'light';

/** Whether the OS currently prefers a dark appearance. */
export function isSystemDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Resolves `system` to its current static palette; others pass through. */
export function resolveThemeId(theme: ThemeId): StaticThemeId {
  if (theme !== 'system') return theme;
  return isSystemDark() ? SYSTEM_DARK_THEME : SYSTEM_LIGHT_THEME;
}

/**
 * Applies the given theme to the document root as inline CSS custom
 * properties, overriding the static `:root` fallbacks in App.css.
 */
export function applyThemeVars(theme: ThemeId): void {
  const t = THEMES[resolveThemeId(theme)];
  if (!t) return;

  const root = document.documentElement;
  root.style.colorScheme = t.colorScheme;
  const vars: Array<[string, string]> = [
    ['--bg-primary', t.bgPrimary],
    ['--bg-secondary', t.bgSecondary],
    ['--bg-tertiary', t.bgTertiary],
    ['--bg-hover', t.bgHover],
    ['--bg-panel', t.bgPanel],
    ['--text-primary', t.textPrimary],
    ['--text-secondary', t.textSecondary],
    ['--text-tertiary', t.textTertiary],
    ['--border', t.border],
    ['--danger', t.danger],
    ['--waveform-bg-top', t.waveformBgTop],
    ['--waveform-bg-mid', t.waveformBgMid],
    ['--waveform-bar', t.waveformBar],
    ['--waveform-bar-silent', t.waveformBarSilent],
    ['--waveform-bar-played', t.waveformBarPlayed],
    ['--clip-label-bg', t.clipLabelBg],
    ['--clip-label-text', t.clipLabelText],
    ['--clip-label-border', t.clipLabelBorder],
    ['--accent', t.accent],
    ['--on-accent', t.onAccent],
    ['--accent-dim', t.accentDim],
    ['--accent-rgb', t.accentRgb],
    ['--accent-dim-rgb', t.accentDimRgb],
    ['--clip-swipe', t.clipSwipe],
  ];
  for (const [key, value] of vars) {
    root.style.setProperty(key, value);
  }
}
