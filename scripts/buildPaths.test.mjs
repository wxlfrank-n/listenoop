import {describe, expect, it} from 'vitest';
import {resolve} from 'node:path';
import {localBuildPaths} from './buildPaths.mjs';

describe('local deployment paths', () => {
  const root = resolve('build-path-test');
  it('uses configured build output and a dedicated deployment folder', () => {
    expect(
      localBuildPaths(root, {VITE_BASE_URL: '/music/', VITE_OUT_DIR: 'docs'}),
    ).toEqual({
      source: resolve(root, 'docs'),
      destination: resolve(root, '.local-deploy/music'),
    });
    expect(localBuildPaths(root, {VITE_BASE_URL: '/src/'}).destination).toBe(
      resolve(root, '.local-deploy/src'),
    );
    expect(localBuildPaths(root, {})).toBeNull();
  });
  it.each(['/../', '/./', '/a/b/', '/%2e%2e/', '/C:/', 'https://example.com/'])(
    'rejects unsafe base %s',
    base => {
      expect(() => localBuildPaths(root, {VITE_BASE_URL: base})).toThrow();
    },
  );
  it.each(['..', '.', '.local-deploy', '.local-deploy/music'])(
    'rejects overlapping output %s',
    out => {
      expect(() =>
        localBuildPaths(root, {VITE_BASE_URL: '/music/', VITE_OUT_DIR: out}),
      ).toThrow();
    },
  );
});
