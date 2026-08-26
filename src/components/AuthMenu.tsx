import { useEffect, useRef, useState } from 'react'
import {
  onAuth, signInEmail, signUpEmail, signInGithub, signOut,
  displayName, type Session,
} from '../lib/auth'

/* The account menu in the top-right corner.
   Logged out: a single "Sign in" button opening the form.
   Logged in: the user's name opening a small dropdown (email + sign out). */
export default function AuthMenu({ onSession }: { onSession: (s: Session | null) => void }) {
  const [session, setSession] = useState<Session | null>(null)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => onAuth(s => { setSession(s); onSession(s) }), [])

  // Close the popover on any click outside it.
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', h)
    return () => window.removeEventListener('pointerdown', h)
  }, [open])

  const submit = async () => {
    setBusy(true); setMsg('')
    try {
      if (tab === 'in') await signInEmail(email.trim(), pass)
      else await signUpEmail(email.trim(), pass)
      setOpen(false); setPass('')
    } catch (e: any) {
      setMsg(String(e.message ?? e))
    } finally { setBusy(false) }
  }

  const github = async () => {
    setBusy(true); setMsg('')
    try { await signInGithub() }
    catch (e: any) { setMsg(String(e.message ?? e)); setBusy(false) }
  }

  return (
    <div className="auth" ref={wrap}>
      <button className={'mini auth-btn' + (session ? ' on' : '')} type="button"
        onClick={() => { setOpen(o => !o); setMsg('') }}>
        {session ? displayName(session) : 'Sign in'}
      </button>

      {open && !session && (
        <div className="auth-pop">
          <div className="auth-tabs">
            <button type="button" className={tab === 'in' ? 'on' : ''}
              onClick={() => { setTab('in'); setMsg('') }}>Sign in</button>
            <button type="button" className={tab === 'up' ? 'on' : ''}
              onClick={() => { setTab('up'); setMsg('') }}>Create account</button>
          </div>
          <input type="email" placeholder="Email" autoComplete="email"
            value={email} onChange={e => setEmail(e.target.value)} />
          <input type="password"
            placeholder={tab === 'up' ? 'Password (min. 6 characters)' : 'Password'}
            autoComplete={tab === 'up' ? 'new-password' : 'current-password'}
            value={pass} onChange={e => setPass(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !busy) submit() }} />
          {msg && <div className="auth-err">{msg}</div>}
          <button className="mini primary auth-main" type="button" disabled={busy}
            onClick={submit}>
            {busy ? '…' : tab === 'in' ? 'Sign in' : 'Create account'}
          </button>
          <div className="auth-or"><span>or</span></div>
          <button className="mini auth-gh" type="button" disabled={busy} onClick={github}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
            </svg>
            Continue with GitHub
          </button>
        </div>
      )}

      {open && session && (
        <div className="auth-pop">
          <div className="auth-me">
            <div className="auth-me-name">{displayName(session)}</div>
            <div className="auth-me-mail">{session.user.email ?? 'GitHub account'}</div>
          </div>
          <button className="mini auth-main" type="button"
            onClick={async () => { await signOut(); setOpen(false) }}>
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
