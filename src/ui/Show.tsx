import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { Entry, Game } from '../engine/types.ts'
import type { Shown } from '../stage/Strip.tsx'
import { prefs } from '../store.ts'
import { eventFor } from './events.ts'
import { Seal, webgl } from './kit.tsx'
import { sfx } from './sound.ts'

const Strip = lazy(() => import('../stage/Strip.tsx'))
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
const same = (a?: Entry, b?: Entry) => !!a && !!b && a.at === b.at && a.memo === b.memo

/**
 * Turns new ledger entries into moments, played one at a time at the top of the screen.
 * `voiced`: this device plays each moment's sound (sessions), instead of the button that caused it (admin mode).
 */
export default function Show({ game, entries, me, voiced }: { game: Game; entries: Entry[]; me: string | null; voiced: boolean }) {
  const [queue, setQueue] = useState<Shown[]>([])
  const [used, setUsed] = useState(false) // the strip's canvas is created on the first moment and then kept
  const prev = useRef<{ game: string; entries: Entry[] } | null>(null)
  const seq = useRef(0)

  useEffect(() => {
    const p = prev.current
    prev.current = { game: game.id, entries }
    if (!p || p.game !== game.id) return // first load or a new game: nothing just happened
    const show = prefs.get().scenes ?? voiced
    let add: Shown[] = []
    if (entries.length > p.entries.length && (!p.entries.length || same(entries[p.entries.length - 1], p.entries.at(-1)))) {
      add = entries.slice(p.entries.length).flatMap(e => { const ev = eventFor(game, e, me); return ev ? [{ ...ev, id: ++seq.current }] : [] })
    } else if (entries.length < p.entries.length && (!entries.length || same(entries.at(-1), p.entries[entries.length - 1]))) {
      const gone = p.entries.slice(entries.length)
      const headline = gone.length === 1 ? `Undone: ${gone[0].memo}` : `Rewound ${gone.length} entries`
      add = [{ kind: 'undo', big: false, from: null, to: null, actor: null, amount: 0, cell: null, view: 'watch', sound: 'undo', headline, memo: headline, id: ++seq.current }]
    }
    if (!add.length) return
    if (!show) { if (voiced) add.forEach(ev => sfx(ev.sound)); return }
    setUsed(true)
    setQueue(q => [...q, ...add])
  }, [game, entries, me, voiced])

  const current = queue[0] ?? null
  const skip = () => setQueue(q => q.slice(1))
  useEffect(() => {
    if (!current) return
    if (voiced) sfx(current.sound)
    // a fast player cannot stack up a minute of moments: a backlog plays quickly
    const t = setTimeout(skip, queue.length > 3 ? 700 : 1600)
    return () => clearTimeout(t)
  }, [current?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!used) return null
  const cast = current ? [...new Set([current.from, current.to, current.actor])].flatMap(id => game.players.filter(p => p.id === id)).slice(0, 2) : []
  const three = webgl && !reducedMotion.matches
  return (
    <div className={`strip${current ? ' on' : ''}${current?.view === 'me-paid' ? ' paid' : current?.view === 'me-got' ? ' got' : ''}`}
      onClick={skip} role="status" aria-live="polite">
      <div className="strip-stage" aria-hidden="true">
        {three ? <Suspense fallback={null}><Strip game={game} ev={current} /></Suspense>
          : current && <span className="strip-seals">{cast.map(p => <Seal key={p.id} player={p} size={64} />)}</span>}
      </div>
      {current && (
        <p className="strip-text">
          <strong>{current.headline}</strong>
          {current.headline !== current.memo && <span>{current.memo}</span>}
        </p>
      )}
    </div>
  )
}
