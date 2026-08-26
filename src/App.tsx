import { useEffect, useRef, useState } from 'react'
import { createBoard } from './lib/board.js'
import { supabase } from './lib/supabase'
import { listDocs, createDoc, updateDoc, deleteDoc, type Doc } from './lib/docs'

type Sel = {
  id: string; name: string; level: number; kids: number
  pin: boolean; note: string; color: string; chain: string
}
type Stats = { nodes: number; links: number; resolved: string }

const MODES = [['auto', 'Auto'], ['mind', 'Mind map'], ['tree', 'Hierarchy'],
               ['flow', 'Flowchart'], ['net', 'Network']]
const MODE_LABEL: Record<string, string> = Object.fromEntries(MODES)
const SKINS = [['', 'Paper'], ['slate', 'Slate'], ['blueprint', 'Blueprint']]

export default function App() {
  const board = useRef<SVGSVGElement>(null)
  const bg = useRef<HTMLCanvasElement>(null)
  const src = useRef<HTMLTextAreaElement>(null)
  const api = useRef<ReturnType<typeof createBoard> | null>(null)

  const [stats, setStats] = useState<Stats | null>(null)
  const [sel, setSel] = useState<Sel | null>(null)
  const [zoom, setZoom] = useState(1)
  const [mode, setMode] = useState('auto')
  const [skinI, setSkinI] = useState(0)
  const [folded, setFolded] = useState(false)

  // Cloud documents (Supabase). Null while the first load is in flight.
  const [docs, setDocs] = useState<Doc[] | null>(null)
  const [docId, setDocId] = useState<string | null>(null)
  const [cloudMsg, setCloudMsg] = useState('')

  useEffect(() => {
    const b = createBoard({
      board: board.current!, bgc: bg.current!, src: src.current!,
      on: { stats: setStats, sel: setSel, zoom: setZoom },
    })
    api.current = b
    if (supabase) listDocs().then(setDocs).catch(e => setCloudMsg(String(e.message ?? e)))
    return () => { b.dispose(); api.current = null }
  }, [])

  const flash = (m: string) => { setCloudMsg(m); setTimeout(() => setCloudMsg(''), 2400) }
  const refreshDocs = () => listDocs().then(setDocs).catch(e => flash(String(e.message ?? e)))

  const saveCloud = async () => {
    const text = src.current!.value
    if (!text.trim()) return flash('Nothing to save')
    try {
      if (docId) {
        await updateDoc(docId, text)
        flash('Updated in cloud')
      } else {
        const d = await createDoc(text)
        setDocId(d.id)
        flash('Saved to cloud')
      }
      refreshDocs()
    } catch (e: any) { flash(String(e.message ?? e)) }
  }

  const openCloud = (d: Doc) => {
    src.current!.value = d.content
    src.current!.dispatchEvent(new Event('input'))
    setDocId(d.id)
  }

  const removeCloud = async (d: Doc) => {
    try {
      await deleteDoc(d.id)
      if (docId === d.id) setDocId(null)
      refreshDocs()
    } catch (e: any) { flash(String(e.message ?? e)) }
  }

  const fmtDate = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
           d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }

  const cycleSkin = () => {
    const i = (skinI + 1) % SKINS.length
    setSkinI(i)
    const v = SKINS[i][0]
    document.documentElement.setAttribute('data-skin', v)
    document.documentElement.setAttribute('data-theme', v === '' ? 'light' : 'dark')
    api.current?.render()
  }

  return (
    <div id="app" className={folded ? 'folded' : ''}>
      <aside>
        <div className="hd">
          <h1>Diagram Workshop</h1>
          <p>Paste text on the left and generate a diagram on the right. Use indentation for hierarchy,
            <code style={{ fontFamily: 'var(--mono)' }}> A -&gt; B </code> for flow, and <code style={{ fontFamily: 'var(--mono)' }}>:</code> for notes.</p>
        </div>
        <div className="src">
          {/* Uncontrolled on purpose: the text is read and written through src.value directly, and the rename write-back relies on it */}
          <textarea id="src" spellCheck={false} ref={src}
            placeholder="Paste notes, meeting minutes, or product documentation…" />
          <div className="srcfoot">
            <label className="mini">Import file<input type="file" id="file" accept=".txt,.md,.markdown,.csv"
              onChange={e => api.current?.loadFile(e.target.files?.[0])} /></label>
            <button className="mini" id="sample" type="button"
              onClick={() => api.current?.sample()}>Next sample</button>
            <span className="sp"></span>
            <span className="parsed" id="parsed">
              {stats ? `${stats.nodes} nodes · ${stats.links} links · ${MODE_LABEL[stats.resolved] || stats.resolved}` : '—'}
            </span>
          </div>
        </div>

        {supabase && (
          <div className="cloud">
            <div className="cloud-hd">
              <span className="cloud-tt">Cloud documents</span>
              <span className="cloud-msg">{cloudMsg}</span>
              <span className="sp"></span>
              <button className="mini primary" type="button" onClick={saveCloud}>
                {docId ? 'Update' : 'Save'}</button>
            </div>
            <div className="cloud-list">
              {docs === null && <div className="cloud-empty">Loading…</div>}
              {docs !== null && docs.length === 0 &&
                <div className="cloud-empty">Nothing saved yet — hit Save to keep this document in the cloud.</div>}
              {docs?.map(d => (
                <div key={d.id} className={'doc-row' + (d.id === docId ? ' on' : '')}>
                  <button className="doc-open" type="button" onClick={() => openCloud(d)}>
                    <span className="doc-name">{d.title}</span>
                    <span className="doc-date">{fmtDate(d.updated_at)}</span>
                  </button>
                  <button className="doc-del" type="button" title="Delete"
                    onClick={() => removeCloud(d)}>×</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>

      <main>
        <canvas id="bg" ref={bg}></canvas>
        <svg id="board" ref={board}></svg>

        <div id="hintbox">
          Drag node = pin · Double-click = collapse<br />{' '}
          Wheel or <kbd>+</kbd>/<kbd>−</kbd> = zoom · Drag canvas = pan · <kbd>Esc</kbd> = deselect
        </div>

        <div id="top">
          <button className="mini" id="skin" type="button" onClick={cycleSkin}>{SKINS[skinI][1]}</button>
          <button className="mini" id="fold" type="button"
            onClick={() => { setFolded(f => !f); setTimeout(() => api.current?.fit(), 340) }}>
            {folded ? 'Restore' : 'Fullscreen'}</button>
          <button className="mini" id="exp-svg" type="button" onClick={() => api.current?.expSvg()}>SVG</button>
          <button className="mini primary" id="exp-png" type="button" onClick={() => api.current?.expPng()}>PNG</button>
        </div>

        <div id="insp" className={sel ? 'on' : ''}>
          {sel && <>
            <h3><i style={{ background: sel.color }}></i>{sel.name}</h3>
            <div className="lv">Level {sel.level} · {sel.kids} children{sel.pin ? ' · pinned' : ''}</div>
            {sel.note ? <div className="note">{sel.note}</div> : null}
            <div className="note" style={{ color: 'var(--faint)', fontSize: '11px' }}>{sel.chain}</div>
            {/* key pinned to the node: the input is rebuilt only when the selection changes, so typing in it never loses the caret */}
            <input className="rename" id="rename" key={sel.id} defaultValue={sel.name}
              onInput={e => api.current?.rename((e.target as HTMLInputElement).value)} />
            <div className="acts">
              <button className="mini" id="a-unpin" type="button"
                onClick={() => api.current?.togglePin()}>{sel.pin ? 'Unpin' : 'Pin'}</button>
              <button className="mini" id="a-del" type="button"
                onClick={() => api.current?.removeSel()}>Delete</button>
            </div>
          </>}
        </div>

        <div id="bar">
          {MODES.map(([m, label]) => (
            <button key={m} className={'tb' + (mode === m ? ' on' : '')} data-mode={m} type="button"
              onClick={() => { setMode(m); api.current?.setMode(m) }}>{label}</button>
          ))}
          <span className="sep"></span>
          <button className="tb" id="tighter" type="button" onClick={() => api.current?.tighter()}>Tighter</button>
          <button className="tb" id="looser" type="button" onClick={() => api.current?.looser()}>Looser</button>
          <button className="tb" id="bigger" type="button" onClick={() => api.current?.bigger()}>Text＋</button>
          <button className="tb" id="smaller" type="button" onClick={() => api.current?.smaller()}>Text−</button>
          <span className="sep"></span>
          <button className="tb" id="zout" type="button" title="Zoom out" onClick={() => api.current?.zoomStep(1 / 1.25)}>−</button>
          <button className="tb" id="zlvl" type="button" title="Reset to 100%"
            onClick={() => api.current?.zoomReset()}>{Math.round(zoom * 100)}%</button>
          <button className="tb" id="zin" type="button" title="Zoom in" onClick={() => api.current?.zoomStep(1.25)}>＋</button>
          <span className="sep"></span>
          <button className="tb" id="relayout" type="button" onClick={() => api.current?.relayoutAll()}>Relayout</button>
          <button className="tb" id="fit" type="button" onClick={() => api.current?.fit()}>Fit</button>
        </div>
      </main>
    </div>
  )
}
