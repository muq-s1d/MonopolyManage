import { memo, type ReactNode } from 'react'
import { housesLeft, hotelsLeft, money, pactFor, pactName } from '../engine/engine.ts'
import type { Game, State } from '../engine/types.ts'
import { Pips } from './kit.tsx'
import { reach } from '../engine/actions.ts'

/** Grid row and column (1 based) of cell i on an 11 by 11 board, Go at the bottom right. */
export function place(i: number): [number, number] {
  if (i === 0) return [11, 11]
  if (i < 10) return [11, 11 - i]
  if (i === 10) return [11, 1]
  if (i < 20) return [11 - (i - 10), 1]
  if (i === 20) return [1, 1]
  if (i < 30) return [1, 1 + (i - 20)]
  if (i === 30) return [1, 11]
  return [1 + (i - 30), 11]
}

export const shortName = (n: string) =>
  n.replace(/ (Avenue|Place|Road|Street|Gardens|Square)$/, '')
    .replace(/ Railroad$/, ' RR').replace(/ Station$/, ' Stn').replace('Community Chest', 'Chest')

// Soft hyphen inside long words, so tiny cells break them cleanly (hyphens: auto needs a dictionary many browsers lack).
const breakable = (n: string) => n.replace(/\p{L}{8,}/gu, w => `${w.slice(0, Math.ceil(w.length / 2))}\u00AD${w.slice(Math.ceil(w.length / 2))}`)

const side = (i: number) => (i < 10 ? 'b' : i < 20 ? 'l' : i < 30 ? 't' : 'r')

/** While a landing is due: the squares it can be (labelled as `reach` labels them) and what to tap. Empty otherwise. */
export function landing(game: Game, state: State, pid: string): { reach?: Record<number, number>; hint?: string } {
  const r = reach(game, state, pid)
  if (!Object.keys(r).length) return {}
  return { reach: r, hint: state.dest >= 0 ? 'Tap the star: the card sends you there' : state.back ? 'Tap the square the piece moved back to' : 'Tap the number you rolled' }
}

/**
 * The board, one button per square, with every player's token on the square they stand on.
 * `reach`: squares to light up for the landing being recorded: a dice total, a step back (negative), or 0 for a card's square.
 */
function BoardMap({ game, state, onPick, highlight, stage, reach, hint }: {
  game: Game; state: State; onPick: (cell: number) => void; highlight?: number; stage?: ReactNode
  reach?: Record<number, number>; hint?: string
}) {
  const b = game.board
  const color = (id: string | null) => game.players.find(p => p.id === id)?.color
  const groupColor = (g?: string) => b.groups.find(x => x.id === g)?.color
  return (
    <div className="board-map" role="group" aria-label={`${b.name} board. Pick a square.`}>
      {b.cells.map((c, i) => {
        const [row, col] = place(i)
        const owner = state.owner[i]
        const oc = color(owner)
        const ownerName = game.players.find(p => p.id === owner)?.name
        const pact = owner ? pactFor(game, state, i) : null
        const here = game.players.filter(p => !state.bankrupt[p.id] && (state.pos?.[p.id] ?? 0) === i)
        const dice = reach?.[i]
        const label = [
          c.name,
          c.price ? `price ${money(b, c.price)}` : '',
          ownerName ? `owned by ${ownerName}` : c.price ? 'unowned' : '',
          pact ? `shared in the ${pactName(b, pact)}` : '',
          state.mortgaged[i] ? 'mortgaged' : '',
          state.level[i] === 5 ? 'hotel' : state.level[i] ? `${state.level[i]} houses` : '',
          here.length ? `${here.map(p => p.name).join(' and ')} ${here.length === 1 ? 'is' : 'are'} here` : '',
          dice === undefined ? '' : dice > 0 ? `a roll of ${dice} lands here` : dice < 0 ? `${-dice} back` : 'the card sends you here',
        ].filter(Boolean).join(', ')
        return (
          <button key={i} className={`cell cell-${c.kind} side-${side(i)}${i % 10 === 0 ? ' corner' : ''}${state.mortgaged[i] ? ' mortgaged' : ''}${pact ? ' pooled' : ''}${highlight === i ? ' hl' : ''}${dice !== undefined ? ' reach' : ''}${reach && dice === undefined ? ' far' : ''}`}
            style={{ gridRow: row, gridColumn: col, ['--owner' as string]: oc ?? 'transparent', ['--band' as string]: groupColor(c.group) ?? 'transparent' }}
            onClick={() => onPick(i)} aria-label={label} title={label}>
            {c.kind === 'property' && <i className="band" />}
            <span className="cell-name">{breakable(shortName(c.name))}</span>
            {dice !== undefined ? <span className="reach-dice num" aria-hidden="true">{dice > 0 ? dice : dice < 0 ? `−${-dice}` : '★'}</span> : c.price && !owner ? <span className="cell-price num">{money(b, c.price)}</span> : null}
            {owner && <i className="owner-dot" />}
            <Pips level={state.level[i]} />
            {here.length > 0 && <span className="tokens" aria-hidden="true">{here.map(p => <i key={p.id} className={p.id === state.turn ? 'now' : ''} style={{ background: p.color }} />)}</span>}
          </button>
        )
      })}
      <div className={`board-center${stage ? ' has-stage' : ''}`}>
        {stage}
        {!hint && <p className="display board-wordmark">{game.players.length ? 'The Counting House' : b.name}</p>}
        {game.players.length > 0 && <div className="board-stats">
          {game.rules.freeParking && (
            <div><span className="eyebrow">Pot</span><strong className="num">{money(b, state.pot)}</strong></div>
          )}
          <div><span className="eyebrow">Houses left</span><strong className="num">{housesLeft(game, state)}</strong></div>
          <div><span className="eyebrow">Hotels left</span><strong className="num">{hotelsLeft(game, state)}</strong></div>
        </div>}
        {hint ? <p className="board-hint" role="status">{hint}</p> : !stage && !game.players.length && <p className="muted small">Tap a square to edit it</p>}
      </div>
    </div>
  )
}

/**
 * Big buttons for the squares a landing can be, one per dice total: thumb sized where a board square is not.
 * Each shows the total, the square, its colour and who owns it.
 */
export function DicePad({ game, state, reach, onPick }: { game: Game; state: State; reach: Record<number, number>; onPick: (cell: number) => void }) {
  const b = game.board
  const cells = Object.keys(reach).map(Number).sort((x, y) => Math.abs(reach[x]) - Math.abs(reach[y]))
  return (
    <div className="dice-pad" role="group" aria-label="Where did you land?">
      {cells.map(i => {
        const c = b.cells[i], d = reach[i], owner = game.players.find(p => p.id === state.owner[i])
        return (
          <button key={i} className="dice-key" onClick={() => onPick(i)}
            style={{ ['--band' as string]: b.groups.find(g => g.id === c.group)?.color ?? 'var(--line)', ['--owner' as string]: owner?.color ?? 'transparent' }}
            aria-label={`${d > 0 ? `Rolled ${d}` : d < 0 ? `${-d} back` : 'Where the card sends you'}: ${c.name}${owner ? `, owned by ${owner.name}` : ''}`}>
            <span className="num">{d > 0 ? d : d < 0 ? `−${-d}` : '★'}</span>
            <small>{shortName(c.name)}</small>
          </button>
        )
      })}
    </div>
  )
}

export default memo(BoardMap)
