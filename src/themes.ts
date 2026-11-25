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
  | 'glass'
  | 'dark'
  | 'light'
  | 'midnight'
  | 'paper'
  | 'rose'
  | 'nova'
  | 'qinghua'
  | 'yingluo'
  | 'norge'
  | 'autumn'
  | 'winter'
  | 'listenoop';

/** Every selectable theme has a fixed palette. */
export type StaticThemeId = ThemeId;

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
  /** Readable accent for text and icons on app surfaces. */
  accentInk: string;
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
  clipAnnotation: string;
  /** Waveform bar color for the played portion. */
  waveformBarPlayed: string;
}

export const THEMES: Record<StaticThemeId, Theme> = {
  // Navy, white, green, and cyan sampled from public/favicon.svg.
  listenoop: {
    label: 'Listenoop Night',
    colorScheme: 'dark',
    bgPrimary: '#060A24',
    bgSecondary: '#0C1445',
    bgTertiary: '#172054',
    bgHover: '#202C68',
    bgPanel: '#0C1445',
    textPrimary: '#DFF7FF',
    textSecondary: '#B3CCD9',
    textTertiary: '#B3CCD9',
    border: '#344276',
    danger: '#FF8494',
    waveformBgTop: '#0C1445',
    waveformBgMid: '#0C1445',
    waveformBar: '#278A7A',
    waveformBarSilent: '#18574E',
    waveformBarPlayed: '#00E8C0',
    clipLabelBg: '#0C1445',
    clipLabelText: '#DFF7FF',
    clipLabelBorder: '#344276',
    clipSwipe: '#40FFFF',
    clipAnnotation: '#DB2777',
    accent: '#00E8C0',
    accentInk: '#40FFFF',
    accentDim: '#00D4AF',
    accentRgb: '0, 232, 192',
    accentDimRgb: '0, 212, 175',
    onAccent: '#060A24',
  },
  glass: {
    label: 'Glass',
    colorScheme: 'dark',
    bgPrimary: '#10182C',
    bgSecondary: '#1D2A43',
    bgTertiary: '#2B3C5C',
    bgHover: '#384D71',
    bgPanel: '#202E49',
    textPrimary: '#F4F8FF',
    textSecondary: '#CBD9EF',
    textTertiary: '#ACBFDD',
    border: '#576D90',
    danger: '#FF9FAE',
    waveformBgTop: '#253858',
    waveformBgMid: '#1D2A43',
    waveformBar: '#83A8DA',
    waveformBarSilent: '#536E97',
    waveformBarPlayed: '#9DECF4',
    clipLabelBg: '#253858',
    clipLabelText: '#F4F8FF',
    clipLabelBorder: '#576D90',
    clipSwipe: '#BAF5FC',
    clipAnnotation: '#6255A5',
    accent: '#9DECF4',
    accentDim: '#85DCEB',
    onAccent: '#10182C',
    accentInk: '#BAF5FC',
    accentRgb: '157, 236, 244',
    accentDimRgb: '133, 220, 235',
  },
  dark: {
    label: 'Solarized Dark',
    colorScheme: 'dark',
    onAccent: '#002B36',
    bgPrimary: '#002B36',
    bgSecondary: '#073642',
    bgTertiary: '#073642',
    bgHover: '#154651',
    bgPanel: '#073642',
    textPrimary: '#FDF6E3',
    textSecondary: '#93A1A1',
    textTertiary: '#93A1A1',
    border: '#586E75',
    danger: '#DC322F',
    waveformBgTop: '#073642',
    waveformBgMid: '#073642',
    waveformBar: '#839496',
    waveformBarSilent: '#586E75',
    waveformBarPlayed: '#2AA198',
    clipLabelBg: '#073642',
    clipLabelText: '#FDF6E3',
    clipLabelBorder: '#586E75',
    accent: '#2AA198',
    accentInk: '#52BDB3',
    accentDim: '#2AA198',
    accentRgb: '42, 161, 152',
    accentDimRgb: '42, 161, 152',
    clipSwipe: '#52BDB3',
    clipAnnotation: '#F4A7C5',
  },
  midnight: {
    label: 'Gruvbox Dark',
    colorScheme: 'dark',
    onAccent: '#1D2021',
    bgPrimary: '#1D2021',
    bgSecondary: '#282828',
    bgTertiary: '#3C3836',
    bgHover: '#504945',
    bgPanel: '#282828',
    textPrimary: '#FBF1C7',
    textSecondary: '#BDAE93',
    textTertiary: '#BDAE93',
    border: '#504945',
    danger: '#FB4934',
    waveformBgTop: '#282828',
    waveformBgMid: '#282828',
    waveformBar: '#BDAE93',
    waveformBarSilent: '#7C6F64',
    waveformBarPlayed: '#FABD2F',
    clipLabelBg: '#282828',
    clipLabelText: '#FBF1C7',
    clipLabelBorder: '#504945',
    accent: '#FABD2F',
    accentInk: '#FABD2F',
    accentDim: '#FABD2F',
    accentRgb: '250, 189, 47',
    accentDimRgb: '250, 189, 47',
    clipSwipe: '#FABD2F',
    clipAnnotation: '#EFA7CB',
  },
  nova: {
    label: 'Tokyo Night',
    colorScheme: 'dark',
    onAccent: '#16161E',
    bgPrimary: '#1A1B26',
    bgSecondary: '#292E42',
    bgTertiary: '#283457',
    bgHover: '#414868',
    bgPanel: '#292E42',
    textPrimary: '#C0CAF5',
    textSecondary: '#A9B1D6',
    textTertiary: '#A9B1D6',
    border: '#414868',
    danger: '#F7768E',
    waveformBgTop: '#292E42',
    waveformBgMid: '#292E42',
    waveformBar: '#A9B1D6',
    waveformBarSilent: '#545C7E',
    waveformBarPlayed: '#7AA2F7',
    clipLabelBg: '#292E42',
    clipLabelText: '#C0CAF5',
    clipLabelBorder: '#414868',
    accent: '#7AA2F7',
    accentInk: '#7AA2F7',
    accentDim: '#7AA2F7',
    accentRgb: '122, 162, 247',
    accentDimRgb: '122, 162, 247',
    clipSwipe: '#7AA2F7',
    clipAnnotation: '#F49BC2',
  },
  light: {
    label: 'Spring',
    colorScheme: 'light',
    onAccent: '#FFFFFF',
    bgPrimary: '#E1F1CF',
    bgSecondary: '#F3FAE9',
    bgTertiary: '#C7E4A6',
    bgHover: '#B4D78E',
    bgPanel: '#ECF7DF',
    textPrimary: '#21371C',
    textSecondary: '#3E5C30',
    textTertiary: '#3E5C30',
    border: '#A0C57C',
    danger: '#B42D3E',
    waveformBgTop: '#F3FAE9',
    waveformBgMid: '#F3FAE9',
    waveformBar: '#77A94C',
    waveformBarSilent: '#B1CD96',
    waveformBarPlayed: '#386D1E',
    clipLabelBg: '#F3FAE9',
    clipLabelText: '#21371C',
    clipLabelBorder: '#A0C57C',
    accent: '#3D7B22',
    accentInk: '#2B5519',
    accentDim: '#32651B',
    accentRgb: '61, 123, 34',
    accentDimRgb: '50, 101, 27',
    clipSwipe: '#2B5519',
    clipAnnotation: '#8B3A62',
  },
  paper: {
    label: 'Summer',
    colorScheme: 'light',
    onAccent: '#F5FBFF',
    bgPrimary: '#E5F4FF',
    bgSecondary: '#F5FBFF',
    bgTertiary: '#DDF0FD',
    bgHover: '#C4E5FA',
    bgPanel: '#F5FBFF',
    textPrimary: '#143D50',
    textSecondary: '#28566A',
    textTertiary: '#28566A',
    border: '#A1C8DF',
    danger: '#B42D3E',
    waveformBgTop: '#F5FBFF',
    waveformBgMid: '#F5FBFF',
    waveformBar: '#75BDEA',
    waveformBarSilent: '#B5DCF5',
    waveformBarPlayed: '#008FE8',
    clipLabelBg: '#F5FBFF',
    clipLabelText: '#143D50',
    clipLabelBorder: '#A1C8DF',
    accent: '#008FE8',
    accentInk: '#17649B',
    accentDim: '#008FE8',
    accentRgb: '0, 143, 232',
    accentDimRgb: '0, 143, 232',
    clipSwipe: '#17649B',
    clipAnnotation: '#9B3C68',
  },
  autumn: {
    label: 'Autumn',
    colorScheme: 'light',
    onAccent: '#FFFBE2',
    bgPrimary: '#FFF4B8',
    bgSecondary: '#FFFBE2',
    bgTertiary: '#FFF4CB',
    bgHover: '#FFECB5',
    bgPanel: '#FFFBE2',
    textPrimary: '#352800',
    textSecondary: '#5E4700',
    textTertiary: '#5E4700',
    border: '#D1B451',
    danger: '#B42D3E',
    waveformBgTop: '#FFFBE2',
    waveformBgMid: '#FFFBE2',
    waveformBar: '#FFB000',
    waveformBarSilent: '#FFD671',
    waveformBarPlayed: '#E68A00',
    clipLabelBg: '#FFFBE2',
    clipLabelText: '#352800',
    clipLabelBorder: '#D1B451',
    accent: '#FFB000',
    accentInk: '#8C5300',
    accentDim: '#FFB000',
    accentRgb: '255, 176, 0',
    accentDimRgb: '255, 176, 0',
    clipSwipe: '#8C5300',
    clipAnnotation: '#883D69',
  },
  winter: {
    label: 'Winter',
    colorScheme: 'light',
    onAccent: '#F6FBFF',
    bgPrimary: '#E9F4FC',
    bgSecondary: '#F6FBFF',
    bgTertiary: '#E1F1FB',
    bgHover: '#CBE7F6',
    bgPanel: '#F6FBFF',
    textPrimary: '#173C5C',
    textSecondary: '#47657E',
    textTertiary: '#47657E',
    border: '#A6C9E3',
    danger: '#B42D3E',
    waveformBgTop: '#F6FBFF',
    waveformBgMid: '#F6FBFF',
    waveformBar: '#8DBBD9',
    waveformBarSilent: '#C2DBEC',
    waveformBarPlayed: '#137CB5',
    clipLabelBg: '#F6FBFF',
    clipLabelText: '#173C5C',
    clipLabelBorder: '#A6C9E3',
    accent: '#2196D2',
    accentInk: '#1B6492',
    accentDim: '#2196D2',
    accentRgb: '33, 150, 210',
    accentDimRgb: '33, 150, 210',
    clipSwipe: '#1B6492',
    clipAnnotation: '#84549F',
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
    clipAnnotation: '#A33466',
    accentInk: '#6d46b8',
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
    clipAnnotation: '#8B4A70',
    accentInk: '#0038a8',
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
    clipAnnotation: '#6246A4',
    accentInk: '#c71585',
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
    clipAnnotation: '#255297',
    accentInk: '#ba0c2f',
  },
};

export const THEME_IDS: readonly ThemeId[] = [
  'listenoop',
  'glass',
  'dark',
  'light',
  'midnight',
  'paper',
  'autumn',
  'winter',
  'rose',
  'nova',
  'qinghua',
  'yingluo',
  'norge',
];

export const DEFAULT_THEME: ThemeId = 'listenoop';

/**
 * Applies the given theme to the document root as inline CSS custom
 * properties, overriding the static `:root` fallbacks in App.css.
 */
export function applyThemeVars(theme: ThemeId): void {
  const t = THEMES[theme];
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
    ['--accent-ink', t.accentInk],
    ['--on-accent', t.onAccent],
    ['--accent-dim', t.accentDim],
    ['--accent-rgb', t.accentRgb],
    ['--accent-dim-rgb', t.accentDimRgb],
    ['--clip-swipe', t.clipSwipe],
    ['--clip-annotation', t.clipAnnotation],
  ];
  for (const [key, value] of vars) {
    root.style.setProperty(key, value);
  }
}
