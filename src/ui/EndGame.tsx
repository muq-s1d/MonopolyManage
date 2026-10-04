import { lazy, Suspense, useEffect, useMemo, useState, type PointerEvent } from 'react'
import { money, netWorth } from '../engine/engine.ts'
import { highlights, leader, type Highlights } from '../engine/stats.ts'
import type { Game } from '../engine/types.ts'
import { download, store, type Snap } from '../store.ts'
import { useUI } from './ctx.ts'
import { readable, Seal, webgl } from './kit.tsx'
import { sfx } from './sound.ts'

const Podium = lazy(() => import('../stage/Podium.tsx'))

export default function EndGame({ snap }: { snap: NonNullable<Snap> }) {
  const ui = useUI()
  const { game, state, entries } = snap
  const h = useMemo(() => highlights(game, entries), [game, entries])
  const [confirm, setConfirm] = useState(false)
  useEffect(() => sfx('victory'), [])
  const m = (n: number) => money(game.board, n)
  const ranked = game.players
    .map(p => ({ p, w: netWorth(game, state, p.id), out: state.bankrupt[p.id] }))
    .toSorted((a, b) => Number(a.out) - Number(b.out) || b.w.total - a.w.total)
  const winner = ranked[0]
  const standing = ranked.filter(r => !r.out).length

  return (
    <main className="endgame">
      <header className="setup-head">
        <button className="ghost" onClick={() => ui.go('table')}>Back to the table</button>
        <div>
          <p className="eyebrow">{standing === 1 ? 'Last one standing' : `Standings after round ${state.round}`}</p>
          <h1 className="display">{standing === 1 ? `${winner.p.name} owns the town` : 'The standings'}</h1>
        </div>
        <span />
      </header>

      {webgl && (
        <Suspense fallback={<div className="podium-canvas" />}>
          <Podium ranked={ranked.map(r => ({ player: r.p, bankrupt: r.out }))} />
        </Suspense>
      )}
      <ol className={`podium${webgl ? ' flat' : ''}`} aria-label="Top three">
        {ranked.slice(0, 3).map((r, i) => (
          <li key={r.p.id} className={`podium-step step-${i + 1}`}>
            <Seal player={r.p} size={i === 0 ? 104 : 76} />
            <strong>{r.p.name}</strong>
            <span className="num podium-worth">{m(r.w.total)}</span>
            <span className="podium-plinth num">{i + 1}</span>
          </li>
        ))}
      </ol>

      <HighlightCards game={game} h={h} />
      <WorthPanels game={game} h={h} />

      <section className="panel">
        <table className="standings">
          <caption className="muted">Net worth: cash, deeds at printed price (half if mortgaged), buildings at cost.</caption>
          <thead>
            <tr><th scope="col">Rank</th><th scope="col">Player</th><th scope="col">Cash</th><th scope="col">Deeds</th><th scope="col">Buildings</th><th scope="col">Net worth</th></tr>
          </thead>
          <tbody>
            {ranked.map((r, i) => (
              <tr key={r.p.id} className={r.out ? 'out' : ''}>
                <td className="num">{i + 1}</td>
                <th scope="row"><span className="standings-name"><Seal player={r.p} size={28} initial={false} />{r.p.name}{r.out && <span className="tag danger">Bankrupt</span>}</span></th>
                <td className="num">{m(r.w.cash)}</td>
                <td className="num">{m(r.w.property)}</td>
                <td className="num">{m(r.w.buildings)}</td>
                <td className="num strong">{m(r.w.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="btn-row center">
        <button className="ghost" onClick={() => download(`counting-house-${new Date().toISOString().slice(0, 10)}.json`, store.exportJson())}>Download a backup</button>
        {!confirm
          ? <button className="plaque big" onClick={() => setConfirm(true)}>Close the books</button>
          : (
            <span className="confirm-inline" role="alert">
              This deletes the game from this browser.
              <button className="ghost" onClick={() => setConfirm(false)}>Keep it</button>
              <button className="plaque danger" onClick={() => { store.clear(); ui.go('setup') }}>Close and start fresh</button>
            </span>
          )}
      </div>
    </main>
  )
}

/** The game's records, one card each; a record nobody set is left out. */
function HighlightCards({ game, h }: { game: Game; h: Highlights }) {
  const m = (n: number) => money(game.board, n)
  const who = (id: string) => game.players.find(p => p.id === id)!
  const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`)
  const rent = leader(h.rent), go = leader(h.go), jail = leader(h.jail)
  const cards = [
    rent && { label: 'Landlord', pid: rent.id, text: `collected ${m(rent.n)} in rent` },
    h.buy && { label: 'Big spender', pid: h.buy.pid, text: `paid ${m(h.buy.amount)} for ${game.board.cells[h.buy.cell].name}` },
    h.payment && { label: 'Biggest payday', pid: h.payment.to, text: `got ${m(h.payment.amount)} from ${who(h.payment.from).name} in one go` },
    go && { label: 'Round the board', pid: go.id, text: `passed Go ${times(go.n)}` },
    jail && { label: 'Jailbird', pid: jail.id, text: `went to jail ${times(jail.n)}` },
  ].filter(c => !!c)
  if (!cards.length) return null
  return (
    <section className="highlights" aria-label="Highlights">
      {cards.map(c => (
        <article key={c.label} className="panel highlight">
          <p className="eyebrow">{c.label}</p>
          <p className="highlight-who"><Seal player={who(c.pid)} size={36} /><strong>{who(c.pid).name}</strong></p>
          <p className="muted">{c.text}</p>
        </article>
      ))}
    </section>
  )
}

/**
 * Net worth round by round, one small panel per player on one shared scale. Small multiples, not one chart of
 * overlapping lines: players pick their own colours, and some pairs are hard to tell apart for colour blind eyes,
 * so each panel is named and the colour is only decoration. The numbers are in the table underneath.
 */
function WorthPanels({ game, h }: { game: Game; h: Highlights }) {
  const [at, setAt] = useState<number | null>(null)
  if (h.worth.length < 3) return null // a couple of points tell nothing
  const m = (n: number) => money(game.board, n)
  const top = Math.max(1, ...h.worth.flatMap(w => Object.values(w.values)))
  const W = 240, H = 72, last = h.worth.length - 1
  const x = (i: number) => (i / last) * W, y = (v: number) => H - (Math.max(0, v) / top) * (H - 6) - 2
  const label = (i: number) => (h.worth[i].round === 0 ? 'the start' : i === last ? 'now' : `round ${h.worth[i].round}`)
  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setAt(Math.round(((e.clientX - r.left) / r.width) * last))
  }
  return (
    <section className="panel networth" aria-labelledby="worth-h">
      <div className="section-head">
        <h2 id="worth-h" className="display">Net worth, round by round</h2>
        <p className="muted small">Every panel runs from {m(0)} to {m(top)}{at !== null ? `, showing ${label(at)}` : ''}</p>
      </div>
      <div className="worth-grid">
        {game.players.map(p => {
          const vals = h.worth.map(w => w.values[p.id])
          const peak = vals.indexOf(Math.max(...vals)), i = at ?? last
          const line = vals.map((v, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)} ${y(v).toFixed(1)}`).join('')
          return (
            <figure key={p.id} className="worth-panel" style={{ ['--pc' as string]: readable(p.color) }}>
              <figcaption><Seal player={p} size={24} initial={false} /><strong>{p.name}</strong><span className="num">{m(vals[i])}</span></figcaption>
              <svg className="worth-chart" viewBox={`0 0 ${W} ${H}`} role="img" onPointerMove={pick} onPointerLeave={() => setAt(null)}
                aria-label={`${p.name}: ${m(vals[0])} at the start, ${m(vals[last])} now, highest ${m(vals[peak])} after ${label(peak)}`}>
                <line className="worth-base" x1="0" x2={W} y1={H - 2} y2={H - 2} />
                <path className="worth-area" d={`${line}L${W} ${H - 2}L0 ${H - 2}Z`} />
                <path className="worth-line" d={line} />
                {at !== null && <line className="worth-cross" x1={x(at)} x2={x(at)} y1="0" y2={H} />}
                <circle className="worth-dot" cx={x(i)} cy={y(vals[i])} r="4" />
              </svg>
            </figure>
          )
        })}
      </div>
      <details className="worth-table">
        <summary>Show the numbers</summary>
        <table className="standings">
          <thead><tr><th scope="col">When</th>{game.players.map(p => <th key={p.id} scope="col">{p.name}</th>)}</tr></thead>
          <tbody>
            {h.worth.map((w, k) => (
              <tr key={k}><th scope="row">{label(k)}</th>{game.players.map(p => <td key={p.id} className="num">{m(w.values[p.id])}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  )
}
