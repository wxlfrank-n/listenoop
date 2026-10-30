import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import {defineConfig, loadEnv} from 'vite';

// https://vite.dev/config/
export default defineConfig(({command, mode}) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isBuild = command === 'build';
  return {
    plugins: [react(), svgr()],
    base: env.VITE_BASE_URL || '/',
    server: {
      port: 5173,
    },
    build: {
      outDir: env.VITE_OUT_DIR || (isBuild ? 'dist' : undefined),
    },
  };
});
