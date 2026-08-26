import { createClient } from '@supabase/supabase-js'

/* Both prefixes are accepted: VITE_* for local .env files, NEXT_PUBLIC_* so the
   same project drops straight into a Vercel project that already carries
   Next-style Supabase variables. vite.config.ts sets envPrefix accordingly. */
const url = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/* Missing credentials must degrade gracefully: without them the app stays a
   localStorage-only tool and the cloud panel simply does not render. */
export const supabase = url && key ? createClient(url, key) : null
