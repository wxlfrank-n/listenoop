import {existsSync, lstatSync} from 'node:fs';
import {isAbsolute, relative, resolve, sep} from 'node:path';

export function localBuildPaths(root, env) {
  const base = env.VITE_BASE_URL || '/';
  if (base === '/') return null;
  if (!/^\/[a-zA-Z0-9_-]+\/$/.test(base)) {
    throw new Error('Local builds require VITE_BASE_URL=/folder/ or /.');
  }
  const source = resolve(root, env.VITE_OUT_DIR || 'dist');
  const deployRoot = resolve(root, '.local-deploy');
  const destination = resolve(deployRoot, base.slice(1, -1));
  const inside = (parent, child) => {
    const path = relative(parent, child);
    return (
      path !== '' &&
      path !== '..' &&
      !path.startsWith(`..${sep}`) &&
      !isAbsolute(path)
    );
  };
  if (
    !inside(root, source) ||
    source === deployRoot ||
    inside(source, deployRoot) ||
    inside(deployRoot, source)
  ) {
    throw new Error(
      'Build output must be inside the project and separate from .local-deploy.',
    );
  }
  for (const path of [deployRoot, destination]) {
    if (existsSync(path) && lstatSync(path).isSymbolicLink()) {
      throw new Error('Local deployment folders must not be symbolic links.');
    }
  }
  return {source, destination};
}
