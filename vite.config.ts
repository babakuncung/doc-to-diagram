import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // Accept Next-style NEXT_PUBLIC_* variables too, so the same Vercel env
  // setup works without renaming anything to VITE_*.
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
})
