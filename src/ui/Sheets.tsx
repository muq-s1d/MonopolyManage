import { useMemo, useState, type ReactNode } from 'react'
import * as E from '../engine/engine.ts'
import * as D from '../engine/deals.ts'
import type { Board, Card, Cell, Game, Party, Player, State } from '../engine/types.ts'
import { download, prefs, store, type Snap } from '../store.ts'
import { shortName } from './BoardMap.tsx'
import { useUI, type SheetSpec } from './ctx.ts'
import { inkOn, Money, Pips, Seal, Sheet, Switch } from './kit.tsx'
import { sfx } from './sound.ts'
import DealsSheet from './Deals.tsx'

type Props = { game: Game; state: State }
const who = (g: Game, id: string) => g.players.find(p => p.id === id)!
const partyName = (g: Game, id: Party) => (id === 'bank' ? 'Bank' : id === 'pot' ? 'Free Parking pot' : who(g, id).name)

export default function Sheets({ spec, snap }: { spec: SheetSpec; snap: NonNullable<Snap> }) {
  const p = { game: snap.game, state: snap.state }
  switch (spec.kind) {
    case 'landed': return <LandedPicker {...p} />
    case 'cell': return <CellSheet {...p} cell={spec.cell} opts={spec.opts} />
    case 'card': return <CardSheet {...p} deck={spec.deck} />
    case 'nearest': return <NearestSheet {...p} type={spec.type} />
    case 'portfolio': return <Portfolio {...p} pid={spec.player} />
    case 'deals': return <DealsSheet {...p} tab={spec.tab} />
    case 'payment': return <PaymentSheet {...p} />
    case 'bankrupt': return <BankruptSheet {...p} pid={spec.player} creditor={spec.creditor} />
    case 'menu': return <MenuSheet {...p} />
  }
}

// ---------- landed picker ----------

function LandedPicker({ game, state }: Props) {
  const ui = useUI()
  const [q, setQ] = useState('')
  const b = game.board
  const current = who(game, state.turn)
  const hits = b.cells.map((c, i) => ({ c, i })).filter(({ c }) => c.name.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <Sheet eyebrow={`${current.name}'s move`} title="Where did they land?" onClose={ui.close}>
      <label className="field">
        <span>Search squares</span>
        <input className="input" autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Boardwalk, Chance, Tax" />
      </label>
      <ul className="cell-list">
        {hits.map(({ c, i }) => {
          const owner = state.owner[i]
          return (
            <li key={i}>
              <button className="cell-row" onClick={() => ui.open({ kind: 'cell', cell: i })}>
                <i className="swatch" style={{ background: b.groups.find(g => g.id === c.group)?.color ?? 'transparent' }} />
                <span>{c.name}</span>
                <span className="muted small">
                  {owner ? `${who(game, owner).name}${state.mortgaged[i] ? ', mortgaged' : ''}` : c.price ? E.money(b, c.price) : c.kind === 'tax' ? E.money(b, c.amount ?? 0) : ''}
                </span>
              </button>
            </li>
          )
        })}
        {hits.length === 0 && <li className="muted">No square matches that search.</li>}
      </ul>
    </Sheet>
  )
}

// ---------- deed card ----------

export function Deed({ board, cell, c }: { board: Board; cell: number; c: Cell }) {
  const band = board.groups.find(g => g.id === c.group)?.color
  const m = (n: number) => E.money(board, n)
  return (
    <figure className="deed" aria-label={`Title deed for ${c.name}`}>
      <div className="deed-band" style={{ background: band ?? '#EFE6D0', color: inkOn(band ?? '#EFE6D0') }}>
        <span className="deed-kicker">Title deed</span>
        <strong className="deed-name">{c.name}</strong>
      </div>
      {c.kind === 'property' && (
        <table className="deed-table">
          <tbody>
            <tr><th>Rent</th><td className="num">{m(c.rents![0])}</td></tr>
            {[1, 2, 3, 4].map(h => <tr key={h}><th>With {h} {h === 1 ? 'house' : 'houses'}</th><td className="num">{m(c.rents![h])}</td></tr>)}
            <tr><th>With a hotel</th><td className="num">{m(c.rents![5])}</td></tr>
            <tr className="deed-sep"><th>Houses cost</th><td className="num">{m(c.houseCost!)} each</td></tr>
            <tr><th>Mortgage value</th><td className="num">{m(Math.floor(c.price! / 2))}</td></tr>
          </tbody>
        </table>
      )}
      {c.kind === 'railroad' && (
        <table className="deed-table">
          <tbody>
            {board.railroadRents.map((r, k) => <tr key={k}><th>If {k + 1} {k ? 'railroads are' : 'railroad is'} owned</th><td className="num">{m(r)}</td></tr>)}
            <tr className="deed-sep"><th>Mortgage value</th><td className="num">{m(Math.floor(c.price! / 2))}</td></tr>
          </tbody>
        </table>
      )}
      {c.kind === 'utility' && (
        <div className="deed-text">
          {board.utilityMultipliers.map((x, k) => <p key={k}>If {k + 1} {k ? 'utilities are' : 'utility is'} owned, rent is {x} times the dice.</p>)}
          <p className="muted">Mortgage value {m(Math.floor(c.price! / 2))}</p>
        </div>
      )}
      <figcaption className="sr-only">Deed {cell + 1}</figcaption>
    </figure>
  )
}

// ---------- a square: deed plus the right actions for the current player ----------

function CellSheet({ game, state, cell, opts = {} }: Props & { cell: number; opts?: E.RentOpts }) {
  const ui = useUI()
  const b = game.board, c = b.cells[cell], m = (n: number) => E.money(b, n)
  const p = who(game, state.turn)
  const owner = state.owner[cell]
  const held = owner ? E.pactFor(game, state, cell) : null
  const [dice, setDice] = useState<number | ''>('')
  const [auction, setAuction] = useState(false)
  const [bidder, setBidder] = useState(p.id)
  const [bid, setBid] = useState<number | ''>('')
  const done = async (ok: Promise<boolean>) => (await ok) && ui.close()
  const ownable = c.kind === 'property' || c.kind === 'railroad' || c.kind === 'utility'

  let action: ReactNode = null
  if (ownable && !owner) {
    const short = c.price! - state.cash[p.id]
    action = (
      <>
        <p>Unowned. {p.name} may buy it for <strong className="num">{m(c.price!)}</strong>.</p>
        {short > 0 && <p className="danger">{p.name} is {m(short)} short. Raise money by selling buildings or mortgaging.</p>}
        <div className="btn-row">
          <button className="plaque big" disabled={short > 0} onClick={() => done(ui.act('buy', p.id, cell))}>Buy for {m(c.price!)}</button>
          {short > 0 && <button className="ghost" onClick={() => ui.open({ kind: 'portfolio', player: p.id })}>Raise money</button>}
          {game.rules.auctions && <button className="ghost" aria-expanded={auction} onClick={() => setAuction(!auction)}>Auction it</button>}
          <button className="ghost" onClick={ui.close}>Leave it</button>
        </div>
        {auction && (
          <form className="auction" onSubmit={e => { e.preventDefault(); if (bid) done(ui.act('buy', bidder, cell, bid)) }}>
            <p className="muted small">Bid out loud around the table, then record the winner. Bids can start at any amount.</p>
            <div className="two-col">
              <label className="field"><span>Winner</span>
                <select className="input" value={bidder} onChange={e => setBidder(e.target.value)}>
                  {E.active(game, state).map(x => <option key={x.id} value={x.id}>{x.name} ({m(state.cash[x.id])})</option>)}
                </select>
              </label>
              <label className="field"><span>Winning bid</span>
                <input className="input num" type="number" inputMode="numeric" min={1} value={bid} onChange={e => setBid(e.target.value === '' ? '' : Math.max(0, Math.floor(+e.target.value)))} />
              </label>
            </div>
            <button className="plaque" type="submit" disabled={!bid}>Sell to the winner</button>
          </form>
        )}
      </>
    )
  } else if (ownable && owner === p.id) {
    action = <p>{p.name} owns this, so no rent is due.</p>
  } else if (ownable && owner) {
    const needDice = c.kind === 'utility'
    const r = E.rent(game, state, cell, { ...opts, dice: dice || undefined })
    const split = E.rentSplit(game, state, p.id, cell, r.amount)
    const payees = typeof split === 'string' ? [] : Object.entries(split).filter(([, v]) => v > 0)
    const pact = E.pactFor(game, state, cell)
    const pass = D.passFor(game, state, p.id, cell)
    const short = r.amount - state.cash[p.id]
    action = typeof split === 'string' ? <p>{split}.</p> : (
      <>
        {needDice && (
          <label className="field dice-field">
            <span>Dice total just rolled</span>
            <input className="input num" type="number" inputMode="numeric" min={2} max={12} autoFocus value={dice}
              onChange={e => setDice(e.target.value === '' ? '' : Math.min(12, Math.max(0, Math.floor(+e.target.value))))} />
          </label>
        )}
        {(!needDice || dice) ? (
          <>
            <p className="rent-line"><span>{p.name} owes {payees.length > 1 && pact ? `the ${E.pactName(b, pact)}` : who(game, payees[0]?.[0] ?? owner).name}</span> <strong className="num big-num">{m(r.amount)}</strong></p>
            <p className="muted">{r.why}.</p>
            {payees.length > 1 && <p className="muted">Split by shares: {payees.map(([id, v]) => `${who(game, id).name} ${m(v)}`).join(', ')}.</p>}
            {pass && <p>{p.name} holds a free rent pass here: {pass.landings} {pass.landings === 1 ? 'landing' : 'landings'} left.</p>}
            {short > 0 && !pass && <p className="danger">{p.name} is {m(short)} short.</p>}
            <div className="btn-row">
              {pass && <button className="plaque big" onClick={() => done(ui.act('usePass', pass.id, cell))}>Use a free landing</button>}
              <button className={pass ? 'ghost' : 'plaque big'} disabled={r.amount === 0 || short > 0} onClick={() => done(ui.act('payRent', p.id, cell, { ...opts, dice: dice || undefined }))}>{pass ? 'Pay anyway' : `Pay ${m(r.amount)} rent`}</button>
              {short > 0 && <button className="ghost" onClick={() => ui.open({ kind: 'portfolio', player: p.id })}>Raise money</button>}
              {short > 0 && <button className="ghost danger" onClick={() => ui.open({ kind: 'bankrupt', player: p.id, creditor: owner })}>Declare bankruptcy</button>}
            </div>
          </>
        ) : <p className="muted">Enter the dice total to work out the rent.</p>}
      </>
    )
  } else if (c.kind === 'tax') {
    const short = (c.amount ?? 0) - state.cash[p.id]
    action = (
      <>
        <p>{p.name} pays <strong className="num">{m(c.amount ?? 0)}</strong>{game.rules.freeParking ? ' into the Free Parking pot' : ' to the bank'}.</p>
        {short > 0 && <p className="danger">{p.name} is {m(short)} short.</p>}
        <div className="btn-row">
          <button className="plaque big" disabled={short > 0} onClick={() => done(ui.act('payTax', p.id, cell))}>Pay {m(c.amount ?? 0)}</button>
          {short > 0 && <button className="ghost" onClick={() => ui.open({ kind: 'portfolio', player: p.id })}>Raise money</button>}
          {short > 0 && <button className="ghost danger" onClick={() => ui.open({ kind: 'bankrupt', player: p.id, creditor: 'bank' })}>Declare bankruptcy</button>}
        </div>
      </>
    )
  } else if (c.kind === 'chance' || c.kind === 'chest') {
    action = (
      <div className="btn-row">
        <button className="plaque big" onClick={() => ui.open({ kind: 'card', deck: c.kind as 'chance' | 'chest' })}>Pick the card {p.name} drew</button>
      </div>
    )
  } else if (c.kind === 'gotojail') {
    action = <div className="btn-row"><button className="plaque big danger" onClick={() => done(ui.act('goToJail', p.id))}>Send {p.name} to jail</button></div>
  } else if (c.kind === 'parking') {
    action = game.rules.freeParking && state.pot > 0
      ? <div className="btn-row"><button className="plaque big" onClick={() => done(ui.act('collectPot', p.id))}>Collect the {m(state.pot)} pot</button></div>
      : <p className="muted">{game.rules.freeParking ? 'The pot is empty. Nothing happens.' : 'A free rest. Nothing happens.'}</p>
  } else if (c.kind === 'go') {
    action = <div className="btn-row"><button className="plaque big" onClick={() => done(ui.act('passGo', p.id, true))}>Collect {m(b.salary * (game.rules.doubleGo ? 2 : 1))}{game.rules.doubleGo ? ', double for landing on it' : ''}</button></div>
  } else if (c.kind === 'jail') {
    action = <p className="muted">Just visiting. Nothing happens.</p>
  }

  return (
    <Sheet eyebrow={opts.railroadMultiplier ? 'Card: double rent' : opts.utilityMax ? 'Card: ten times the dice' : `${p.name} landed on`} title={c.name} onClose={ui.close} wide={ownable}>
      <div className={ownable ? 'cell-sheet' : ''}>
        {ownable && (
          <div>
            <Deed board={b} cell={cell} c={c} />
            {owner && (
              <div className="owner-line">
                <Seal player={who(game, owner)} size={36} />
                <span>Owned by <strong>{who(game, owner).name}</strong>{state.mortgaged[cell] ? ', mortgaged' : ''}
                  {held && <small className="muted pact-line">Held in the {E.pactName(b, held)}: {held.members.map(id => `${who(game, id).name} ${held.shares[id]}%`).join(', ')}</small>}
                </span>
                <Pips level={state.level[cell]} />
              </div>
            )}
          </div>
        )}
        <div className="cell-actions">
          <p className="eyebrow">For {p.name}</p>
          {action}
          {ownable && owner && (
            <>
              <hr className="rule" />
              <p className="eyebrow">Owner tools</p>
              <DeedRow game={game} state={state} cell={cell} />
            </>
          )}
        </div>
      </div>
    </Sheet>
  )
}

// ---------- cards ----------

export function effectText(b: Board, f: Card['effect']) {
  const m = (n: number) => E.money(b, n)
  switch (f.type) {
    case 'collect': return `Collect ${m(f.amount)}`
    case 'pay': return `Pay ${m(f.amount)}`
    case 'collectEach': return `Collect ${m(f.amount)} from each player`
    case 'payEach': return `Pay ${m(f.amount)} to each player`
    case 'repairs': return `Pay ${m(f.house)} per house and ${m(f.hotel)} per hotel`
    case 'jail': return 'Go straight to jail'
    case 'jailCard': return 'Keep this card until needed'
    case 'advance': return `Move to ${b.cells[f.cell]?.name ?? 'a square'}`
    case 'nearest': return `Move to the nearest ${f.kind}`
    case 'move': return 'Move, then pick where they landed'
  }
}

function CardSheet({ game, state, deck }: Props & { deck: 'chance' | 'chest' }) {
  const ui = useUI()
  const b = game.board, p = who(game, state.turn)
  const [advance, setAdvance] = useState<number | null>(null)
  const cards = b[deck]

  const pick = async (card: Card) => {
    const f = card.effect
    if (f.type === 'advance' || f.type === 'nearest' || f.type === 'move') sfx('card')
    if (f.type === 'advance') {
      if (f.cell === 0) { if (await ui.act('passGo', p.id, true)) ui.close() }
      else setAdvance(f.cell)
    } else if (f.type === 'nearest') ui.open({ kind: 'nearest', type: f.kind })
    else if (f.type === 'move') ui.open({ kind: 'landed' })
    else if (await ui.act('drawCard', p.id, card)) ui.close()
  }

  if (advance !== null) {
    return (
      <Sheet eyebrow={`${p.name} advances`} title={`To ${b.cells[advance].name}`} onClose={ui.close}>
        <p>Did {p.name} pass Go on the way there?</p>
        <div className="btn-row">
          <button className="plaque big" onClick={async () => { if (await ui.act('passGo', p.id)) ui.open({ kind: 'cell', cell: advance }) }}>
            Yes, collect {E.money(b, b.salary)}
          </button>
          <button className="ghost" onClick={() => ui.open({ kind: 'cell', cell: advance })}>No</button>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet eyebrow={`${p.name} drew`} title={deck === 'chance' ? 'Chance' : 'Community Chest'} onClose={ui.close}>
      <ul className="card-list">
        {cards.map((card, i) => (
          <li key={i}>
            <button className="card-row" onClick={() => pick(card)}>
              <strong>{E.cardTitle(b, card)}</strong>
              <span className="muted small">{effectText(b, card.effect)}</span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}

function NearestSheet({ game, state, type }: Props & { type: 'railroad' | 'utility' }) {
  const ui = useUI()
  const b = game.board, p = who(game, state.turn)
  const cells = b.cells.flatMap((c, i) => (c.kind === type ? [i] : []))
  return (
    <Sheet eyebrow={`${p.name} advances`} title={`Nearest ${type}`} onClose={ui.close}>
      <p className="muted">Count forward from where {p.name} stands on the physical board. If they pass Go, record it with Passed Go afterwards.</p>
      <ul className="cell-list">
        {cells.map(i => (
          <li key={i}>
            <button className="cell-row" onClick={() => ui.open({ kind: 'cell', cell: i, opts: type === 'railroad' ? { railroadMultiplier: 2 } : { utilityMax: true } })}>
              <span>{b.cells[i].name}</span>
              <span className="muted small">{state.owner[i] ? `Owned by ${who(game, state.owner[i]!).name}` : 'Unowned'}</span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}

// ---------- portfolio: build, sell, mortgage, raise money ----------

function DeedRow({ game, state, cell }: Props & { cell: number }) {
  const ui = useUI()
  const b = game.board, c = b.cells[cell], m = (n: number) => E.money(b, n)
  const band = b.groups.find(g => g.id === c.group)?.color
  const canB = c.kind === 'property' ? E.canBuild(game, state, cell) : null
  const canS = c.kind === 'property' ? E.canSell(game, state, cell) : 'x'
  const lvl = state.level[cell]
  const mort = state.mortgaged[cell]
  const pooled = E.pactFor(game, state, cell)
  return (
    <div className="deed-row">
      <i className="swatch tall" style={{ background: band ?? 'var(--line)' }} />
      <div className="deed-row-main">
        <strong>{c.name}</strong>
        <span className="muted small">
          {mort ? 'Mortgaged, earns no rent' : c.kind === 'property' ? (lvl === 5 ? 'Hotel' : lvl ? `${lvl} ${lvl === 1 ? 'house' : 'houses'}` : 'No buildings') : c.kind === 'railroad' ? 'Railroad' : 'Utility'}
        </span>
        {pooled && <span className="muted small">{who(game, state.owner[cell]!).name}'s deed, pooled in the {E.pactName(b, pooled)}</span>}
        {c.kind === 'property' && canB && !mort && lvl < 5 && <span className="muted small">{canB}</span>}
      </div>
      <Pips level={lvl} />
      <div className="deed-row-tools">
        {c.kind === 'property' && (
          <>
            <button className="ghost" disabled={!!canB} onClick={() => ui.act('build', cell)} aria-label={`Build on ${c.name} for ${m(c.houseCost!)}`}>
              {lvl === 4 ? 'Hotel' : 'House'} <span className="num">{m(c.houseCost!)}</span>
            </button>
            <button className="ghost" disabled={!!canS} title={lvl ? (canS ?? '') : ''} onClick={() => ui.act('sell', cell)} aria-label={`Sell a building on ${c.name}`}>
              Sell <span className="num">+{m(Math.floor(c.houseCost! / 2))}</span>
            </button>
          </>
        )}
        {mort ? (
          <button className="ghost" onClick={() => ui.act('unmortgage', cell)}>Lift <span className="num">{m(E.unmortgageCost(game, cell))}</span></button>
        ) : (
          <button className="ghost" onClick={() => ui.act('mortgage', cell)}>Mortgage <span className="num">+{m(E.mortgageValue(game, cell))}</span></button>
        )}
      </div>
    </div>
  )
}

function Portfolio({ game, state, pid }: Props & { pid: string }) {
  const ui = useUI()
  const b = game.board, p = who(game, pid), w = E.netWorth(game, state, pid)
  // their own deeds, plus allies' deeds pooled with them, so a shared set can be built evenly from one place
  const owned = b.cells.map((_, i) => i).filter(i => state.owner[i] === pid || E.pactFor(game, state, i)?.members.includes(pid))
  const order = (i: number) => {
    const c = b.cells[i]
    return c.kind === 'property' ? b.groups.findIndex(g => g.id === c.group) : c.kind === 'railroad' ? 100 : 200
  }
  const sorted = owned.toSorted((x, y) => order(x) - order(y) || x - y)
  return (
    <Sheet eyebrow="Portfolio" title={<span className="portfolio-title"><Seal player={p} size={44} />{p.name}</span>} onClose={ui.close} wide
      foot={state.bankrupt[pid] ? undefined : (
        <>
          <button className="ghost danger" onClick={() => ui.open({ kind: 'bankrupt', player: pid })}>Declare bankruptcy</button>
          <button className="ghost" onClick={() => ui.open({ kind: 'deals' })}>Deals</button>
          <button className="plaque" onClick={ui.close}>Done</button>
        </>
      )}>
      <dl className="worth">
        <div><dt>Cash</dt><dd><Money value={w.cash} cur={b.currency} /></dd><p className="muted small">Money in hand right now.</p></div>
        <div><dt>Could raise</dt><dd className="num">{E.money(b, w.raisable)}</dd><p className="muted small">Cash plus what the bank pays for every building sold and every deed mortgaged.</p></div>
        <div><dt>Net worth</dt><dd className="num">{E.money(b, w.total)}</dd><p className="muted small">Cash, deeds at printed price (half if mortgaged), buildings at cost (by share in a pact), plus loans owed to you minus loans you owe. Final standings use this.</p></div>
        <div><dt>Jail cards</dt><dd className="num">{state.jailCards[pid]}</dd><p className="muted small">Get out of jail free cards held.</p></div>
      </dl>
      <hr className="rule" />
      {sorted.length === 0 ? <p className="muted">{p.name} owns no deeds yet.</p> : sorted.map(i => <DeedRow key={i} game={game} state={state} cell={i} />)}
      <PlayerDeals game={game} state={state} pid={pid} />
    </Sheet>
  )
}

/** Pacts, loans and passes this player is part of. Renders nothing when there are none. */
function PlayerDeals({ game, state, pid }: Props & { pid: string }) {
  const ui = useUI()
  const b = game.board, m = (n: number) => E.money(b, n), nm = (id: string) => who(game, id).name
  const pacts = Object.values(state.pacts).filter(x => x.members.includes(pid))
  const loans = D.loansOf(state, pid)
  const passes = Object.values(state.immunities).filter(x => x.holder === pid || x.grantor === pid)
  if (!pacts.length && !loans.length && !passes.length) return null
  return (
    <section aria-labelledby="deals-h">
      <hr className="rule" />
      <p id="deals-h" className="eyebrow">Deals</p>
      <ul className="deal-lines">
        {pacts.map(x => (
          <li key={x.id}>In the <strong>{E.pactName(b, x)}</strong> with {x.members.filter(id => id !== pid).map(nm).join(' and ')}: a {x.shares[pid]}% share of its rent, building costs and refunds.</li>
        ))}
        {loans.map(l => (
          <li key={l.id}>{l.borrower === pid ? `Owes ${nm(l.lender)} ${m(l.repay)}` : `${nm(l.borrower)} owes ${nm(pid)} ${m(l.repay)}`} by round {l.dueRound}{state.round >= l.dueRound ? ', due now' : ''}.</li>
        ))}
        {passes.map(x => (
          <li key={x.id}>{x.holder === pid ? `Lands free on ${nm(x.grantor)}'s` : `${nm(x.holder)} lands free on ${nm(pid)}'s`} {x.group === 'all' ? 'deeds' : `${E.groupLabel(b, x.group)} deeds`}: {x.landings} {x.landings === 1 ? 'landing' : 'landings'} left.</li>
        ))}
      </ul>
      <button className="ghost" onClick={() => ui.open({ kind: 'deals', tab: pacts.length ? 'pact' : loans.length ? 'loan' : 'pass' })}>Manage deals</button>
    </section>
  )
}

// ---------- other payment ----------

function PaymentSheet({ game, state }: Props) {
  const ui = useUI()
  const parties: Party[] = [...E.active(game, state).map(p => p.id), 'bank', ...(game.rules.freeParking ? ['pot'] : [])]
  const [from, setFrom] = useState<Party>(state.turn)
  const [to, setTo] = useState<Party>('bank')
  const [amount, setAmount] = useState<number | ''>('')
  const [note, setNote] = useState('')
  const r = amount ? E.transfer(game, state, from, to, amount, note.trim()) : null
  return (
    <Sheet eyebrow="Anything else" title="Other payment" onClose={ui.close}
      foot={<button className="plaque big" disabled={!r || E.isErr(r)} onClick={async () => { if (amount && await ui.act('transfer', from, to, amount, note.trim())) ui.close() }}>Record payment</button>}>
      <p className="muted">For house rules, deals and anything the other buttons do not cover.</p>
      <div className="two-col">
        <label className="field"><span>From</span>
          <select className="input" value={from} onChange={e => setFrom(e.target.value)}>
            {parties.map(x => <option key={x} value={x}>{partyName(game, x)}</option>)}
          </select>
        </label>
        <label className="field"><span>To</span>
          <select className="input" value={to} onChange={e => setTo(e.target.value)}>
            {parties.map(x => <option key={x} value={x}>{partyName(game, x)}</option>)}
          </select>
        </label>
        <label className="field"><span>Amount</span>
          <input className="input num" type="number" inputMode="numeric" min={1} value={amount} onChange={e => setAmount(e.target.value === '' ? '' : Math.max(0, Math.floor(+e.target.value)))} />
        </label>
        <label className="field"><span>Note (optional)</span>
          <input className="input" value={note} maxLength={60} onChange={e => setNote(e.target.value)} placeholder="Loan until next lap" />
        </label>
      </div>
      {r && E.isErr(r) && <p className="error-text" role="alert">{r.error}</p>}
    </Sheet>
  )
}

// ---------- bankruptcy ----------

function BankruptSheet({ game, state, pid, creditor }: Props & { pid: string; creditor?: string }) {
  const ui = useUI()
  const p = who(game, pid)
  const [to, setTo] = useState<Party>(creditor ?? 'bank')
  const w = E.netWorth(game, state, pid)
  const confirm = async () => {
    if (!await ui.act('bankrupt', pid, to)) return
    if (ui.me) return ui.close() // a phone's bankruptcy waits for the host, who also passes the turn on
    const s = store.get()!
    if (E.active(s.game, s.state).length <= 1) return ui.go('end')
    if (s.state.turn === pid) await ui.act('endTurn')
    ui.close()
  }
  return (
    <Sheet eyebrow="The end of the line" title={`${p.name} goes bankrupt`} onClose={ui.close}
      foot={<>
        <button className="ghost" onClick={ui.close}>Not yet</button>
        <button className="plaque big danger" onClick={confirm}>Declare bankruptcy</button>
      </>}>
      <div className="stack">
      <p>Before giving up, {p.name} could raise up to <strong className="num">{E.money(game.board, w.raisable)}</strong> by selling buildings and mortgaging deeds.</p>
      <label className="field"><span>Who is owed</span>
        <select className="input" value={to} onChange={e => setTo(e.target.value)}>
          <option value="bank">The bank</option>
          {E.active(game, state).filter(x => x.id !== pid).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </label>
      <p className="muted">{to === 'bank'
        ? 'Buildings are sold to the bank, the cash goes to the bank, and every deed returns to the board unowned and unmortgaged.'
        : `Buildings are sold to the bank at half price. ${partyName(game, to)} receives all the cash, every deed as it stands and any jail cards.`}</p>
      <p className="muted small">This can be undone from the ledger like any other entry.</p>
      </div>
    </Sheet>
  )
}

// ---------- menu ----------

function MenuSheet({ game }: Props) {
  const ui = useUI()
  const [confirming, setConfirming] = useState(false)
  const [sound, setSound] = useState(prefs.get().sound !== false)
  const [scenes, setScenes] = useState(prefs.get().scenes ?? !!ui.live)
  return (
    <Sheet eyebrow="The back office" title="Menu" onClose={ui.close}>
      <Switch label="Sound effects" help="Arcade chimes for buying, rent, building, jail, cards and more." checked={sound} onChange={v => { prefs.set({ sound: v }); setSound(v); if (v) sfx('coin') }} />
      <Switch label="Cartoon scenes" help="A short animation at the top of the screen for every notable moment. On by default in sessions." checked={scenes} onChange={v => { prefs.set({ scenes: v }); setScenes(v) }} />
      <div className="menu-list">
        <button className="ghost" onClick={() => ui.go('end')}>Standings and end of game</button>
        <button className="ghost" onClick={() => ui.go('ledger')}>Open the ledger</button>
        <button className="ghost" onClick={() => download(`counting-house-${new Date().toISOString().slice(0, 10)}.json`, store.exportJson())}>
          Download a backup
        </button>
        <button className="ghost" onClick={() => ui.go('lobby')}>Back to the lobby</button>
        <button className="ghost" onClick={ui.notes}>Release notes</button>
        {ui.live?.kind === 'host' && <button className="ghost danger" onClick={() => { ui.live!.close(); ui.setLive(null); ui.say('Session ended. The game carries on here.') }}>End the session</button>}
        {!confirming
          ? <button className="ghost danger" onClick={() => setConfirming(true)}>Delete this game</button>
          : (
            <div className="confirm-box" role="alert">
              <p>Delete the {game.board.name} game with {game.players.map(p => p.name).join(', ')}? Download a backup first if you might want it back.</p>
              <div className="btn-row">
                <button className="ghost" onClick={() => setConfirming(false)}>Keep it</button>
                <button className="plaque danger" onClick={() => { store.clear(); ui.go('lobby') }}>Delete for good</button>
              </div>
            </div>
          )}
      </div>
      <p className="muted small">Keyboard: N for next player, U to undo, L for landed on.</p>
    </Sheet>
  )
}
