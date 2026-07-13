/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_REACT_OSKY_CLIENT_ID: string
  readonly VITE_REACT_OSKY_CLIENT_SECRET: string
  readonly VITE_AIRPORTDB_TOKEN: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
