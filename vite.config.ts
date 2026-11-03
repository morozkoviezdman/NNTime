import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // GitHub Pages: при депое через GitHub Actions переменная GITHUB_PAGES_BASE
  // задаётся в .github/workflows/deploy.yml; иначе берётся /<repo>/
  base: process.env.GITHUB_PAGES_BASE || '/NNTime/',
})
