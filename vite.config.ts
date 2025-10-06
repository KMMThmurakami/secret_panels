import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')
  return{
  plugins: [react()],
  base: '/bbs_sample/',
  define: {
    'process.env': env,
  },
}
})
