import { memo } from 'react'
import { housesLeft, hotelsLeft, money } from '../engine/engine.ts'
import type { Game, State } from '../engine/types.ts'
import { Pips } from './kit.tsx'

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
const breakable = (n: string) => n.replace(/\p{L}{10,}/gu, w => `${w.slice(0, Math.ceil(w.length / 2))}\u00AD${w.slice(Math.ceil(w.length / 2))}`)

const side = (i: number) => (i < 10 ? 'b' : i < 20 ? 'l' : i < 30 ? 't' : 'r')

function BoardMap({ game, state, onPick, highlight }: {
  game: Game; state: State; onPick: (cell: number) => void; highlight?: number
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
        const label = [
          c.name,
          c.price ? `price ${money(b, c.price)}` : '',
          ownerName ? `owned by ${ownerName}` : c.price ? 'unowned' : '',
          state.mortgaged[i] ? 'mortgaged' : '',
          state.level[i] === 5 ? 'hotel' : state.level[i] ? `${state.level[i]} houses` : '',
        ].filter(Boolean).join(', ')
        return (
          <button key={i} className={`cell cell-${c.kind} side-${side(i)}${i % 10 === 0 ? ' corner' : ''}${state.mortgaged[i] ? ' mortgaged' : ''}${highlight === i ? ' hl' : ''}`}
            style={{ gridRow: row, gridColumn: col, ['--owner' as string]: oc ?? 'transparent', ['--band' as string]: groupColor(c.group) ?? 'transparent' }}
            onClick={() => onPick(i)} aria-label={label} title={label}>
            {c.kind === 'property' && <i className="band" />}
            <span className="cell-name">{breakable(shortName(c.name))}</span>
            {c.price && !owner ? <span className="cell-price num">{money(b, c.price)}</span> : null}
            {owner && <i className="owner-dot" />}
            <Pips level={state.level[i]} />
          </button>
        )
      })}
      <div className="board-center">
        <p className="display board-wordmark">The Counting House</p>
        <div className="board-stats">
          {game.rules.freeParking && (
            <div><span className="eyebrow">Pot</span><strong className="num">{money(b, state.pot)}</strong><small className="muted">Paid by taxes and fines, won on Free Parking</small></div>
          )}
          <div><span className="eyebrow">Houses left</span><strong className="num">{housesLeft(game, state)}</strong><small className="muted">of {b.houses} in the bank</small></div>
          <div><span className="eyebrow">Hotels left</span><strong className="num">{hotelsLeft(game, state)}</strong><small className="muted">of {b.hotels} in the bank</small></div>
        </div>
        <p className="muted small">Tap a square to see its deed or record a landing</p>
      </div>
    </div>
  )
}

export default memo(BoardMap)
