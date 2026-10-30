/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />

interface ImportMetaEnv {
  readonly VITE_BASE_URL: string;
  readonly VITE_OUT_DIR?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Vite ships worker import types via `vite/client` for `?worker` but only
// since a certain version. Declare a fallback for older setups / when
// `vite/client` does not surface the `?worker` suffix so the TypeScript
// import in `src/workers/audioDecoderClient.ts` resolves.
declare module '*?worker' {
  const workerConstructor: {
    new (options?: {name?: string}): Worker;
  };
  export default workerConstructor;
}
