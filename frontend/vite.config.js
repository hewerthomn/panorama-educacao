import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Para repositorio GitHub Pages, defina BASE_PATH="/nome-do-repo/".
export default defineConfig({
  plugins: [vue()],
  base: process.env.BASE_PATH || '/',
})
