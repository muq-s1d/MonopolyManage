import { useRef, useState } from 'react'
import { sessions, store, useSnap } from '../store.ts'
import { useUI } from './ctx.ts'
import { Seal } from './kit.tsx'
import { LatestNotes } from './WhatsNew.tsx'

const ready = !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_KEY
const NOT_SET_UP = 'Sessions are not set up on this copy of the site. Everything else works as usual.'

export default function Lobby() {
  const ui = useUI()
  const snap = useSnap()
  const file = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
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
      <section className="lobby-card">
        <p className="eyebrow">Est. at your kitchen table</p>
        <h1 className="display lobby-title">The Counting<br />House</h1>
        <p className="lobby-lede">
          The bank for your physical board game nights. Roll real dice, move real pieces, and let the ledger handle every dollar,
          deed and house.
        </p>
        <div className="diamond-rule" aria-hidden="true">◆</div>
        <div className="lobby-actions">
          {snap && (
            <button className="plaque big" onClick={() => ui.go('table')}>
              Resume round {snap.state.round}
            </button>
          )}
          {saved && <button className="plaque big" disabled={busy} onClick={() => host(true)}>Resume session {saved.code}</button>}
          <button className={snap ? 'ghost' : 'plaque big'} onClick={() => ui.go('setup')}>Open a new ledger</button>
          <button className="ghost" disabled={busy} onClick={() => host(false)}>{busy ? 'Opening the room' : 'Host a session'}</button>
          {seat && ready && <button className="plaque big" onClick={() => { location.hash = `join=${seat.code}`; ui.go('join') }}>Rejoin session {seat.code}</button>}
          <button className="ghost" onClick={() => (ready ? ui.go('join') : setError(NOT_SET_UP))}>Join a session</button>
          <button className="ghost" onClick={() => file.current?.click()}>Restore a backup</button>
          <button className="ghost" onClick={() => ui.go('editor')}>Design a board</button>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={e => importFile(e.target.files?.[0])} />
        </div>
        {error && <p className="error-text" role="alert">{error}</p>}
        <LatestNotes onMore={ui.notes} />
        {snap && (
          <div className="lobby-players" aria-label="Players in the saved game">
            {snap.game.players.map(p => (
              <span key={p.id} className="lobby-player"><Seal player={p} size={34} />{p.name}</span>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
