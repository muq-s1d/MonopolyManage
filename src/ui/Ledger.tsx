import { useState } from 'react'
import { Undo2 } from 'lucide-react'
import type { Entry } from '../engine/types.ts'
import { store, type Snap } from '../store.ts'
import { useUI } from './ctx.ts'
import { Seal } from './kit.tsx'
import { sfx } from './sound.ts'

const involves = (e: Entry, id: string, name: string) =>
  e.memo.includes(name) || e.ops.some(o =>
    ('player' in o && o.player === id) || ('owner' in o && o.owner === id) ||
    (o.op === 'transfer' && (o.from === id || o.to === id)))

const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

export default function Ledger({ snap }: { snap: NonNullable<Snap> }) {
  const ui = useUI()
  const { game, entries } = snap
  const [filter, setFilter] = useState<string | null>(null)
  const [rewindTo, setRewindTo] = useState<number | null>(null)
  const fp = game.players.find(p => p.id === filter)
  const rows = entries.map((e, i) => ({ e, i })).filter(({ e }) => !fp || involves(e, fp.id, fp.name)).reverse()

  return (
    <main className="ledger">
      <header className="setup-head">
        <button className="ghost" onClick={() => ui.go('table')}>Back to the table</button>
        <div>
          <p className="eyebrow">{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</p>
          <h1 className="display">The Ledger</h1>
        </div>
        <button className="ghost" disabled={!entries.length} onClick={ui.undo}><Undo2 size={16} /> Undo last</button>
      </header>

      <div className="chips" role="group" aria-label="Filter by player">
        <button className="ghost" aria-pressed={!filter} onClick={() => setFilter(null)}>Everyone</button>
        {game.players.map(p => (
          <button key={p.id} className="ghost" aria-pressed={filter === p.id} onClick={() => setFilter(p.id)}>
            <Seal player={p} size={22} initial={false} /> {p.name}
          </button>
        ))}
      </div>

      <p className="muted ledger-help">Every action is written here in order. Undo removes the newest entry. Rewind removes every entry after the one you pick, and balances are recalculated from what is left.
        On the stage, coins fly from payer to payee: one coin for {game.board.currency}10, and one more each time the amount doubles, up to ten. Creatures wearing matching sashes are allies in a pact.</p>

      <ol className="ledger-list">
        {rows.map(({ e, i }) => (
          <li key={i} className="ledger-row">
            <span className="num ledger-no">{i + 1}</span>
            <span className="ledger-memo">{e.memo}</span>
            <time className="muted small" dateTime={new Date(e.at).toISOString()}>{time(e.at)}</time>
            {i < entries.length - 1 && (
              rewindTo === i ? (
                <span className="confirm-inline" role="alert">
                  Remove {entries.length - 1 - i} later {entries.length - 1 - i === 1 ? 'entry' : 'entries'}?
                  <button className="ghost" onClick={() => setRewindTo(null)}>Cancel</button>
                  <button className="plaque danger" onClick={() => { store.rewind(i + 1); sfx('undo'); setRewindTo(null); ui.say(`Rewound to entry ${i + 1}`) }}>Rewind</button>
                </span>
              ) : <button className="ghost" onClick={() => setRewindTo(i)}>Rewind to here</button>
            )}
          </li>
        ))}
        {rows.length === 0 && <li className="muted">Nothing recorded {fp ? `for ${fp.name} ` : ''}yet.</li>}
      </ol>
      {entries.length > 0 && !fp && (
        <p className="muted small">Want to start over completely? Rewinding past the first entry is done from the menu by deleting the game.</p>
      )}
    </main>
  )
}
