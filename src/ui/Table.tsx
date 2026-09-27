import { lazy, Suspense, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { BookOpen, CircleCheck, Dice5, Menu, Moon, Sun, Undo2 } from 'lucide-react'
import { active, money, nextPlayer } from '../engine/engine.ts'
import type { Game, State } from '../engine/types.ts'
import { prefs, store, type Snap } from '../store.ts'
import BoardMap, { reachable } from './BoardMap.tsx'
import { useUI } from './ctx.ts'
import { Money, PhoneMark, readable, Seal, webgl } from './kit.tsx'
import Inbox from './Inbox.tsx'
import type { HostLive } from '../net/live.ts'
import { dueLoans } from '../engine/deals.ts'
import AuctionDock from './Auction.tsx'

const Stage = lazy(() => import('../stage/Stage.tsx'))
const narrowQuery = matchMedia('(max-width: 980px)') // the one column layout in screens.css
const onNarrow = (f: () => void) => { narrowQuery.addEventListener('change', f); return () => narrowQuery.removeEventListener('change', f) }

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
                <span className="rail-name">{p.name}{ui.live?.kind === 'host' && <PhoneMark live={ui.live} pid={p.id} />}</span>
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

/**
 * The current player's turn, one step at a time: tap where the roll landed, answer "was it a double?", pass the dice.
 * `onOverride`: the host screen may record another landing after the roll's one is used, to fix a wrong tap.
 */
export function TurnPanel({ game, state, onOverride, board }: { game: Game; state: State; onOverride?: () => void; board?: ReactNode }) {
  const ui = useUI()
  const p = game.players.find(x => x.id === state.turn)!
  const next = game.players.find(x => x.id === nextPlayer(game, state))!
  const jailed = state.jailed[p.id]
  const moving = !jailed && state.moves > 0
  const landed = !jailed && state.moves === 0
  const here = game.board.cells[state.pos[p.id]]
  const endTurn = <button className="plaque big end-turn" onClick={() => ui.act('endTurn')}>End turn <small>{next.name} is next</small></button>

  return (
    <section className="panel turn" aria-labelledby="turn-h">
      <p className="eyebrow">Round {state.round}</p>
      <h2 id="turn-h" className="display turn-title"><span className="turn-name" style={{ ['--pc' as string]: readable(p.color) }}>{p.name}</span>&rsquo;s turn</h2>

      {jailed && state.jailTurns[p.id] === 0 && (
        <p className="jail-box" role="status"><strong>Sent to jail.</strong> The turn is over.</p>
      )}
      {jailed && state.jailTurns[p.id] > 0 && (
        <div className="jail-box" role="status">
          <p><strong>In jail</strong>, try {state.jailTurns[p.id]} of 3.{state.jailTurns[p.id] >= 3 ? ' No doubles means paying the fine.' : ''}</p>
          <div className="btn-row">
            <button className="ghost" onClick={() => ui.act('leaveJail', p.id, 'roll')}>Rolled doubles</button>
            <button className="ghost" onClick={() => ui.act('leaveJail', p.id, 'fine')}>Pay {money(game.board, game.board.jailFine)} fine</button>
            <button className="ghost" disabled={!state.jailCards[p.id]} onClick={() => ui.act('leaveJail', p.id, 'card')}>Use jail card</button>
          </div>
        </div>
      )}

      {dueLoans(state, p.id).map(l => {
        const lender = game.players.find(x => x.id === l.lender)!
        return (
          <div key={l.id} className="due-box" role="status">
            <p><strong>Loan from {lender.name} is due:</strong> <span className="num">{money(game.board, l.repay)}</span></p>
            <div className="btn-row">
              <button className="ghost" onClick={() => ui.act('repayLoan', l.id)}>Repay {money(game.board, l.repay)}</button>
              <button className="ghost" onClick={() => ui.open({ kind: 'portfolio', player: p.id })}>Raise money</button>
            </div>
          </div>
        )
      })}

      {moving && (
        <div className="step" role="status">
          <Dice5 size={28} aria-hidden="true" />
          <p><strong>{state.doubles ? 'Doubles! Roll again' : 'Roll the dice'}, move {p.id === ui.me ? 'your' : `${p.name}'s`} piece, then tap where it lands.</strong></p>
        </div>
      )}
      {moving && state.doubles === 2 && (
        <div className="jail-box">
          <p>Two doubles. A third one means jail.</p>
          <button className="ghost danger" onClick={() => ui.act('rollDoubles', p.id)}>Rolled a third double</button>
        </div>
      )}
      {board}
      {landed && (
        <p className="step done" role="status"><CircleCheck size={24} aria-hidden="true" /> <span>Landed on <strong>{here.name}</strong></span></p>
      )}

      {!moving && (
        <div className="turn-end">
          {landed && state.doubles < 2 ? (
            <>
              <p className="turn-ask">Was that roll a double?</p>
              <button className="ghost big" onClick={() => ui.act('rollDoubles', p.id)}>Yes, roll again</button>
              {endTurn}
            </>
          ) : endTurn}
        </div>
      )}
      {landed && onOverride && <button className="link-btn" onClick={onOverride}>Wrong square? Undo it, or record another landing</button>}

      <div className="turn-tools" role="group" aria-label="Any time">
        <button className="ghost" onClick={() => ui.open({ kind: 'portfolio', player: p.id })}>Build or mortgage</button>
        <button className="ghost" onClick={() => ui.open({ kind: 'deals' })}>Deals</button>
        <button className="ghost" onClick={() => ui.open({ kind: 'payment' })}>Pay or collect</button>
      </div>
    </section>
  )
}

function HostAuction({ live, game, state }: { live: HostLive; game: Game; state: State }) {
  const ui = useUI()
  const v = useSyncExternalStore(live.subscribe, () => live.host.version)
  const a = live.host.auction
  const ends = useMemo(() => Date.now() + (a?.ms ?? 0), [v, a?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!a) return null
  const phoned = live.host.devices
  const bid = (pid: string, n: number | null) => { const why = live.host.bid(pid, a.id, n); if (why) ui.say(why) }
  return <AuctionDock game={game} state={state} auction={{ ...a, ends }} me={null}
    proxies={game.players.filter(p => !(p.id in phoned)).map(p => p.id)} onProxyBid={bid} onStop={() => live.host.cancelAuction()} />
}

function HostInbox({ live, game }: { live: HostLive; game: Game }) {
  const ui = useUI()
  useSyncExternalStore(live.subscribe, () => live.host.version)
  return <Inbox game={game} offers={live.host.offers} me={null} admin answer={() => {}}
    decide={(id, yes) => {
      const why = live.host.decide(id, yes)
      if (why) return ui.say(why)
      const s = store.get()
      if (s && active(s.game, s.state).length <= 1) ui.go('end') // an approved last bankruptcy ends the game, as it does on this screen
    }} />
}

export default function Table({ snap }: { snap: NonNullable<Snap> }) {
  const ui = useUI()
  const { game, state, entries } = snap
  const last = entries.at(-1)
  const turns = entries.filter(e => e.ops.some(o => o.op === 'turn')).length
  // the host's override: one more landing after the roll's own, to fix a wrong tap. It lasts until the next entry.
  const [extra, setExtra] = useState(-1)
  const moving = !state.jailed[state.turn] && (state.moves > 0 || extra === entries.length)
  const cardMove = !!last?.ops.some(o => o.op === 'moves')
  // one column (tablets, phones): the board sits in the turn panel, right under "tap where it lands"
  const narrow = useSyncExternalStore(onNarrow, () => narrowQuery.matches)
  const board = (
    <BoardMap game={game} state={state} onPick={cell => ui.open({ kind: 'cell', cell, landed: moving })}
      reach={moving && !cardMove ? reachable(game, state, state.turn) : undefined}
      hint={moving ? `Tap where ${game.players.find(p => p.id === state.turn)!.name} landed` : undefined}
      stage={webgl ? <Suspense fallback={null}><Stage game={game} state={state} entries={entries} /></Suspense> : undefined} />
  )

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.metaKey || e.ctrlKey || e.altKey || t.closest('input, textarea, select, dialog')) return
      if (e.key === 'n') ui.act('endTurn')
      else if (e.key === 'u') ui.undo()
    }
    addEventListener('keydown', key)
    return () => removeEventListener('keydown', key)
  }, [ui])

  return (
    <div className="table">
      <header className="topbar">
        <p className="display topbar-mark">The Counting House</p>
        <p className="topbar-info muted">{ui.live && <>Session <span className="num">{ui.live.code}</span>, </>}<span className="num">{game.board.name}</span>, round <span className="num">{state.round}</span></p>
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
          {ui.live?.kind === 'host' && <HostInbox live={ui.live} game={game} />}
          <TurnPanel key={`${state.turn}:${turns}`} game={game} state={state} board={narrow ? board : undefined} onOverride={() => { setExtra(entries.length); ui.say('Undo the wrong landing below, or tap the square to record another one') }} />
        </div>
        {!narrow && board}
      </main>

      {ui.live?.kind === 'host' && <HostAuction live={ui.live} game={game} state={state} />}
      <footer className="ticker" aria-live="polite">
        <span className="eyebrow">Last entry</span>
        <span className="ticker-text">{last ? last.memo : 'The ledger is open. Nothing recorded yet.'}</span>
        <button className="ghost" disabled={!last} onClick={ui.undo}><Undo2 size={16} /> Undo</button>
      </footer>
    </div>
  )
}
