import {describe, expect, it} from 'vitest';
import {resolve} from 'node:path';
import {localBuildPaths} from './buildPaths.mjs';

describe('local deployment paths', () => {
  const root = resolve('build-path-test');
  it('uses configured build output and deploys under the project root', () => {
    expect(
      localBuildPaths(root, {VITE_BASE_URL: '/music/', VITE_OUT_DIR: 'docs'}),
    ).toEqual({
      source: resolve(root, 'docs'),
      destination: resolve(root, 'music'),
    });
    expect(localBuildPaths(root, {VITE_BASE_URL: '/audio/'})).toEqual({
      source: resolve(root, 'dist'),
      destination: resolve(root, 'audio'),
    });
    expect(localBuildPaths(root, {})).toBeNull();
  });
  it.each(['/../', '/./', '/a/b/', '/%2e%2e/', '/C:/', 'https://example.com/'])(
    'rejects unsafe base %s',
    base => {
      expect(() => localBuildPaths(root, {VITE_BASE_URL: base})).toThrow();
    },
  );
  it.each(['..', '.', 'music', 'music/assets'])(
    'rejects overlapping output %s',
    out => {
      expect(() =>
        localBuildPaths(root, {VITE_BASE_URL: '/music/', VITE_OUT_DIR: out}),
      ).toThrow();
    },
  );
});
