import { lazy, Suspense, useEffect, useState } from 'react'
import { BookOpen, Menu, Moon, Sun, Undo2 } from 'lucide-react'
import { endTurn, goToJail, leaveJail, money, nextPlayer, passGo } from '../engine/engine.ts'
import type { Game, State } from '../engine/types.ts'
import { prefs, store, type Snap } from '../store.ts'
import BoardMap from './BoardMap.tsx'
import { useUI } from './ctx.ts'
import { Money, readable, Seal, webgl } from './kit.tsx'
import { dueLoans, repayLoan } from '../engine/deals.ts'

const Stage = lazy(() => import('../stage/Stage.tsx'))

export function ThemeToggle() {
  const [dark, setDark] = useState(() => {
    const t = document.documentElement.dataset.theme
    return t ? t === 'dark' : !matchMedia('(prefers-color-scheme: light)').matches
  })
  const flip = () => {
    const theme = dark ? 'light' : 'dark'
    document.documentElement.dataset.theme = theme
    prefs.set({ theme })
    setDark(!dark)
  }
  return (
    <button className="ghost icon-btn" onClick={flip} aria-label={dark ? 'Switch to paper theme' : 'Switch to felt theme'}>
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}

function PlayerRail({ game, state }: { game: Game; state: State }) {
  const ui = useUI()
  const owes = (pid: string) => Object.values(state.loans).reduce((t, l) => t + (l.borrower === pid ? l.repay : 0), 0)
  return (
    <ol className="rail" data-many={game.players.length >= 5} aria-label="Players in turn order">
      {game.players.map(p => {
        const deeds = state.owner.filter(o => o === p.id).length
        const out = state.bankrupt[p.id]
        return (
          <li key={p.id}>
            <button className={`rail-card${state.turn === p.id ? ' active' : ''}${out ? ' out' : ''}`}
              onClick={() => ui.open({ kind: 'portfolio', player: p.id })}
              aria-label={`${p.name}, ${money(game.board, state.cash[p.id])} cash, ${deeds} ${deeds === 1 ? 'deed' : 'deeds'}${state.jailed[p.id] ? ', in jail' : ''}${out ? ', bankrupt' : ''}. Open portfolio.`}>
              <Seal player={p} size={52} />
              <span className="rail-text">
                <span className="rail-name">{p.name}</span>
                <Money value={state.cash[p.id]} cur={game.board.currency} className="rail-cash" />
                <span className="rail-tags">
                  {out ? <span className="tag danger">Bankrupt</span> : <span className="tag">{deeds} {deeds === 1 ? 'deed' : 'deeds'}</span>}
                  {state.jailed[p.id] && <span className="tag danger">In jail</span>}
                  {state.jailCards[p.id] > 0 && <span className="tag">{state.jailCards[p.id]} jail {state.jailCards[p.id] === 1 ? 'card' : 'cards'}</span>}
                  {Object.values(state.pacts).some(x => x.members.includes(p.id)) && <span className="tag pact-tag">Pact</span>}
                  {owes(p.id) > 0 && <span className="tag danger">Owes {money(game.board, owes(p.id))}</span>}
                </span>
              </span>
              {state.turn === p.id && <span className="rail-turn eyebrow">Turn</span>}
            </button>
          </li>
        )
      })}
    </ol>
  )
}

function TurnPanel({ game, state }: { game: Game; state: State }) {
  const ui = useUI()
  const p = game.players.find(x => x.id === state.turn)!
  const next = game.players.find(x => x.id === nextPlayer(game, state))!
  const [doubles, setDoubles] = useState(0) // reset by the key on TurnPanel when the turn changes
  const jailed = state.jailed[p.id]

  return (
    <section className="panel turn" aria-labelledby="turn-h">
      <p className="eyebrow">Round {state.round}</p>
      <h2 id="turn-h" className="display turn-title"><span className="turn-name" style={{ ['--pc' as string]: readable(p.color) }}>{p.name}</span>&rsquo;s turn</h2>

      {jailed && state.jailTurns[p.id] === 0 && (
        <p className="jail-box" role="status"><strong>Sent to jail.</strong> Going to jail ends the turn, so pass the dice on.</p>
      )}
      {jailed && state.jailTurns[p.id] > 0 && (
        <div className="jail-box" role="status">
          <p><strong>In jail</strong>, turn {state.jailTurns[p.id]} of 3. {state.jailTurns[p.id] >= 3 ? 'Without doubles this turn, the fine must be paid.' : 'Roll for doubles, pay the fine, or use a card.'}</p>
          <div className="btn-row">
            <button className="ghost" onClick={() => ui.act(leaveJail(game, state, p.id, 'roll'))}>Rolled doubles</button>
            <button className="ghost" onClick={() => ui.act(leaveJail(game, state, p.id, 'fine'))}>Pay {money(game.board, game.board.jailFine)} fine</button>
            <button className="ghost" disabled={!state.jailCards[p.id]} onClick={() => ui.act(leaveJail(game, state, p.id, 'card'))}>Use jail card</button>
          </div>
        </div>
      )}

      {dueLoans(state, p.id).map(l => {
        const lender = game.players.find(x => x.id === l.lender)!
        return (
          <div key={l.id} className="due-box" role="status">
            <p><strong>Loan from {lender.name} is due:</strong> <span className="num">{money(game.board, l.repay)}</span></p>
            <div className="btn-row">
              <button className="ghost" onClick={() => ui.act(repayLoan(game, state, l.id))}>Repay {money(game.board, l.repay)}</button>
              <button className="ghost" onClick={() => ui.open({ kind: 'portfolio', player: p.id })}>Raise money</button>
            </div>
          </div>
        )
      })}

      <div className="turn-grid">
        <button className="plaque big span-2" onClick={() => ui.open({ kind: 'landed' })}>Landed on</button>
        <button className="ghost" onClick={() => ui.act(passGo(game, p.id))}>Passed Go <span className="num">+{money(game.board, game.board.salary)}</span></button>
        <button className="ghost" onClick={() => ui.open({ kind: 'portfolio', player: p.id })}>Build or mortgage</button>
        <button className="ghost" onClick={() => ui.open({ kind: 'deals' })}>Deals</button>
        <button className="ghost" onClick={() => ui.open({ kind: 'payment' })}>Other payment</button>
      </div>

      <div className="turn-end">
        {doubles > 0 && doubles < 3 && <p className="muted small">{p.name} rolls again. Record the landing, then roll once more.</p>}
        {!jailed && <button className="ghost" onClick={() => setDoubles(d => d + 1)} disabled={doubles >= 3}>
          Rolled doubles{doubles ? <span className="num"> ({doubles} of 3)</span> : null}
        </button>}
        {doubles >= 3 ? (
          <button className="plaque danger big" onClick={() => { ui.act(goToJail(game, p.id, 'rolled doubles three times and went to jail')); setDoubles(0) }}>
            Third doubles: to jail
          </button>
        ) : (
          <button className="plaque big" onClick={() => ui.act(endTurn(game, state))}>Next: {next.name}</button>
        )}
      </div>
    </section>
  )
}

export default function Table({ snap }: { snap: NonNullable<Snap> }) {
  const ui = useUI()
  const { game, state, entries } = snap
  const last = entries.at(-1)

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.metaKey || e.ctrlKey || e.altKey || t.closest('input, textarea, select, dialog')) return
      const s = store.get()
      if (!s) return
      if (e.key === 'n') ui.act(endTurn(s.game, s.state))
      else if (e.key === 'u') ui.undo()
      else if (e.key === 'l') ui.open({ kind: 'landed' })
    }
    addEventListener('keydown', key)
    return () => removeEventListener('keydown', key)
  }, [ui])

  return (
    <div className="table">
      <header className="topbar">
        <p className="display topbar-mark">The Counting House</p>
        <p className="topbar-info muted"><span className="num">{game.board.name}</span>, round <span className="num">{state.round}</span></p>
        <nav className="topbar-actions" aria-label="Game">
          <button className="ghost" onClick={() => ui.go('ledger')} aria-label="Ledger"><BookOpen size={18} /> <span className="hide-sm">Ledger</span></button>
          <ThemeToggle />
          <button className="ghost icon-btn" onClick={() => ui.open({ kind: 'menu' })} aria-label="Menu"><Menu size={18} /></button>
        </nav>
      </header>

      <main className="table-main">
        <div className="table-left">
          <section className="stage-area" aria-label="Players">
            <div className="stage-burst sunburst" aria-hidden="true" />
            <PlayerRail game={game} state={state} />
          </section>
          <TurnPanel key={`${state.turn}:${entries.filter(e => e.ops.some(o => o.op === 'turn')).length}`} game={game} state={state} />
        </div>
        <BoardMap game={game} state={state} onPick={cell => ui.open({ kind: 'cell', cell })}
          stage={webgl ? <Suspense fallback={null}><Stage game={game} state={state} entries={entries} /></Suspense> : undefined} />
      </main>

      <footer className="ticker" aria-live="polite">
        <span className="eyebrow">Last entry</span>
        <span className="ticker-text">{last ? last.memo : 'The ledger is open. Nothing recorded yet.'}</span>
        <button className="ghost" disabled={!last} onClick={ui.undo}><Undo2 size={16} /> Undo</button>
      </footer>
    </div>
  )
}
