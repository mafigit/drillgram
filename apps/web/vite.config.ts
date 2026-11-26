import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import vueDevTools from 'vite-plugin-vue-devtools'
import { VitePWA } from 'vite-plugin-pwa'
import { techIcons } from './tech-icons.vite.ts'
import { signalling } from './signal.vite.ts'

/** The build that runs without a server (`build:browser`, `dev:browser`). */
const browserOnly = process.env.VITE_BROWSER_ONLY === '1'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue({
      // GitHub's markdown-toolbar-element (components/MarkdownField.vue): custom elements, not Vue's.
      template: { compilerOptions: { isCustomElement: (tag) => tag === 'markdown-toolbar' || tag.startsWith('md-') } },
    }),
    tailwindcss(),
    vueDevTools(),
    techIcons(),
    // Shared sessions need a meeting point for browsers: the Worker on Cloudflare, this here.
    ...(browserOnly ? [signalling()] : []),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false, // registered by ReloadPrompt.vue via virtual:pwa-register/vue
      workbox: {
        // wasm: the layout engine must work offline too.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm}'],
        navigateFallback: 'index.html',
        // The server's own addresses are not the app's: single sign-on sends the browser there.
        navigateFallbackDenylist: [/^\/api\//],
        // The icon library is thousands of files: only the icons a diagram shows are kept for
        // offline use, as they are fetched.
        globIgnores: ['tech-icons/**'],
        runtimeCaching: [
          {
            urlPattern: /\/tech-icons\/[a-z0-9-]+\.svg$/,
            handler: 'CacheFirst',
            options: { cacheName: 'tech-icons', expiration: { maxEntries: 600 } },
          },
        ],
      },
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'logo.svg'],
      manifest: {
        name: 'Drillgram',
        short_name: 'Drillgram',
        description: 'Architecture diagrams you can drill into',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#1e293b',
        background_color: '#1e293b',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  // The dev server gives out the app; the API is the server's (apps/server), started beside it.
  // The app without a server (`dev:browser`, `build:browser`) asks nobody.
  server: browserOnly ? {} : { proxy: { '/api': process.env.DRILLGRAM_API ?? 'http://localhost:8080' } },
  // Without a server the site says who runs it: the imprint and the privacy policy are pages
  // of that build alone. Who runs a server for others says their own.
  build: browserOnly ? { rolldownOptions: { input: ['index.html', 'imprint.html', 'privacy.html'] } } : {},
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
