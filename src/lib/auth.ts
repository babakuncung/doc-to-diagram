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

export async function signInGithub(): Promise<void> {
  const { error } = await supabase!.auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo: window.location.origin },
  })
  if (error) throw error
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
