import { supabase } from './supabase'

export type Doc = {
  id: string
  title: string
  content: string
  updated_at: string
}

/* Pre-auth browsers stored their cloud documents under a random local UUID.
   That UUID is kept around so the first login can claim those rows. */
export function getAnonOwner(): string {
  const K = 'doc-to-diagram:owner'
  let v = localStorage.getItem(K)
  if (!v) {
    v = crypto.randomUUID()
    localStorage.setItem(K, v)
  }
  return v
}

/* The document title is derived, never asked: the first non-empty line of the
   source, stripped of markdown headings and bullet markers. */
export function titleOf(text: string): string {
  for (const raw of text.split('\n')) {
    const t = raw.replace(/^\s*(#{1,6}\s+|[-*·•]\s*)/, '').trim()
    if (t) return t.length > 60 ? t.slice(0, 59) + '…' : t
  }
  return 'Untitled'
}

/* Ownership now comes from the auth token — the RLS policy checks
   owner = auth.uid(), so inserts must not send an owner column at all. */
async function uid(): Promise<string> {
  const { data, error } = await supabase!.auth.getUser()
  if (error || !data.user) throw new Error('Sign in to use cloud documents')
  return data.user.id
}

export async function listDocs(): Promise<Doc[]> {
  await uid()
  const { data, error } = await supabase!
    .from('documents')
    .select('id, title, content, updated_at')
    .order('updated_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return data as Doc[]
}

export async function createDoc(content: string): Promise<Doc> {
  const owner = await uid()
  const { data, error } = await supabase!
    .from('documents')
    .insert({ owner, title: titleOf(content), content, anon_owner: getAnonOwner() })
    .select('id, title, content, updated_at')
    .single()
  if (error) throw error
  return data as Doc
}

export async function updateDoc(id: string, content: string): Promise<void> {
  await uid()
  const { error } = await supabase!
    .from('documents')
    .update({ title: titleOf(content), content, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteDoc(id: string): Promise<void> {
  await uid()
  const { error } = await supabase!.from('documents').delete().eq('id', id)
  if (error) throw error
}
