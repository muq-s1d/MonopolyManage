import { lazy, Suspense, useRef, useState } from 'react'
import { CircleHelp, Monitor, Smartphone } from 'lucide-react'
import { sessions, store, useSnap } from '../store.ts'
import { useUI } from './ctx.ts'
import { Seal, webgl } from './kit.tsx'
import { NewsPill } from './WhatsNew.tsx'

// the WebGL coil round How to use loads after the page, and never for reduced motion or without WebGL
const Coil = lazy(() => import('../stage/Coil.tsx'))
const still = matchMedia('(prefers-reduced-motion: reduce)').matches

const ready = !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_KEY
const NOT_SET_UP = 'Sessions are not set up on this copy of the site. Everything else works as usual.'

export default function Lobby() {
  const ui = useUI()
  const snap = useSnap()
  const file = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const guide = useRef<HTMLButtonElement>(null)
  const saved = snap ? sessions.host() : null
  const seat = sessions.phone()

  // the session code is a lazy chunk: admin mode never downloads it
  const host = async (resume: boolean) => {
    if (!ready) return setError(NOT_SET_UP)
    setBusy(true); setError('')
    try {
      const { hostSession } = await import('../net/live.ts')
      ui.setLive(await hostSession(resume))
      ui.go(resume ? 'table' : 'setup')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  const importFile = async (f: File | undefined) => {
    if (!f) return
    const err = store.importJson(await f.text())
    if (err) setError(err)
    else ui.go('table')
  }

  return (
    <main className="lobby">
      <div className="lobby-burst sunburst" aria-hidden="true" />
      {webgl && !still && <Suspense fallback={null}><Coil target={guide} /></Suspense>}
      <section className="lobby-card">
        <p className="eyebrow">Est. at your kitchen table</p>
        <h1 className="display lobby-title">The Counting House</h1>
        <p className="lobby-lede">
          The bank for your physical board game nights. Roll real dice, move real pieces, and let the ledger handle every dollar,
          deed and house.
        </p>
        <NewsPill onOpen={ui.notes} />

        <div className="lobby-groups">
          <section className="lobby-group" aria-labelledby="play-one">
            <h2 id="play-one" className="eyebrow"><Monitor size={15} aria-hidden="true" /> One screen</h2>
            {snap && !saved && <button className="plaque big" onClick={() => ui.go('table')}>Resume round {snap.state.round}</button>}
            <button className={snap && !saved ? 'ghost' : 'plaque big'} onClick={() => ui.go('setup')}>Open a new ledger</button>
            {snap && (
              <div className="lobby-players" aria-label="Players in the saved game">
                {snap.game.players.map(p => <span key={p.id} className="lobby-player"><Seal player={p} size={24} initial={false} />{p.name}</span>)}
              </div>
            )}
          </section>
          <section className="lobby-group" aria-labelledby="play-phones">
            <h2 id="play-phones" className="eyebrow"><Smartphone size={15} aria-hidden="true" /> Everyone’s phones</h2>
            {saved && <button className="plaque big" disabled={busy} onClick={() => host(true)}>Resume session {saved.code}</button>}
            {seat && ready && <button className="plaque big" onClick={() => { location.hash = `join=${seat.code}`; ui.go('join') }}>Rejoin session {seat.code}</button>}
            <div className="lobby-pair">
              <button className="ghost" disabled={busy} onClick={() => host(false)}>{busy ? 'Opening' : 'Host a session'}</button>
              <button className="ghost" onClick={() => (ready ? ui.go('join') : setError(NOT_SET_UP))}>Join a session</button>
            </div>
          </section>
          <section className="lobby-group" aria-labelledby="more">
            <h2 id="more" className="eyebrow">More</h2>
            <div className="lobby-pair">
              <button className="ghost" onClick={() => file.current?.click()}>Restore a backup</button>
              <button className="ghost" onClick={() => ui.go('editor')}>Design a board</button>
            </div>
            <input ref={file} type="file" accept="application/json,.json" hidden onChange={e => importFile(e.target.files?.[0])} />
          </section>
        </div>
        {error && <p className="error-text" role="alert">{error}</p>}

        <button ref={guide} className="plaque big guide-btn" onClick={() => ui.go('guide')}><CircleHelp size={20} aria-hidden="true" /> How to use</button>
      </section>
    </main>
  )
}
