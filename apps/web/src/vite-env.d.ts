/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL API. Default `/api` (di-proxy Vite dev server ke port 3000). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
