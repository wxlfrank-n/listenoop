import {describe, expect, it} from 'vitest';
import {DEFAULT_THEME, THEMES, THEME_IDS} from './themes';

function luminance(hex: string) {
  const rgb = [1, 3, 5].map(i => {
    const value = parseInt(hex.slice(i, i + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
}
function contrast(a: string, b: string) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe('theme readability', () => {
  for (const [name, theme] of Object.entries(THEMES)) {
    it(`${name}: app labels stay readable and control foregrounds follow the palette`, () => {
      for (const background of [
        theme.bgPrimary,
        theme.bgSecondary,
        theme.bgTertiary,
        theme.bgPanel,
      ]) {
        for (const text of [
          theme.textPrimary,
          theme.textSecondary,
          theme.textTertiary,
          theme.accentInk,
        ]) {
          expect(
            contrast(text, background),
            `${name}: ${text} on ${background}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
      // Approved seasonal controls use pale panel-colored text, intentionally
      // below the usual contrast target. Assert that exact color role below.
      const approvedPanelForeground = ['paper', 'autumn', 'winter'].includes(
        name,
      );
      for (const background of approvedPanelForeground
        ? []
        : [theme.accent, theme.accentDim]) {
        expect(
          contrast(theme.onAccent, background),
          `${name}: solid accent foreground`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  it('retains the approved Autumn colors and distinct seasonal palettes', () => {
    expect(THEMES.autumn.accent).toBe('#FFB000');
    expect(THEMES.autumn.onAccent).toBe('#FFFBE2');
    expect(THEMES.autumn.accentInk).not.toBe(THEMES.autumn.accent);
    expect(THEMES.paper.label).toBe('Summer');
    expect(THEMES.light.label).toBe('Spring');
    expect(THEMES.paper.bgPrimary).not.toBe(THEMES.winter.bgPrimary);
    expect(THEMES.paper.accent).not.toBe(THEMES.winter.accent);
    expect(THEMES.light.bgPrimary).not.toBe(THEMES.winter.bgPrimary);
    expect(THEMES.light.accent).not.toBe(THEMES.winter.accent);
  });

  it('uses the approved panel-colored control text and yellow Autumn waveform', () => {
    for (const id of ['paper', 'autumn', 'winter'] as const) {
      expect(THEMES[id].onAccent).toBe(THEMES[id].waveformBgTop);
    }
    expect(THEMES.autumn.waveformBar).toBe(THEMES.autumn.accent);
  });

  it('starts with Listenoop Night and offers only fixed palettes', () => {
    expect(DEFAULT_THEME).toBe('listenoop');
    expect(THEME_IDS[0]).toBe('listenoop');
    expect(THEME_IDS).not.toContain('system');
  });
});
