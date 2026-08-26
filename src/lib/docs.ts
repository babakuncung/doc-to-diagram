import { supabase } from './supabase'

export type Doc = {
  id: string
  title: string
  content: string
  updated_at: string
}

/* There is no auth on this page, so "whose document is this" is a random UUID
   minted once per browser. It is a privacy convenience, not a security
   boundary — the table policy is open to the anon key. */
export function getOwner(): string {
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

export async function listDocs(): Promise<Doc[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('documents')
    .select('id, title, content, updated_at')
    .eq('owner', getOwner())
    .order('updated_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return data as Doc[]
}

export async function createDoc(content: string): Promise<Doc> {
  const { data, error } = await supabase!
    .from('documents')
    .insert({ owner: getOwner(), title: titleOf(content), content })
    .select('id, title, content, updated_at')
    .single()
  if (error) throw error
  return data as Doc
}

export async function updateDoc(id: string, content: string): Promise<void> {
  const { error } = await supabase!
    .from('documents')
    .update({ title: titleOf(content), content, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteDoc(id: string): Promise<void> {
  const { error } = await supabase!.from('documents').delete().eq('id', id)
  if (error) throw error
}
