import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// The preset pads the maskable and Apple icons on white; pad them on the theme colour instead.
const background = '#1e293b'

// Generates every PWA icon from public/logo.svg: run `pnpm --filter @drillgram/web generate-pwa-assets`
// after changing the SVG and commit the PNGs (https://vite-pwa-org.netlify.app/assets-generator/).
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background } },
  },
  images: ['public/logo.svg'],
})
