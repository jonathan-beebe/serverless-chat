/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __COMMIT_HASH__: string

interface ImportMetaEnv {
  // TURN relay credentials. All three optional — unset means the app uses
  // STUN-only ICE, which fails on symmetric NATs. See .env.example.
  readonly VITE_TURN_URLS?: string
  readonly VITE_TURN_USERNAME?: string
  readonly VITE_TURN_CREDENTIAL?: string
}
