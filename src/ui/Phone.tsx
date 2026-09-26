import { lazy, Suspense, useMemo, useState } from 'react'
import { Menu } from 'lucide-react'
import { active, money, name, netWorth } from '../engine/engine.ts'
import { isHostHere, type PhoneLive } from '../net/live.ts'
import type { View } from '../net/client.ts'
import { prefs } from '../store.ts'
import { useUI } from './ctx.ts'
import { Money, Seal, Sheet, Switch, webgl } from './kit.tsx'
import { involves } from './Ledger.tsx'
import Inbox from './Inbox.tsx'
import { sfx } from './sound.ts'
import { ThemeToggle, TurnPanel } from './Table.tsx'

const Stage = lazy(() => import('../stage/Stage.tsx'))

/** One player's own dashboard on their own phone. Everyone else's money is on the host screen. */
export default function Phone({ live, view, onLeave }: { live: PhoneLive; view: View; onLeave: () => void }) {
  const ui = useUI()
  const [menu, setMenu] = useState(false)
  const game = view.game!, state = view.state!, entries = view.entries
  const me = game.players.find(p => p.id === view.pid)!
  const w = netWorth(game, state, me.id)
  const m = (n: number) => money(game.board, n)
  const mine = useMemo(() => ({ ...game, players: [me] }), [game, me])
  const turns = entries.filter(e => e.ops.some(o => o.op === 'turn')).length
  const lines = entries.map((e, i) => ({ e, i })).filter(({ e }) => involves(e, me.id, me.name)).slice(-6).reverse()
  const deeds = state.owner.filter(o => o === me.id).length
  const over = active(game, state).length <= 1

  return (
    <div className="phone">
      <header className="phone-top">
        <span className={`dot${isHostHere(live.wire()) ? '' : ' off'}`} aria-hidden="true" />
        <span className="muted small">Session {live.code}, round <span className="num">{state.round}</span></span>
        <ThemeToggle />
        <button className="ghost icon-btn" onClick={() => setMenu(true)} aria-label="Menu"><Menu size={18} /></button>
      </header>

      <section className="phone-hero" aria-label="You">
        <div className="phone-stage">
          {webgl ? <Suspense fallback={<Seal player={me} size={96} />}><Stage game={mine} state={state} entries={entries} /></Suspense> : <Seal player={me} size={96} />}
        </div>
        <p className="phone-name">{me.name}{state.jailed[me.id] && <span className="tag danger">In jail</span>}{state.bankrupt[me.id] && <span className="tag danger">Bankrupt</span>}</p>
        <Money value={w.cash} cur={game.board.currency} className="phone-cash" />
        <p className="muted small">Net worth <strong className="num">{m(w.total)}</strong>: cash, {deeds} {deeds === 1 ? 'deed' : 'deeds'} at printed price, buildings at cost{w.loans ? `, and ${w.loans > 0 ? `${m(w.loans)} you are owed` : `${m(-w.loans)} you owe`}` : ''}.</p>
      </section>

      <Inbox game={game} offers={view.offers} me={me.id} admin={view.admin} answer={live.client.answer} decide={live.client.decide} />

      {over ? (
        <section className="panel phone-card"><h2 className="display">{name(game, active(game, state)[0]?.id ?? me.id)} owns the town</h2><p className="muted">The final standings are on the host screen.</p></section>
      ) : state.bankrupt[me.id] ? (
        <section className="panel phone-card"><h2 className="display">You are out of the game</h2><p className="muted">Keep watching the host screen for the finish.</p></section>
      ) : state.turn === me.id ? (
        <TurnPanel key={`${state.turn}:${turns}`} game={game} state={state} />
      ) : (
        <section className="panel phone-card" aria-labelledby="wait-h">
          <p className="eyebrow">Round {state.round}</p>
          <h2 id="wait-h" className="display">{name(game, state.turn)} is playing</h2>
          <p className="muted small">You can still build, mortgage, pay and make deals while you wait.</p>
          <div className="turn-grid">
            <button className="ghost" onClick={() => ui.open({ kind: 'portfolio', player: me.id })}>Build or mortgage</button>
            <button className="ghost" onClick={() => ui.open({ kind: 'deals' })}>Deals</button>
            <button className="ghost span-2" onClick={() => ui.open({ kind: 'payment' })}>Other payment</button>
          </div>
        </section>
      )}

      <section className="panel phone-card" aria-labelledby="mine-h">
        <div className="section-head">
          <h2 id="mine-h" className="display">Your activity</h2>
          <button className="ghost" disabled={!entries.length} onClick={ui.undo} title="The host approves every undo">Ask to undo</button>
        </div>
        <ol className="phone-lines">
          {lines.map(({ e, i }) => <li key={i}><span className="num muted">{i + 1}</span> {e.memo}</li>)}
          {!lines.length && <li className="muted">Nothing involving you yet.</li>}
        </ol>
      </section>

      {menu && <PhoneMenu onClose={() => setMenu(false)} onLeave={onLeave} code={live.code} />}
    </div>
  )
}

function PhoneMenu({ onClose, onLeave, code }: { onClose: () => void; onLeave: () => void; code: string }) {
  const [sound, setSound] = useState(prefs.get().sound !== false)
  const [scenes, setScenes] = useState(prefs.get().scenes ?? true)
  const [leaving, setLeaving] = useState(false)
  return (
    <Sheet eyebrow={`Session ${code}`} title="Menu" onClose={onClose}>
      <Switch label="Sound effects" help="Chimes for your own money and for big moments at the table." checked={sound} onChange={v => { prefs.set({ sound: v }); setSound(v); if (v) sfx('coin') }} />
      <Switch label="Cartoon scenes" help="A short animation for every notable moment at the table." checked={scenes} onChange={v => { prefs.set({ scenes: v }); setScenes(v) }} />
      <div className="menu-list">
        {!leaving ? <button className="ghost danger" onClick={() => setLeaving(true)}>Leave the session</button> : (
          <div className="confirm-box" role="alert">
            <p>Leave session {code}? Your seat stays at the table, and joining again with the same code on this phone takes it back.</p>
            <div className="btn-row">
              <button className="ghost" onClick={() => setLeaving(false)}>Stay</button>
              <button className="plaque danger" onClick={onLeave}>Leave</button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  )
}
