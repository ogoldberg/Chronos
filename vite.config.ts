import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dotenv from 'dotenv'
import { apiPlugin } from './server/api'

// Load .env into process.env BEFORE the API plugin imports anything that
// reads provider config at module load time. Vite's loadEnv only exposes
// VITE_-prefixed variables to the client; the in-process API plugin runs
// in Node and needs the raw values (OPENAI_API_KEY, ANTHROPIC_API_KEY,
// AI_PROVIDER, AI_MODEL, etc.) on process.env directly.
dotenv.config()

export default defineConfig({
  plugins: [react(), apiPlugin()],
})
