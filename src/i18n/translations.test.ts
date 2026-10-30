import {describe, expect, it} from 'vitest';
import {
  en,
  zh,
  no,
  translate,
  t,
  setLocale,
  getLocale,
  LOCALE_IDS,
  isLocale,
} from './index';

/**
 * Recursively walk `source` and collect the dotted key paths of its leaf
 * strings, e.g. `{player: {play: 'Play'}}` → `['player.play']`.
 */
function collectKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object') {
      return collectKeys(value as Record<string, unknown>, path);
    }
    return [path];
  });
}

describe('i18n', () => {
  it('resolves deep keys to the English string', () => {
    expect(t('player.play')).toBe('Play');
    expect(t('settings.tabClips')).toBe('Clip detection');
    expect(translate(en, 'emptyState.subtitle')).toBe(
      'Choose audio files from your device.',
    );
  });

  it('interpolates parameters', () => {
    expect(t('player.backSeconds', {seconds: 10})).toBe('Go back 10 seconds');
    expect(t('merge.rangeTitle', {gap: '0.15'})).toBe(
      'Clips less than 0.15s apart are joined together',
    );
    expect(t('merge.clipCount', {count: 1})).toBe('1 clip');
    expect(t('merge.clipCountPlural', {count: 3})).toBe('3 clips');
    expect(t('playlist.title', {count: 2})).toBe('Playlist (2)');
  });

  it('leaves unknown placeholders intact', () => {
    expect(t('reps.title', {other: 5})).toBe(
      'Number of times a clip repeats when you click it',
    );
  });

  it('falls back to the key itself when the translation is missing', () => {
    expect(
      // type cast only: keys are statically checked in real code
      translate(
        en,
        'does.not.exist' as unknown as Parameters<typeof translate>[1],
      ),
    ).toBe('does.not.exist');
  });

  it('is locale-switchable through setLocale', () => {
    setLocale('en');
    expect(getLocale()).toBe('en');
    expect(t('common.close')).toBe('Close');
  });

  it('registers zh with a complete message set', () => {
    expect(LOCALE_IDS).toContain('zh');
    expect(isLocale('zh')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    setLocale('zh');
    expect(getLocale()).toBe('zh');
    expect(t('player.play')).toBe('播放');
    expect(t('settings.language')).toBe('语言');
    expect(t('common.close')).toBe('关闭');
    expect(t('merge.rangeTitle', {gap: '0.15'})).toBe(
      '间隔少于 0.15 秒的片段将自动合并',
    );
    expect(zh.playlist.title).toBe('播放列表（{count}）');
    setLocale('en');
  });

  it('has a complete zh translation — every English key exists', () => {
    const enKeys = collectKeys(en);
    const zhKeys = new Set(collectKeys(zh));
    const missing = enKeys.filter(k => !zhKeys.has(k));
    expect(missing).toEqual([]);
  });

  it("has a complete 'no' translation — every English key exists", () => {
    const enKeys = collectKeys(en);
    const noKeys = new Set(collectKeys(no));
    const missing = enKeys.filter(k => !noKeys.has(k));
    expect(missing).toEqual([]);
  });
});
