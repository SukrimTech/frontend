import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/*
  Where the documentation lives.

  The docs are written once, in the Sukrim repository, and build both the
  MkDocs site and this app's /docs page. This repository sits beside that one,
  so by default they are read from ../Sukrim/docs. Set SUKRIM_DOCS to point
  somewhere else -- a different checkout, or a CI path.

  A missing folder is said out loud at startup rather than discovered as an
  empty Docs page.
*/
const here = path.dirname(fileURLToPath(import.meta.url))
const DOCS = path.resolve(here, process.env.SUKRIM_DOCS || '../Sukrim/docs')
if (!existsSync(DOCS)) {
  console.warn(`\n[sukrim] no docs at ${DOCS} -- the /docs page will be empty.\n`
    + '         Check out Sukrim beside this repository, or set SUKRIM_DOCS.\n')
}

// The API runs separately (uvicorn on :8000). Proxying it under /api means the
// frontend never needs to know a host, so a build works unchanged wherever it
// is served from.
export default defineConfig({
  plugins: [react()],
  resolve: {
    // `@sukrim-docs/**/*.md` in src/docs/load.js resolves to DOCS.
    alias: { '@sukrim-docs': DOCS },
  },
  server: {
    port: 5180,
    // The docs are outside the Vite root, so the dev server has to be told
    // it may read them.
    fs: { allow: [here, DOCS] },
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
})
