import { useRef, useState } from 'react'
import { store, useSnap } from '../store.ts'
import { useUI } from './ctx.ts'
import { Seal } from './kit.tsx'

export default function Lobby() {
  const ui = useUI()
  const snap = useSnap()
  const file = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')

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
          <button className={snap ? 'ghost' : 'plaque big'} onClick={() => ui.go('setup')}>Open a new ledger</button>
          <button className="ghost" onClick={() => file.current?.click()}>Restore a backup</button>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={e => importFile(e.target.files?.[0])} />
        </div>
        {error && <p className="error-text" role="alert">{error}</p>}
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
