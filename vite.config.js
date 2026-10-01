import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The API runs separately (uvicorn on :8000). Proxying it under /api means the
// frontend never needs to know a host, so a build works unchanged wherever it
// is served from.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    // The documentation markdown lives in ../docs, outside the Vite root, and
    // is imported at build time so one set of files serves both this app and
    // the static MkDocs site.
    fs: { allow: ['..'] },
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
})
