/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/vue" />

// The list of the icon library, made by tech-icons.vite.ts.
declare module 'virtual:tech-icons' {
  const icons: { name: string; title: string; set: string; licence: string }[]
  export default icons
}
