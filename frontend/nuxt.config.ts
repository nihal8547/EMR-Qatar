// Single-page app. In development, /api is proxied to the Node API (API_URL).
export default defineNuxtConfig({
  ssr: false,
  compatibilityDate: '2025-01-01',
  devtools: { enabled: false },
  runtimeConfig: { public: { idleMin: 30 } },
  telemetry: false,
  css: ['~/assets/app.css'],
  app: {
    head: {
      title: 'Qatar HMS',
      htmlAttrs: { lang: 'en' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'theme-color', content: '#000000' },
      ],
      link: [
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'icon', type: 'image/png', href: '/icon-192.png' },
        { rel: 'apple-touch-icon', href: '/icon-192.png' },
      ],
    },
  },
  nitro: {
    devProxy: {
      '/api': { target: process.env.API_URL || 'http://localhost:4000/api', changeOrigin: true },
    },
  },
})
