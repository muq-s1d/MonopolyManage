import { useMemo, useRef, useState, type ReactElement } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { presets } from '../engine/boards.ts'
import { defaultRules, initialState, validateBoard, cardTitle } from '../engine/engine.ts'
import type { Board, Card, Cell, CellKind, Effect } from '../engine/types.ts'
import { customBoards, download } from '../store.ts'
import BoardMap from '../ui/BoardMap.tsx'
import { useUI } from '../ui/ctx.ts'

type Tab = 'board' | 'squares' | 'sets' | 'cards'
const TABS: { id: Tab; label: string }[] = [
  { id: 'board', label: 'Board and money' }, { id: 'squares', label: 'Squares' },
  { id: 'sets', label: 'Colour sets' }, { id: 'cards', label: 'Cards' },
]
const KINDS: { kind: CellKind; label: string }[] = [
  { kind: 'property', label: 'Property' }, { kind: 'railroad', label: 'Railroad or station' },
  { kind: 'utility', label: 'Utility' }, { kind: 'tax', label: 'Tax' }, { kind: 'chance', label: 'Chance' },
  { kind: 'chest', label: 'Community Chest' }, { kind: 'go', label: 'Go' }, { kind: 'jail', label: 'Jail' },
  { kind: 'parking', label: 'Free Parking' }, { kind: 'gotojail', label: 'Go to Jail' },
]
const EFFECTS: { type: Effect['type']; label: string }[] = [
  { type: 'collect', label: 'Collect from the bank' }, { type: 'pay', label: 'Pay a fine' },
  { type: 'collectEach', label: 'Collect from each player' }, { type: 'payEach', label: 'Pay each player' },
  { type: 'repairs', label: 'Repairs per house and hotel' }, { type: 'jail', label: 'Go to jail' },
  { type: 'jailCard', label: 'Get out of jail free' }, { type: 'advance', label: 'Advance to a square' },
  { type: 'nearest', label: 'Advance to the nearest railroad or utility' }, { type: 'move', label: 'Move (pick the square)' },
]
const RENT_LABELS = ['Base rent', '1 house', '2 houses', '3 houses', '4 houses', 'Hotel']

const uid = () => crypto.randomUUID().slice(0, 8)
const num = (v: string) => (v === '' ? NaN : Number(v))
const shown = (n: number | undefined) => (n === undefined || Number.isNaN(n) ? '' : n)

function freshCell(kind: CellKind, name: string, b: Board): Cell {
  switch (kind) {
    case 'property': return { kind, name, group: b.groups[0]?.id, price: 100, houseCost: 50, rents: [6, 30, 90, 270, 400, 550] }
    case 'railroad': return { kind, name, price: 200 }
    case 'utility': return { kind, name, price: 150 }
    case 'tax': return { kind, name, amount: 100 }
    default: return { kind, name }
  }
}

function freshEffect(type: Effect['type']): Effect {
  switch (type) {
    case 'collect': case 'pay': case 'collectEach': case 'payEach': return { type, amount: 50 }
    case 'repairs': return { type, house: 25, hotel: 100 }
    case 'advance': return { type, cell: 0 }
    case 'nearest': return { type, kind: 'railroad' }
    default: return { type }
  }
}

function Field({ label, error, id, children }: { label: string; error?: string; id: string; children: ReactElement }) {
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      {children}
      {error && <small id={`${id}-err`} className="error-text">{error}</small>}
    </label>
  )
}

function NumInput({ id, value, onChange, error, min = 0, label }: { id?: string; value: number | undefined; onChange: (n: number) => void; error?: string; min?: number; label?: string }) {
  return <input id={id} aria-label={label} className="input num" type="number" inputMode="numeric" min={min} value={shown(value)}
    aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined} onChange={e => onChange(num(e.target.value))} />
}

// ---------- start screen: pick a board to draft from ----------

function Start({ open }: { open: (b: Board) => void }) {
  const ui = useUI()
  const [saved, setSaved] = useState(customBoards.list)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [error, setError] = useState('')
  const file = useRef<HTMLInputElement>(null)

  const importFile = async (f?: File) => {
    if (!f) return
    try {
      const b = JSON.parse(await f.text()) as Board
      if (!Array.isArray(b?.cells) || !Array.isArray(b.groups) || !Array.isArray(b.chance) || !Array.isArray(b.chest) || typeof b.name !== 'string')
        return setError('That file is not a board from the drafting room.')
      open({ ...b, id: `custom-${uid()}` })
    } catch { setError('That file is not valid JSON.') }
  }

  return (
    <main className="setup">
      <header className="setup-head">
        <button className="ghost" onClick={() => ui.go('lobby')}>Back</button>
        <div><p className="eyebrow">Custom boards</p><h1 className="display">The drafting room</h1></div>
        <span />
      </header>
      <div className="setup-grid">
        <section className="panel">
          <h2 className="display">Start from a classic</h2>
          <p className="muted">Copy a standard board, then rename streets, change prices and rents, recolour the sets and rewrite the cards to match your edition.</p>
          <div className="board-choices">
            {presets.map(b => (
              <button key={b.id} className="board-choice" onClick={() => open({ ...structuredClone(b), id: `custom-${uid()}`, name: `${b.name} (my edition)` })}>
                <strong>{b.name}</strong><span className="muted small">40 squares, {b.groups.length} colour sets, {b.chance.length + b.chest.length} cards</span>
              </button>
            ))}
          </div>
          <div className="btn-row">
            <button className="ghost" onClick={() => file.current?.click()}>Import a board file</button>
            <input ref={file} type="file" accept="application/json,.json" hidden onChange={e => importFile(e.target.files?.[0])} />
          </div>
          {error && <p className="error-text" role="alert">{error}</p>}
        </section>
        <section className="panel">
          <h2 className="display">Your boards</h2>
          {saved.length === 0 && <p className="muted">Boards you save appear here and in the board list when seating a new table.</p>}
          <ul className="saved-boards">
            {saved.map(b => (
              <li key={b.id}>
                <strong>{b.name}</strong>
                {confirm === b.id ? (
                  <span className="confirm-inline" role="alert">Delete it?
                    <button className="ghost" onClick={() => setConfirm(null)}>Keep</button>
                    <button className="plaque danger" onClick={() => { customBoards.remove(b.id); setSaved(customBoards.list()); setConfirm(null) }}>Delete</button>
                  </span>
                ) : (
                  <span className="btn-row tight">
                    <button className="ghost" onClick={() => open(structuredClone(b))}>Edit</button>
                    <button className="ghost" onClick={() => download(`${b.name.replace(/\W+/g, '-').toLowerCase()}.json`, JSON.stringify(b, null, 1))}>Download</button>
                    <button className="ghost danger" onClick={() => setConfirm(b.id)}>Delete</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="muted small">Games already in progress keep their own copy of the board, so editing here never changes a running game.</p>
        </section>
      </div>
    </main>
  )
}

// ---------- the editor ----------

export default function BoardEditor() {
  const ui = useUI()
  const [board, setBoard] = useState<Board | null>(null)
  const [tab, setTab] = useState<Tab>('board')
  const [sel, setSel] = useState(1)
  const [deck, setDeck] = useState<'chance' | 'chest'>('chance')
  const [dirty, setDirty] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [savedAt, setSavedAt] = useState(0)

  const errors = useMemo(() => (board ? validateBoard(board) : {}), [board])
  const preview = useMemo(() => {
    if (!board) return null
    const game = { id: 'preview', createdAt: 0, board, rules: defaultRules, players: [] }
    return { game, state: initialState(game) }
  }, [board])

  if (!board || !preview) return <Start open={b => { setBoard(b); setDirty(false); setTab('board') }} />

  const up = (fn: (b: Board) => void) => { setBoard(b => { const n = structuredClone(b!); fn(n); return n }); setDirty(true) }
  const keys = Object.keys(errors)
  const cell = board.cells[sel]
  const ce = (f: string) => errors[`cell.${sel}.${f}`]
  const rails = board.cells.filter(c => c.kind === 'railroad').length
  const utils = board.cells.filter(c => c.kind === 'utility').length

  const jump = (k: string) => {
    const [a, b] = k.split('.')
    if (a === 'cell') { setTab('squares'); setSel(+b) }
    else if (a === 'group') setTab('sets')
    else if (a === 'chance' || a === 'chest') { setTab('cards'); setDeck(a) }
    else if (a === 'jail' || a === 'cells') setTab('squares')
    else setTab('board')
  }

  const save = () => {
    if (keys.length) return
    customBoards.save(board)
    setDirty(false)
    setSavedAt(Date.now())
  }

  return (
    <main className="setup editor">
      <header className="setup-head">
        {leaving ? (
          <span className="confirm-inline" role="alert">Leave without saving?
            <button className="ghost" onClick={() => setLeaving(false)}>Stay</button>
            <button className="plaque danger" onClick={() => setBoard(null)}>Discard</button>
          </span>
        ) : <button className="ghost" onClick={() => (dirty ? setLeaving(true) : setBoard(null))}>All boards</button>}
        <div><p className="eyebrow">The drafting room</p><h1 className="display">{board.name || 'Untitled board'}</h1></div>
        <button className="plaque big" disabled={keys.length > 0} onClick={save}>{dirty || !savedAt ? 'Save board' : 'Saved'}</button>
      </header>

      {keys.length > 0 ? (
        <section className="error-summary" role="alert" aria-labelledby="err-h">
          <h2 id="err-h" className="eyebrow">{keys.length} {keys.length === 1 ? 'thing needs' : 'things need'} fixing before this board can be saved</h2>
          <ul>{keys.slice(0, 8).map(k => <li key={k}><button className="link" onClick={() => jump(k)}>{k.startsWith('cell.') ? `${board.cells[+k.split('.')[1]]?.name || `Square ${+k.split('.')[1] + 1}`}: ` : ''}{errors[k]}</button></li>)}</ul>
          {keys.length > 8 && <p className="muted small">And {keys.length - 8} more.</p>}
        </section>
      ) : savedAt > 0 && !dirty ? <p className="muted center-text" role="status">Saved. Pick it from the board list when you seat a new table.</p> : null}

      <div className="chips tabs" role="tablist" aria-label="Editor sections">
        {TABS.map(t => <button key={t.id} role="tab" aria-selected={tab === t.id} className="ghost" aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>

      {tab === 'board' && (
        <section className="panel" role="tabpanel">
          <div className="two-col">
            <Field label="Board name" id="b-name" error={errors.name}>
              <input id="b-name" className="input" value={board.name} maxLength={40} onChange={e => up(b => { b.name = e.target.value })} />
            </Field>
            <Field label="Currency symbol" id="b-cur" error={errors.currency}>
              <input id="b-cur" className="input" value={board.currency} maxLength={3} onChange={e => up(b => { b.currency = e.target.value })} />
            </Field>
            <Field label="Starting cash" id="b-cash" error={errors.startingCash}><NumInput id="b-cash" value={board.startingCash} error={errors.startingCash} onChange={n => up(b => { b.startingCash = n })} /></Field>
            <Field label="Salary for passing Go" id="b-sal" error={errors.salary}><NumInput id="b-sal" value={board.salary} error={errors.salary} onChange={n => up(b => { b.salary = n })} /></Field>
            <Field label="Fine to leave jail" id="b-fine" error={errors.jailFine}><NumInput id="b-fine" value={board.jailFine} error={errors.jailFine} onChange={n => up(b => { b.jailFine = n })} /></Field>
            <Field label="Houses in the bank" id="b-h" error={errors.houses}><NumInput id="b-h" value={board.houses} error={errors.houses} onChange={n => up(b => { b.houses = n })} /></Field>
            <Field label="Hotels in the bank" id="b-ho" error={errors.hotels}><NumInput id="b-ho" value={board.hotels} error={errors.hotels} onChange={n => up(b => { b.hotels = n })} /></Field>
          </div>
          <hr className="rule" />
          <h2 className="display">Railroad rent</h2>
          <p className="muted small">Rent when the owner holds this many railroads or stations. This board has {rails}.</p>
          <div className="two-col">
            {Array.from({ length: Math.max(rails, 1) }, (_, i) => (
              <Field key={i} label={`Owning ${i + 1}`} id={`rr-${i}`}><NumInput id={`rr-${i}`} value={board.railroadRents[i]} onChange={n => up(b => { b.railroadRents[i] = n })} /></Field>
            ))}
          </div>
          {errors.railroadRents && <p className="error-text">{errors.railroadRents}</p>}
          <h2 className="display">Utility rent</h2>
          <p className="muted small">Rent is the dice total times this number, by how many utilities the owner holds. This board has {utils}.</p>
          <div className="two-col">
            {Array.from({ length: Math.max(utils, 1) }, (_, i) => (
              <Field key={i} label={`Owning ${i + 1}: dice times`} id={`ut-${i}`}><NumInput id={`ut-${i}`} value={board.utilityMultipliers[i]} onChange={n => up(b => { b.utilityMultipliers[i] = n })} /></Field>
            ))}
          </div>
          {errors.utilityMultipliers && <p className="error-text">{errors.utilityMultipliers}</p>}
        </section>
      )}

      {tab === 'squares' && (
        <div className="editor-squares" role="tabpanel">
          <div>
            <BoardMap game={preview.game} state={preview.state} onPick={setSel} highlight={sel} />
            {(errors.jail || errors.cells) && <p className="error-text">{errors.jail ?? errors.cells}</p>}
          </div>
          <section className="panel" aria-labelledby="sq-h">
            <div className="section-head">
              <h2 id="sq-h" className="display">Square {sel + 1}</h2>
              <span className="btn-row tight">
                <button className="ghost" onClick={() => setSel((sel + 39) % 40)}>Previous</button>
                <button className="ghost" onClick={() => setSel((sel + 1) % 40)}>Next</button>
              </span>
            </div>
            <div className="two-col">
              <Field label="Type" id="c-kind" error={ce('kind')}>
                <select id="c-kind" className="input" value={cell.kind} onChange={e => up(b => { b.cells[sel] = freshCell(e.target.value as CellKind, cell.name, b) })}>
                  {KINDS.map(k => <option key={k.kind} value={k.kind}>{k.label}</option>)}
                </select>
              </Field>
              <Field label="Name" id="c-name" error={ce('name')}>
                <input id="c-name" className="input" value={cell.name} maxLength={32} onChange={e => up(b => { b.cells[sel].name = e.target.value })} />
              </Field>
              {cell.kind === 'property' && (
                <Field label="Colour set" id="c-group" error={ce('group')}>
                  <select id="c-group" className="input" value={cell.group ?? ''} onChange={e => up(b => { b.cells[sel].group = e.target.value })}>
                    <option value="" disabled>Pick one</option>
                    {board.groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </Field>
              )}
              {(cell.kind === 'property' || cell.kind === 'railroad' || cell.kind === 'utility') && (
                <Field label="Price" id="c-price" error={ce('price')}><NumInput id="c-price" value={cell.price} error={ce('price')} onChange={n => up(b => { b.cells[sel].price = n })} /></Field>
              )}
              {cell.kind === 'property' && (
                <Field label="Cost per house" id="c-hc" error={ce('houseCost')}><NumInput id="c-hc" value={cell.houseCost} error={ce('houseCost')} onChange={n => up(b => { b.cells[sel].houseCost = n })} /></Field>
              )}
              {cell.kind === 'tax' && (
                <Field label="Tax amount" id="c-tax" error={ce('amount')}><NumInput id="c-tax" value={cell.amount} error={ce('amount')} onChange={n => up(b => { b.cells[sel].amount = n })} /></Field>
              )}
            </div>
            {cell.kind === 'property' && (
              <fieldset className="rent-grid">
                <legend className="eyebrow">Rent</legend>
                {RENT_LABELS.map((l, j) => (
                  <Field key={j} label={l} id={`c-r${j}`}><NumInput id={`c-r${j}`} value={cell.rents?.[j]} onChange={n => up(b => { b.cells[sel].rents![j] = n })} /></Field>
                ))}
                {ce('rents') && <p className="error-text span-all">{ce('rents')}</p>}
                <p className="muted small span-all">Mortgage value is always half the price.</p>
              </fieldset>
            )}
          </section>
        </div>
      )}

      {tab === 'sets' && (
        <section className="panel" role="tabpanel">
          <p className="muted">A colour set is the group of properties someone must own completely before building. Assign properties to sets on the Squares tab.</p>
          <ul className="group-list">
            {board.groups.map((g, i) => {
              const used = board.cells.filter(c => c.kind === 'property' && c.group === g.id).length
              return (
                <li key={g.id}>
                  <input type="color" className="color-input" value={g.color} aria-label={`${g.name} colour`} onChange={e => up(b => { b.groups[i].color = e.target.value.toUpperCase() })} />
                  <input className="input" value={g.name} maxLength={24} aria-label="Set name" onChange={e => up(b => { b.groups[i].name = e.target.value })} />
                  <span className="muted small">{used} {used === 1 ? 'property' : 'properties'}</span>
                  <button className="ghost icon-btn" disabled={used > 0} title={used ? 'Move its properties to another set first' : ''}
                    onClick={() => up(b => { b.groups.splice(i, 1) })} aria-label={`Remove ${g.name}`}><Trash2 size={16} /></button>
                  {errors[`group.${g.id}`] && <small className="error-text span-all">{errors[`group.${g.id}`]}</small>}
                </li>
              )
            })}
          </ul>
          <button className="ghost" onClick={() => up(b => { b.groups.push({ id: `g-${uid()}`, name: 'New set', color: '#6B8E7A' }) })}><Plus size={16} /> Add a colour set</button>
        </section>
      )}

      {tab === 'cards' && (
        <section className="panel" role="tabpanel">
          <div className="chips">
            <button className="ghost" aria-pressed={deck === 'chance'} onClick={() => setDeck('chance')}>Chance ({board.chance.length})</button>
            <button className="ghost" aria-pressed={deck === 'chest'} onClick={() => setDeck('chest')}>Community Chest ({board.chest.length})</button>
          </div>
          <p className="muted small">Write {'{cell}'} in a title to show the name of the square an advance card moves to.</p>
          <ol className="card-edit-list">
            {board[deck].map((c, i) => <CardRow key={i} board={board} card={c} error={errors[`${deck}.${i}`]}
              set={card => up(b => { b[deck][i] = card })} remove={() => up(b => { b[deck].splice(i, 1) })} />)}
          </ol>
          <button className="ghost" onClick={() => up(b => { b[deck].push({ title: 'New card', effect: { type: 'collect', amount: 50 } }) })}><Plus size={16} /> Add a card</button>
        </section>
      )}
    </main>
  )
}

function CardRow({ board, card, set, remove, error }: { board: Board; card: Card; set: (c: Card) => void; remove: () => void; error?: string }) {
  const f = card.effect
  const eff = (patch: Partial<Effect>) => set({ ...card, effect: { ...f, ...patch } as Effect })
  return (
    <li className="card-edit">
      <input className="input" value={card.title} maxLength={80} aria-label="Card title" onChange={e => set({ ...card, title: e.target.value })} />
      <select className="input" value={f.type} aria-label="What the card does" onChange={e => set({ ...card, effect: freshEffect(e.target.value as Effect['type']) })}>
        {EFFECTS.map(x => <option key={x.type} value={x.type}>{x.label}</option>)}
      </select>
      {'amount' in f && <NumInput label="Amount" value={f.amount} onChange={n => eff({ amount: n })} />}
      {f.type === 'repairs' && (
        <span className="pair">
          <NumInput label="Per house" value={f.house} onChange={n => eff({ house: n })} /><small className="muted">per house</small>
          <NumInput label="Per hotel" value={f.hotel} onChange={n => eff({ hotel: n })} /><small className="muted">per hotel</small>
        </span>
      )}
      {f.type === 'advance' && (
        <select className="input" value={f.cell} aria-label="Square" onChange={e => eff({ cell: +e.target.value })}>
          {board.cells.map((c, i) => <option key={i} value={i}>{i + 1}. {c.name}</option>)}
        </select>
      )}
      {f.type === 'nearest' && (
        <select className="input" value={f.kind} aria-label="Nearest what" onChange={e => eff({ kind: e.target.value as 'railroad' | 'utility' })}>
          <option value="railroad">Railroad (double rent)</option><option value="utility">Utility (ten times the dice)</option>
        </select>
      )}
      <button className="ghost icon-btn" onClick={remove} aria-label={`Remove ${cardTitle(board, card)}`}><Trash2 size={16} /></button>
      {error && <small className="error-text span-all">{error}</small>}
    </li>
  )
}
