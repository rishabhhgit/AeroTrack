declare module "*.png";
declare module "*.svg";
declare module "*.jpeg";
declare module "*.jpg";
declare module "*.css";

/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />

interface ImportMetaEnv {
  readonly VITE_REACT_OSKY_CLIENT_ID: string;
  readonly VITE_REACT_OSKY_CLIENT_SECRET: string;
  readonly VITE_AIRPORTDB_TOKEN: string;
  // add other env variables here...
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
