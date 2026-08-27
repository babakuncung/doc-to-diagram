import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type { Session }

export function onAuth(cb: (s: Session | null) => void): () => void {
  if (!supabase) { cb(null); return () => {} }
  supabase.auth.getSession().then(({ data }) => cb(data.session))
  const { data } = supabase.auth.onAuthStateChange((_ev, s) => cb(s))
  return () => data.subscription.unsubscribe()
}

export async function signInEmail(email: string, password: string): Promise<void> {
  const { error } = await supabase!.auth.signInWithPassword({ email, password })
  if (error) throw error
}

/* Instant signup: with "Confirm email" turned off in the Supabase dashboard,
   this returns a live session immediately — no verification step. */
export async function signUpEmail(email: string, password: string): Promise<void> {
  const { data, error } = await supabase!.auth.signUp({ email, password })
  if (error) throw error
  if (!data.session) {
    throw new Error('Account created, but email confirmation is still on. Turn it off in Supabase → Authentication → Sign In / Providers → Email, then sign in.')
  }
}

/* Probe the provider first: if GitHub is not (fully) configured in Supabase,
   the authorize endpoint answers with a JSON error instead of a redirect.
   Catching it here keeps the user on the page with a readable message instead
   of landing on a raw {"code":400,...} JSON document. */
export async function signInGithub(): Promise<void> {
  const { data, error } = await supabase!.auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo: window.location.origin, skipBrowserRedirect: true },
  })
  if (error) throw error
  if (!data?.url) throw new Error('GitHub sign-in is unavailable right now.')
  try {
    const r = await fetch(data.url, { method: 'HEAD', redirect: 'manual' })
    if (r.status >= 400) throw new Error('bad')
  } catch {
    throw new Error('GitHub sign-in is not configured yet. The site owner needs to paste the GitHub OAuth Client ID and Secret in Supabase → Authentication → Providers → GitHub.')
  }
  window.location.assign(data.url)
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut()
}

/* A human label for the menu button: the email local-part, or the GitHub
   username for OAuth accounts. */
export function displayName(s: Session): string {
  const u = s.user
  return (
    (u.user_metadata?.user_name as string) ||
    (u.user_metadata?.preferred_username as string) ||
    (u.email ? u.email.split('@')[0] : 'Account')
  )
}
