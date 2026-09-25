import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { ArrowDown, ArrowUp, Shuffle, Trash2 } from 'lucide-react'
import { presets } from '../engine/boards.ts'
import { defaultRules, money } from '../engine/engine.ts'
import type { Player, Rules } from '../engine/types.ts'
import { customBoards, store } from '../store.ts'
import { useUI } from './ctx.ts'
import { ACCESSORIES, PLAYER_COLORS, Seal, Switch } from './kit.tsx'
import { sfx } from './sound.ts'

export const RULES: { key: keyof Rules; label: string; help: string }[] = [
  { key: 'freeParking', label: 'Free Parking jackpot', help: 'Taxes, fines and card payments go into a pot. Landing on Free Parking takes it all.' },
  { key: 'auctions', label: 'Auctions', help: 'When a player passes on a property, the table bids for it.' },
  { key: 'doubleGo', label: 'Double salary on Go', help: 'Landing exactly on Go pays twice the salary.' },
  { key: 'setDoubleRent', label: 'Double rent on a full set', help: 'Owning every property of a colour doubles the rent on the ones without houses. Official rule.' },
  { key: 'evenBuild', label: 'Build evenly', help: 'Houses go up and come down one property at a time across a colour set. Official rule.' },
  { key: 'bankLimit', label: 'Limited houses and hotels', help: 'The bank only has the board’s supply, normally 32 houses and 12 hotels. Official rule.' },
  { key: 'mortgageInterest', label: 'Mortgage interest', help: 'Lifting a mortgage costs 10% extra, and receiving a mortgaged deed in a trade costs 10% right away. Official rule.' },
  { key: 'noRentInJail', label: 'No rent from jail', help: 'Owners collect nothing while they sit in jail.' },
]

const uid = () => crypto.randomUUID().slice(0, 8)
const randomSeed = () => Math.floor(Math.random() * 1e9)
const transition = (fn: () => void) =>
  'startViewTransition' in document && !matchMedia('(prefers-reduced-motion: reduce)').matches
    ? document.startViewTransition(() => flushSync(fn))
    : fn()

export default function Setup() {
  const ui = useUI()
  useEffect(() => { import('../stage/Stage.tsx') }, []) // warm the 3D chunk while the table is being seated
  const boards = [...presets, ...customBoards.list()]
  const [boardId, setBoardId] = useState(boards[0].id)
  const board = boards.find(b => b.id === boardId) ?? boards[0]
  const [cash, setCash] = useState<number | ''>(board.startingCash)
  const [salary, setSalary] = useState<number | ''>(board.salary)
  const [rules, setRules] = useState<Rules>(defaultRules)
  const [players, setPlayers] = useState<Player[]>([])
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState('')

  const pickBoard = (id: string) => {
    const b = boards.find(x => x.id === id)!
    setBoardId(id); setCash(b.startingCash); setSalary(b.salary)
  }

  const add = () => {
    const n = name.trim()
    if (!n) { sfx('error'); return setNameError('Type a name first.') }
    if (players.some(p => p.name.toLowerCase() === n.toLowerCase())) return setNameError('Two players cannot share a name.')
    if (players.length >= 8) return setNameError('The table seats eight at most.')
    const used = new Set(players.map(p => p.color))
    const color = PLAYER_COLORS.find(c => !used.has(c.hex))!.hex
    setPlayers([...players, { id: uid(), name: n, color, accessory: Math.floor(Math.random() * ACCESSORIES.length), seed: randomSeed() }])
    setName(''); setNameError('')
    sfx('tick')
  }

  const update = (id: string, patch: Partial<Player>) => setPlayers(ps => ps.map(p => (p.id === id ? { ...p, ...patch } : p)))
  const nextColor = (p: Player) => {
    const used = new Set(players.filter(x => x.id !== p.id).map(x => x.color))
    const i = PLAYER_COLORS.findIndex(c => c.hex === p.color)
    for (let k = 1; k <= PLAYER_COLORS.length; k++) {
      const c = PLAYER_COLORS[(i + k) % PLAYER_COLORS.length]
      if (!used.has(c.hex)) return update(p.id, { color: c.hex })
    }
  }
  const moveBy = (i: number, d: number) => transition(() => setPlayers(ps => {
    const next = [...ps]; const [p] = next.splice(i, 1); next.splice(i + d, 0, p); return next
  }))
  const shuffle = () => { sfx('shuffle'); transition(() => setPlayers(ps => {
    const next = [...ps]
    for (let i = next.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [next[i], next[j]] = [next[j], next[i]] }
    return next
  })) }

  const cashOk = typeof cash === 'number' && cash > 0, salaryOk = typeof salary === 'number' && salary >= 0
  const ready = players.length >= 2 && cashOk && salaryOk
  const start = () => {
    if (!ready) return
    store.start({
      id: uid(), createdAt: Date.now(), rules, players,
      board: { ...structuredClone(board), startingCash: cash as number, salary: salary as number },
    })
    sfx('start')
    ui.go('table')
  }

  return (
    <main className="setup">
      <header className="setup-head">
        <button className="ghost" onClick={() => ui.go('lobby')}>Back</button>
        <div>
          <p className="eyebrow">A new ledger</p>
          <h1 className="display">Seat the table</h1>
        </div>
        <button className="plaque big" disabled={!ready} onClick={start}>Open the bank</button>
      </header>

      <div className="setup-grid">
        <section className="panel setup-players" aria-labelledby="players-h">
          <div className="section-head">
            <h2 id="players-h" className="display">Players</h2>
            <button className="ghost" onClick={shuffle} disabled={players.length < 2}><Shuffle size={16} /> Shuffle turn order</button>
          </div>
          <form className="add-player" onSubmit={e => { e.preventDefault(); add() }}>
            <label className="field">
              <span>Name</span>
              <input className="input" value={name} maxLength={16} autoComplete="off" placeholder="Type a name"
                onChange={e => { setName(e.target.value); setNameError('') }} aria-describedby="name-err" />
            </label>
            <button className="plaque" type="submit" disabled={players.length >= 8}>Add player</button>
          </form>
          <p id="name-err" className="error-text" role="alert">{nameError}</p>

          {players.length === 0 && <p className="muted empty">Add everyone at the table. The list order is the turn order, so shuffle it or move people with the arrows.</p>}
          <ol className="player-list">
            {players.map((p, i) => (
              <li key={p.id} className="player-row" style={{ viewTransitionName: `p-${p.id}` }}>
                <span className="order num">{i + 1}</span>
                <Seal player={p} size={48} />
                <div className="player-row-main">
                  <strong>{p.name}</strong>
                  <span className="muted small">{PLAYER_COLORS.find(c => c.hex === p.color)?.name}, wearing a {ACCESSORIES[p.accessory].toLowerCase()}</span>
                </div>
                <div className="player-row-tools">
                  <button className="ghost small-btn" onClick={() => nextColor(p)} aria-label={`Change ${p.name}'s colour`}>
                    <i className="swatch" style={{ background: p.color }} /> Colour
                  </button>
                  <button className="ghost small-btn" onClick={() => update(p.id, { accessory: (p.accessory + 1) % ACCESSORIES.length, seed: randomSeed() })}
                    aria-label={`Restyle ${p.name}`}>Restyle</button>
                  <button className="ghost icon-btn" disabled={i === 0} onClick={() => moveBy(i, -1)} aria-label={`Move ${p.name} earlier`}><ArrowUp size={16} /></button>
                  <button className="ghost icon-btn" disabled={i === players.length - 1} onClick={() => moveBy(i, 1)} aria-label={`Move ${p.name} later`}><ArrowDown size={16} /></button>
                  <button className="ghost icon-btn" onClick={() => setPlayers(players.filter(x => x.id !== p.id))} aria-label={`Remove ${p.name}`}><Trash2 size={16} /></button>
                </div>
              </li>
            ))}
          </ol>
          {players.length === 1 && <p className="muted">Add at least one more player to open the bank.</p>}
        </section>

        <section className="panel" aria-labelledby="board-h">
          <h2 id="board-h" className="display">Board</h2>
          <div className="board-choices" role="radiogroup" aria-label="Board">
            {boards.map(b => (
              <button key={b.id} role="radio" aria-checked={b.id === boardId} className="board-choice" onClick={() => pickBoard(b.id)}>
                <strong>{b.name}</strong>
                <span className="muted small">{b.cells[39]?.name} tops the board at {money(b, b.cells[39]?.price ?? 0)}</span>
              </button>
            ))}
          </div>
          <p className="muted small">Own a different edition? <button className="link" onClick={() => ui.go('editor')}>Design your own board</button> and it will appear here.</p>
          <div className="two-col">
            <label className="field">
              <span>Starting cash</span>
              <input className="input num" type="number" inputMode="numeric" min={1} value={cash} onChange={e => setCash(e.target.value === '' ? '' : Math.max(0, +e.target.value))} />
              {!cashOk && <small className="error-text">Enter an amount above zero.</small>}
            </label>
            <label className="field">
              <span>Salary for passing Go</span>
              <input className="input num" type="number" inputMode="numeric" min={0} value={salary} onChange={e => setSalary(e.target.value === '' ? '' : Math.max(0, +e.target.value))} />
              {!salaryOk && <small className="error-text">Enter an amount, zero or more.</small>}
            </label>
          </div>
          <h2 className="display rules-h">House rules</h2>
          {RULES.map(r => (
            <Switch key={r.key} label={r.label} help={r.help} checked={rules[r.key]} onChange={v => setRules({ ...rules, [r.key]: v })} />
          ))}
        </section>
      </div>
    </main>
  )
}
