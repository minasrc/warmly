import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import { frontendHeaders } from './src/config/hosting.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), {
    name: 'warmly-hosting',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '_headers', source: frontendHeaders({ ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env }) })
      this.emitFile({ type: 'asset', fileName: '_redirects', source: '/* /index.html 200\n' })
    },
  }],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    rolldownOptions: {
      output: { codeSplitting: { groups: [{ name: 'react-vendor', test: /node_modules\/(react|react-dom|scheduler)\// }] } },
    },
  },
}))
