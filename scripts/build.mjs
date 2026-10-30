import {execSync} from 'node:child_process';
import {cpSync, mkdirSync} from 'node:fs';
import {delimiter, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadEnv} from 'vite';
import {localBuildPaths} from './buildPaths.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pathToBin = join(root, 'node_modules', '.bin');
const run = cmd =>
  execSync(cmd, {
    cwd: root,
    stdio: 'inherit',
    // Use the OS-native PATH separator (`:` on POSIX, `;` on Windows) so
    // `tsc` / `vite` started via execSync are findable on every platform.
    env: {...process.env, PATH: [pathToBin, process.env.PATH].join(delimiter)},
  });

const isLocal = process.argv.includes('--local');
const paths = isLocal
  ? localBuildPaths(root, {...loadEnv('production', root, ''), ...process.env})
  : null;

run('tsc -b');
run('vite build');

if (isLocal) {
  if (!paths) {
    console.log('[build:local] Root base URL; skipping local deployment copy');
  } else {
    mkdirSync(paths.destination, {recursive: true});
    cpSync(paths.source, paths.destination, {recursive: true});
    console.log(`[build:local] copied built content to ${paths.destination}`);
  }
}
