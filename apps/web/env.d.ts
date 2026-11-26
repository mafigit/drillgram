/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/vue" />

interface ImportMetaEnv {
  /** "1" in the build that runs without a server (`build:browser`, lib/api.ts). */
  readonly VITE_BROWSER_ONLY?: string
}

// The list of the icon library, made by tech-icons.vite.ts.
declare module 'virtual:tech-icons' {
  const icons: { name: string; title: string; set: string; licence: string }[]
  export default icons
}
