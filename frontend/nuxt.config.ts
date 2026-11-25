// Single-page app. In development, /api is proxied to the Node API (API_URL).
export default defineNuxtConfig({
  ssr: false,
  compatibilityDate: '2025-01-01',
  devtools: { enabled: false },
  telemetry: false,
  css: ['~/assets/app.css'],
  app: {
    head: {
      title: 'Qatar HMS',
      htmlAttrs: { lang: 'en' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ],
    },
  },
  nitro: {
    devProxy: {
      '/api': { target: process.env.API_URL || 'http://localhost:4000/api', changeOrigin: true },
    },
  },
})
