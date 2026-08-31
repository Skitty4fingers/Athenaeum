/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Deployer-configurable app name — see `client/.env` and `src/lib/config.ts`. */
  readonly VITE_APP_NAME?: string
}
