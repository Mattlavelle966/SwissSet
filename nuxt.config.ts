export default defineNuxtConfig({
  compatibilityDate: '2026-07-09',
  devtools: { enabled: false },
  experimental: {
    appManifest: false
  },
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    redirectBaseUrl: process.env.REDIRECT_BASE_URL || '',
    public: {
      redirectBaseUrl:
        process.env.NUXT_PUBLIC_REDIRECT_BASE_URL ||
        process.env.REDIRECT_BASE_URL ||
        ''
    }
  }
})
