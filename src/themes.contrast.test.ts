import {describe, expect, it} from 'vitest';
import {THEMES} from './themes';

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
    it(`${name}: labels stay readable on app surfaces and solid controls`, () => {
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
        ]) {
          expect(
            contrast(text, background),
            `${name}: ${text} on ${background}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
      for (const background of [theme.accent, theme.accentDim]) {
        expect(
          contrast(theme.onAccent, background),
          `${name}: solid accent foreground`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
