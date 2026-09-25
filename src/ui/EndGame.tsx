import { lazy, Suspense, useState } from 'react'
import { money, netWorth } from '../engine/engine.ts'
import { download, store, type Snap } from '../store.ts'
import { useUI } from './ctx.ts'
import { Seal, webgl } from './kit.tsx'

const Podium = lazy(() => import('../stage/Podium.tsx'))

export default function EndGame({ snap }: { snap: NonNullable<Snap> }) {
  const ui = useUI()
  const { game, state } = snap
  const [confirm, setConfirm] = useState(false)
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

      <section className="panel">
        <table className="standings">
          <caption className="muted">
            Net worth follows the official rule for timed games: cash, plus every deed at its printed price (half if mortgaged),
            plus houses and hotels at what they cost to build.
          </caption>
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
