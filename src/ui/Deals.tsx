import { useMemo, useState, type ReactNode } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import * as E from '../engine/engine.ts'
import * as D from '../engine/deals.ts'
import type { Game, Pact, Player, State } from '../engine/types.ts'
import { shortName } from './BoardMap.tsx'
import { useUI, type DealTab } from './ctx.ts'
import { Seal, Sheet, Switch } from './kit.tsx'

type Props = { game: Game; state: State }
const who = (g: Game, id: string) => g.players.find(p => p.id === id)!
const num = (v: string) => (v === '' ? '' : Math.max(0, Math.floor(+v)))
const TABS: { id: DealTab; label: string }[] = [
  { id: 'trade', label: 'Trade' }, { id: 'pact', label: 'Pact' }, { id: 'loan', label: 'Loan' }, { id: 'pass', label: 'Free rent' },
]

/** The sticky bar at the bottom of each tab: what will happen, and the button that does it. */
function Foot({ result, act, label, extra }: { result: ReturnType<typeof E.trade>; act: () => Promise<boolean>; label: string; extra?: ReactNode }) {
  const ui = useUI()
  const err = E.isErr(result)
  return (
    <div className="deal-foot">
      <p className={`trade-summary ${err ? 'muted' : ''}`}>{err ? result.error : result.memo}</p>
      {extra}
      <button className="plaque big" disabled={err} onClick={async () => { if (await act()) ui.close() }}>{ui.me ? 'Send for approval' : label}</button>
    </div>
  )
}

export default function DealsSheet({ game, state, tab: first }: Props & { tab?: DealTab }) {
  const ui = useUI()
  const tabs = game.rules.deals === false ? TABS.slice(0, 1) : TABS
  const [tab, setTab] = useState<DealTab>(tabs.some(t => t.id === first) ? first! : 'trade')
  return (
    <Sheet eyebrow="Between players" title="Deals" onClose={ui.close} wide>
      {tabs.length > 1 && (
        <div className="chips deal-tabs" role="tablist" aria-label="Kind of deal">
          {tabs.map(t => <button key={t.id} role="tab" aria-selected={tab === t.id} aria-pressed={tab === t.id} className="ghost" onClick={() => setTab(t.id)}>{t.label}</button>)}
        </div>
      )}
      {tab === 'trade' && <TradePanel game={game} state={state} />}
      {tab === 'pact' && <PactPanel game={game} state={state} />}
      {tab === 'loan' && <LoanPanel game={game} state={state} />}
      {tab === 'pass' && <PassPanel game={game} state={state} />}
    </Sheet>
  )
}

// ---------- trade ----------

type SideState = { cells: number[]; cash: number | ''; jailCards: number }
const emptySide = (): SideState => ({ cells: [], cash: '', jailCards: 0 })

function TradeSide({ game, state, pid, side, set, choices, setPid, label }: Props & {
  pid: string; side: SideState; set: (s: SideState) => void; choices: Player[]; setPid: (id: string) => void; label: string
}) {
  const b = game.board
  const owned = b.cells.map((_, i) => i).filter(i => state.owner[i] === pid)
  const built = (i: number) => {
    const c = b.cells[i]
    return c.kind === 'property' && E.groupCells(b, c.group!).some(k => state.level[k] > 0)
  }
  return (
    <fieldset className="trade-side">
      <legend className="sr-only">{`${who(game, pid)?.name ?? label} gives`}</legend>
      <div className="trade-head">
        <select className="input" value={pid} onChange={e => setPid(e.target.value)} aria-label={`${label}: who gives`}>
          {choices.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <span className="trade-verb">gives</span>
      </div>
      <ul className="trade-deeds">
        {owned.map(i => {
          const blocked = built(i)
          return (
            <li key={i}>
              <label className={blocked ? 'disabled' : ''}>
                <input type="checkbox" disabled={blocked} checked={side.cells.includes(i)}
                  onChange={e => set({ ...side, cells: e.target.checked ? [...side.cells, i] : side.cells.filter(x => x !== i) })} />
                <i className="swatch" style={{ background: b.groups.find(g => g.id === b.cells[i].group)?.color ?? 'var(--line)' }} />
                <span>{shortName(b.cells[i].name)}{state.mortgaged[i] ? ' (mortgaged)' : ''}</span>
                {blocked && <small className="muted">sell buildings first</small>}
              </label>
            </li>
          )
        })}
        {owned.length === 0 && <li className="muted small">No properties to give.</li>}
      </ul>
      <label className="field"><span>Money (has {E.money(b, state.cash[pid])})</span>
        <input className="input num" type="number" inputMode="numeric" min={0} value={side.cash}
          onChange={e => set({ ...side, cash: num(e.target.value) })} />
      </label>
      {state.jailCards[pid] > 0 && (
        <label className="field"><span>Get out of jail free cards (has {state.jailCards[pid]})</span>
          <input className="input num" type="number" min={0} max={state.jailCards[pid]} value={side.jailCards}
            onChange={e => set({ ...side, jailCards: Math.min(state.jailCards[pid], Math.max(0, Math.floor(+e.target.value))) })} />
        </label>
      )}
    </fieldset>
  )
}

function TradePanel({ game, state }: Props) {
  const players = E.active(game, state)
  const ui = useUI()
  const first = ui.me ?? state.turn // on a phone you are always one side
  const [a, setA] = useState(first)
  const [bId, setB] = useState(players.find(x => x.id !== first)?.id ?? '')
  const [give, setGive] = useState(emptySide)
  const [get, setGet] = useState(emptySide)
  const side = (s: SideState) => ({ cells: s.cells, cash: s.cash || 0, jailCards: s.jailCards })
  const result = useMemo(() => (a && bId && a !== bId ? E.trade(game, state, a, bId, side(give), side(get)) : { error: 'Pick two different players' }), [game, state, a, bId, give, get])
  return (
    <>
      <p className="muted deal-help">Tick what each player hands over. Either side can add money too.</p>
      <div className="trade-grid">
        <TradeSide game={game} state={state} pid={a} setPid={id => { setA(id); setGive(emptySide()) }} side={give} set={setGive} choices={players} label="First player" />
        <span className="trade-swap" aria-hidden="true"><ArrowLeftRight size={22} /></span>
        <TradeSide game={game} state={state} pid={bId} setPid={id => { setB(id); setGet(emptySide()) }} side={get} set={setGet} choices={players} label="Second player" />
      </div>
      {game.rules.mortgageInterest && <p className="muted small">Getting a mortgaged property? The new owner pays the bank a 10% fee on its mortgage right away.</p>}
      <Foot result={result} act={() => ui.act('trade', a, bId, side(give), side(get))} label="Shake on it" />
    </>
  )
}

// ---------- pacts ----------

const ALL_GROUPS = (g: Game) => [...g.board.groups.map(x => x.id), 'railroad', 'utility']
const groupColor = (g: Game, id: string) => g.board.groups.find(x => x.id === id)?.color ?? 'var(--line)'

function PactCard({ game, state, pact, onEdit }: Props & { pact: Pact; onEdit: () => void }) {
  const ui = useUI()
  const [ending, setEnding] = useState(false)
  const d = E.dissolveOps(game, state, pact)
  return (
    <li className="deal-card">
      <div className="deal-card-main">
        <strong>The {E.pactName(game.board, pact)}</strong>
        <span className="deal-members">
          {pact.members.map(m => <span key={m} className="deal-member"><Seal player={who(game, m)} size={24} initial={false} />{who(game, m).name} <span className="num">{pact.shares[m]}%</span></span>)}
        </span>
        <span className="muted small">Allies {pact.allyRent === 'free' ? 'stay free' : 'pay rent, split among the others'} on its deeds.</span>
      </div>
      {ending ? (
        <span className="confirm-inline" role="alert">
          {d.refund ? `Buildings go back to the bank for ${E.money(game.board, d.refund)}, split by shares.` : 'No buildings to sell.'}
          <button className="ghost" onClick={() => setEnding(false)}>Keep it</button>
          <button className="plaque danger" onClick={() => ui.act('endPact', pact.id)}>Dissolve</button>
        </span>
      ) : (
        <span className="btn-row tight">
          <button className="ghost" onClick={onEdit}>Edit</button>
          <button className="ghost danger" onClick={() => setEnding(true)}>Dissolve</button>
        </span>
      )}
    </li>
  )
}

function PactPanel({ game, state }: Props) {
  const ui = useUI()
  const players = E.active(game, state)
  const pacts = Object.values(state.pacts)
  const [editing, setEditing] = useState<string | undefined>()
  const [members, setMembers] = useState<string[]>([ui.me ?? state.turn])
  const [groups, setGroups] = useState<string[]>([])
  const [manual, setManual] = useState<Record<string, number | ''> | null>(null)
  const [allyRent, setAllyRent] = useState<'free' | 'paid'>('free')

  const suggested = members.length >= 2 && groups.length ? D.suggestShares(game, state, members, groups) : {}
  const shares = Object.fromEntries(members.map(m => [m, manual?.[m] ?? suggested[m] ?? 0]))
  const draft: D.PactDraft = { members, groups, allyRent, shares: Object.fromEntries(members.map(m => [m, Number(shares[m]) || 0])) }
  const result = D.formPact(game, state, draft, editing)
  const total = members.reduce((t, m) => t + (Number(shares[m]) || 0), 0)

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v])
  const edit = (p: Pact) => { setEditing(p.id); setMembers(p.members); setGroups(p.groups); setManual(p.shares); setAllyRent(p.allyRent) }
  const reset = () => { setEditing(undefined); setMembers([ui.me ?? state.turn]); setGroups([]); setManual(null); setAllyRent('free') }
  const takenBy = (gr: string) => pacts.find(p => p.id !== editing && p.groups.includes(gr))

  return (
    <>
      {pacts.length > 0 && (
        <section aria-label="Active pacts">
          <p className="eyebrow">Active pacts</p>
          <ul className="deal-list">{pacts.map(p => <PactCard key={p.id} game={game} state={state} pact={p} onEdit={() => edit(p)} />)}</ul>
          <hr className="rule" />
        </section>
      )}
      <p className="eyebrow">{editing ? `Editing the ${E.pactName(game.board, state.pacts[editing])}` : 'A new pact'}</p>
      <p className="muted small deal-help">
        Allies pool the deeds they own in the chosen sets. Every deed keeps its owner, but a set held entirely by the pact can be built on,
        and building costs and rent are split by the shares below. Dissolving sells the pact's buildings back at half price and splits the refund.
      </p>

      <p className="field-label">Who is in it</p>
      <div className="chips">
        {players.map(p => (
          <button key={p.id} className="ghost" aria-pressed={members.includes(p.id)} onClick={() => { setMembers(toggle(members, p.id)); setManual(null) }}>
            <Seal player={p} size={22} initial={false} /> {p.name}
          </button>
        ))}
      </div>

      <p className="field-label">Sets to pool</p>
      <div className="chips">
        {ALL_GROUPS(game).map(gr => {
          const held = members.map(m => ({ m, n: D.heldIn(game, state, m, [gr]).length })).filter(x => x.n)
          if (!held.length && !groups.includes(gr)) return null
          const taken = takenBy(gr)
          const cells = E.cellsOfGroup(game.board, gr)
          const full = cells.every(i => state.owner[i] && members.includes(state.owner[i]!))
          return (
            <button key={gr} className="ghost set-chip" aria-pressed={groups.includes(gr)} disabled={!!taken}
              title={taken ? `Already in the ${E.pactName(game.board, taken)}` : ''} onClick={() => { setGroups(toggle(groups, gr)); setManual(null) }}>
              <i className="swatch" style={{ background: groupColor(game, gr) }} />
              {E.groupLabel(game.board, gr)}
              <small className="muted">{taken ? 'taken' : `${held.map(x => `${who(game, x.m).name} ${x.n}`).join(', ')}${full ? ', full set' : ''}`}</small>
            </button>
          )
        })}
        {members.length > 0 && !ALL_GROUPS(game).some(gr => members.some(m => D.heldIn(game, state, m, [gr]).length)) && <p className="muted small">The chosen players own no deeds yet.</p>}
      </div>

      {members.length >= 2 && (
        <>
          <p className="field-label">Shares <span className={`num ${total === 100 ? '' : 'danger'}`}>{total}% of 100%</span></p>
          <div className="share-grid">
            {members.map(m => (
              <label key={m} className="field">
                <span>{who(game, m).name}</span>
                <input className="input num" type="number" inputMode="numeric" min={1} max={99} value={shares[m]}
                  onChange={e => {
                    const v = num(e.target.value)
                    // typing one share rebalances the others so the total stays at 100%
                    setManual(v === '' ? { ...shares, [m]: '' } : D.rebalance(Object.fromEntries(members.map(x => [x, Number(shares[x]) || 0])), members, m, v))
                  }} />
              </label>
            ))}
            <button className="ghost" disabled={!groups.length} onClick={() => setManual(null)}>Suggest a fair split</button>
          </div>
          <p className="muted small">Type one share and the others adjust to keep 100%. A fair split follows the printed value of the deeds each ally pools.</p>
        </>
      )}

      <Switch label="Allies pay rent" help="Off: allies stay free on the pact's deeds. On: they pay, and the rent goes to the other allies by share."
        checked={allyRent === 'paid'} onChange={v => setAllyRent(v ? 'paid' : 'free')} />

      <Foot result={result} act={() => ui.act('formPact', draft, editing)} label={editing ? 'Save the pact' : 'Sign the pact'} extra={editing && <button className="ghost" onClick={reset}>Cancel edit</button>} />
    </>
  )
}

// ---------- loans ----------

function LoanPanel({ game, state }: Props) {
  const ui = useUI()
  const players = E.active(game, state)
  const loans = Object.values(state.loans)
  const [borrower, setBorrower] = useState(ui.me ?? state.turn)
  const [lender, setLender] = useState(players.find(p => p.id !== (ui.me ?? state.turn))?.id ?? '')
  const [amount, setAmount] = useState<number | ''>('')
  const [rate, setRate] = useState<number | ''>(10)
  const [rounds, setRounds] = useState<number | ''>(3)
  const d: D.LoanDraft = { lender, borrower, amount: Number(amount) || 0, ratePct: Number(rate) || 0, rounds: Number(rounds) || 0 }
  const result = D.lend(game, state, d)
  const m = (n: number) => E.money(game.board, n)
  return (
    <>
      {loans.length > 0 && (
        <section aria-label="Open loans">
          <p className="eyebrow">Open loans</p>
          <ul className="deal-list">
            {loans.map(l => {
              const due = state.round >= l.dueRound
              return (
                <li key={l.id} className="deal-card">
                  <div className="deal-card-main">
                    <strong>{who(game, l.borrower).name} owes {who(game, l.lender).name} {m(l.repay)}</strong>
                    <span className={`small ${due ? 'danger' : 'muted'}`}>{due ? `Due now (round ${l.dueRound})` : `Due by round ${l.dueRound}`}. Borrowed {m(l.amount)}.</span>
                  </div>
                  <span className="btn-row tight">
                    <button className="ghost" onClick={() => ui.act('repayLoan', l.id)}>Repay {m(l.repay)}</button>
                    <button className="ghost" onClick={() => ui.act('forgiveLoan', l.id)}>Forgive</button>
                  </span>
                </li>
              )
            })}
          </ul>
          <hr className="rule" />
        </section>
      )}
      <p className="eyebrow">A new loan</p>
      <div className="two-col">
        <label className="field"><span>Borrower</span>
          <select className="input" value={borrower} onChange={e => setBorrower(e.target.value)}>{players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </label>
        <label className="field"><span>Lender</span>
          <select className="input" value={lender} onChange={e => setLender(e.target.value)}>{players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </label>
        <label className="field"><span>Amount</span>
          <input className="input num" type="number" inputMode="numeric" min={1} value={amount} onChange={e => setAmount(num(e.target.value))} />
        </label>
        <label className="field"><span>Interest %</span>
          <input className="input num" type="number" inputMode="numeric" min={0} max={100} value={rate} onChange={e => setRate(num(e.target.value))} />
        </label>
        <label className="field"><span>Repay within (rounds)</span>
          <input className="input num" type="number" inputMode="numeric" min={1} max={50} value={rounds} onChange={e => setRounds(num(e.target.value))} />
        </label>
      </div>
      <p className="muted small deal-help">Interest is added once. When the due round arrives, the table reminds the borrower on their turn.</p>
      <Foot result={result} act={() => ui.act('lend', d)} label="Hand over the money" />
    </>
  )
}

// ---------- free rent passes ----------

function PassPanel({ game, state }: Props) {
  const ui = useUI()
  const players = E.active(game, state)
  const passes = Object.values(state.immunities)
  const [holder, setHolder] = useState(ui.me ?? state.turn)
  const [grantor, setGrantor] = useState(players.find(p => p.id !== (ui.me ?? state.turn))?.id ?? '')
  const [group, setGroup] = useState('all')
  const [landings, setLandings] = useState<number | ''>(2)
  const [price, setPrice] = useState<number | ''>('')
  const scopes = ['all', ...ALL_GROUPS(game).filter(gr => E.cellsOfGroup(game.board, gr).some(i => state.owner[i] === grantor && !E.pactFor(game, state, i)))]
  const pass: D.PassDraft = { holder, grantor, group: scopes.includes(group) ? group : 'all', landings: Number(landings) || 0, price: Number(price) || 0 }
  const result = D.grantPass(game, state, pass)
  return (
    <>
      {passes.length > 0 && (
        <section aria-label="Active passes">
          <p className="eyebrow">Active passes</p>
          <ul className="deal-list">
            {passes.map(im => (
              <li key={im.id} className="deal-card">
                <div className="deal-card-main">
                  <strong>{who(game, im.holder).name} lands free on {who(game, im.grantor).name}'s {im.group === 'all' ? 'deeds' : `${E.groupLabel(game.board, im.group)} deeds`}</strong>
                  <span className="muted small">{im.landings} free {im.landings === 1 ? 'landing' : 'landings'} left</span>
                </div>
                <button className="ghost" onClick={() => ui.act('cancelPass', im.id)}>Cancel</button>
              </li>
            ))}
          </ul>
          <hr className="rule" />
        </section>
      )}
      <p className="eyebrow">A new pass</p>
      <div className="two-col">
        <label className="field"><span>Buyer</span>
          <select className="input" value={holder} onChange={e => setHolder(e.target.value)}>{players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </label>
        <label className="field"><span>On whose deeds</span>
          <select className="input" value={grantor} onChange={e => { setGrantor(e.target.value); setGroup('all') }}>{players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </label>
        <label className="field"><span>Which deeds</span>
          <select className="input" value={scopes.includes(group) ? group : 'all'} onChange={e => setGroup(e.target.value)}>
            {scopes.map(gr => <option key={gr} value={gr}>{gr === 'all' ? 'All of them' : E.groupLabel(game.board, gr)}</option>)}
          </select>
        </label>
        <label className="field"><span>Free landings</span>
          <input className="input num" type="number" inputMode="numeric" min={1} max={20} value={landings} onChange={e => setLandings(num(e.target.value))} />
        </label>
        <label className="field"><span>Price (0 for a favour)</span>
          <input className="input num" type="number" inputMode="numeric" min={0} value={price} onChange={e => setPrice(num(e.target.value))} />
        </label>
      </div>
      <p className="muted small deal-help">Each landing on a covered deed uses one pass instead of paying rent. Deeds pooled in a pact are not covered, so shared rent stays fair.</p>
      <Foot result={result} act={() => ui.act('grantPass', pass)} label="Sell the pass" />
    </>
  )
}
