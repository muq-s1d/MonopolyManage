import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The lazy 3D stage chunk (three.js) is about 1 MB before gzip; it only loads on the table.
export default defineConfig({ plugins: [react()], build: { chunkSizeWarningLimit: 1100 } })
